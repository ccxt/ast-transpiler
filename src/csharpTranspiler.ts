import { BaseTranspiler } from "./baseTranspiler.js";
import { SyntaxKind, NodeFlags, type Node, type ParameterDeclaration } from 'typescript/unstable/ast';
import { IndexKind, TypeFlags, type Checker, type Program, type Symbol as TsSymbol, type UnionType } from 'typescript/unstable/sync';
import { isArrayLiteralExpression, isAsExpression, isBinaryExpression, isBlock, isBooleanLiteral, isBreakStatement, isCallExpression, isClassDeclaration, isClassExpression, isClassLikeDeclaration, isContinueStatement, isDeleteExpression, isElementAccessExpression, isExpressionStatement, isForStatement, isFunctionExpression, isIdentifier, isIfStatement, isMethodDeclaration, isNumericLiteral, isObjectLiteralExpression, isParameterDeclaration, isParenthesizedExpression, isPostfixUnaryExpression, isPrefixUnaryExpression, isPropertyAccessExpression, isPropertyDeclaration, isPropertySignatureDeclaration, isReturnStatement, isSourceFile, isSpreadAssignment, isSpreadElement, isStringLiteral, isStringLiteralLikeNode, isThrowStatement, isTypeAssertion, isVariableDeclaration, isWhileStatement } from 'typescript/unstable/ast/is';
import { findAncestor, getAllSuperTypeNodes, isFunctionLike } from './tsUtils.js';
import fs from 'fs';
import path from 'path';

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
    // BaseMethods.cs declares these `double?` too (safeNumber 6174, safeNumber2 3857,
    // safeNumberOmitZero 1542); they were the only double-returning accessors left out
    'safeNumber': 'double?',
    'safeNumber2': 'double?',
    'safeNumberOmitZero': 'double?',
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
const CSHARP_SAFE_ACCESSOR_NAMES = Object.keys(CSHARP_THIS_RETURN_TYPES).filter((name) => name.startsWith('safe'));

// hand-written `cs/ccxt/base` producers whose C# signature is a string box (verified against the
// declarations: decimalToPrecision/numberToString/implodeParams/totp/intToBase16/binaryToBase16/
// stringToBase64/uuid22 -> `string`, the *ToPrecision trio -> `string?`). A call to one of them IS
// that string, so a return needs no unbox and a `+` around it binds the same overload `add` does.
// Kept apart from CSHARP_THIS_RETURN_TYPES so the local/condition families keep their behaviour.
const CSHARP_PRINTED_STRING_HELPERS = new Set([
    'decimalToPrecision', 'numberToString', 'implodeParams', 'totp', 'intToBase16',
    'binaryToBase16', 'stringToBase64', 'uuid22', 'amountToPrecision', 'priceToPrecision', 'costToPrecision',
]);

// calls whose C# signature is a hand-written `bool` (isTrue, isEqual, isGreaterThan, ...,
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

// the printed types a later write of a nullable scalar local may store without changing the
// runtime box: the non-null twin converts implicitly and a `Nullable<T>` boxes as its `T`
const CSHARP_NULLABLE_WIDENING: { [name: string]: string[] } = {
    'string?': [ 'string' ],
    'bool?': [ 'bool' ],
    'Int64?': [ 'Int64', 'int' ],
    'double?': [ 'double', 'Int64', 'int' ],
};

// option keys documented as booleans, each written only as a bool (the venue's `options` entry or
// the parameter default): a read on them answers a bool whenever its default argument is one
const CSHARP_BOOL_OPTION_KEYS = [ 'useDepthEndpoint', 'warnOnCancelAllOrdersWithOutcome', 'paginate', 'removeRepeated' ];

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
// the `this.safe*` readers whose key (argument 1) a for-counter may feed: they normalise the box
const CSHARP_COUNTER_KEYED_CALLS = [ 'safeDict', 'safeList', 'safeValue', 'safeString', 'safeInteger', 'safeNumber' ];
const CSHARP_EQUALITY_TOKENS = [ SyntaxKind.EqualsEqualsToken, SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken ];
const CSHARP_COUNTER_COMPARISONS = [
    SyntaxKind.LessThanToken, SyntaxKind.LessThanEqualsToken, SyntaxKind.GreaterThanToken, SyntaxKind.GreaterThanEqualsToken,
    SyntaxKind.EqualsEqualsToken, SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken,
];

// kinds a native slice clamp can reproduce: the integer ones, and the nullable spellings whose
// null the helper truncates to 0
const CSHARP_SLICE_BOUND_KINDS = [ 'int', 'Int64', 'int?', 'Int64?' ];

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

// a member of the hand-written runtime as the embedding build layer reads it from the
// C# declaration. `type` is the declared type text and `initializer` its initializer; `routed` marks a
// property whose accessors hand the value to an owner (the ws caches); `refresh` names the hand-written
// method that re-derives the typed views below after any write of the member; `views` maps a literal
// key of the member to the hand-written typed property reading that entry (`urls['api']` ->
// `urlsApi`) and, when declared, the property typing its sections (`urlsApiSections`).
export interface CsharpDeclaredMember {
    type: string;
    initializer?: string;
    routed?: boolean;
    refresh?: string;
    views?: { [key: string]: { view: string, sections?: string } };
    dictView?: string;
}

// the printer reads the hand-written runtime's member declarations from a ccxt checkout
// (`<root>/cs/ccxt/base/Exchange.Options.cs` for `this.<name>`, `<root>/cs/ccxt/ws/Client.cs` class
// WebSocketClient for `client.<name>`) so a member whose declaration changes follows it with no table:
//   - a `Dictionary` / `IDictionary` / `OwnedTable<object>` / `List<object>` member gets the native
//     ContainsKey / Count / indexer forms; an `object` member stays on the helpers unless every write in the
//     source file stores a dictionary
//   - a property whose accessors call `wrapWsCache` is owner-routed (the ws caches): `routed`
//   - a member `M` with a declared `M<Key>Sections` property (`urlsApiSections`: a dictionary of dictionaries)
//     exposes the typed view of `M['<key>']` entries, and a declared method `Refresh<M>Views()` is the
//     refresh every write of `M` owes that view
// Without a checkout next to the source file (in-memory transpile) nothing is declared and every member
// keeps the helpers; an embedding layer can still answer through the csharpDeclaredMemberType hook.
const CSHARP_DECLARED_MEMBER_FILES = {
    'this': [ 'cs', 'ccxt', 'base', 'Exchange.Options.cs' ],
    'client': [ 'cs', 'ccxt', 'ws', 'Client.cs' ],
};
const CSHARP_DECLARED_MEMBER_CLASS = { 'this': undefined, 'client': 'class WebSocketClient' };
const CSHARP_DECLARED_TYPE = '[A-Za-z_][\\w.]*(?:<[^(){}=;]*?>)?(?:\\[\\])?\\??';
const CSHARP_DECLARED_LINE = new RegExp('^[ \\t]*public[ \\t]+(?:(?:static|readonly|virtual|override|new|unsafe)[ \\t]+)*(' + CSHARP_DECLARED_TYPE + ')[ \\t]+([A-Za-z_]\\w*)[ \\t]*(.*)$');
const csharpDeclaredMemberTables = new Map<string, Map<string, CsharpDeclaredMember>>();
const csharpDeclaredMethodTables = new Map<string, Map<string, Set<string>>>();

// the ccxt checkout root of a source file under `<root>/ts/src/` (a relative name resolves from the cwd)
function csharpRuntimeRoot(node): string | undefined {
    const fileName = String(node?.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
    const marker = 'ts/src/';
    const at = fileName.lastIndexOf(marker);
    if (at < 0 || (at > 0 && fileName[at - 1] !== '/')) {
        return undefined;
    }
    return path.resolve(fileName.substring(0, at) || '.');
}

function csharpBraceBlock(lines: string[], from: number): string {
    let depth = 0;
    let seen = false;
    let text = '';
    for (let i = from; i < lines.length; i++) {
        text += lines[i] + '\n';
        for (const ch of lines[i]) {
            if (ch === '{') {
                depth++;
                seen = true;
            } else if (ch === '}') {
                depth--;
            }
        }
        if (seen && depth <= 0) {
            break;
        }
    }
    return text;
}

function csharpReadDeclaredMembers(root: string, owner: 'this' | 'client'): Map<string, CsharpDeclaredMember> {
    const file = path.join(root, ...CSHARP_DECLARED_MEMBER_FILES[owner]);
    const cached = csharpDeclaredMemberTables.get(file);
    if (cached !== undefined) {
        return cached;
    }
    const table = new Map<string, CsharpDeclaredMember>();
    csharpDeclaredMemberTables.set(file, table);
    let content: string;
    try {
        content = fs.readFileSync(file, 'utf8');
    } catch (e) {
        return table; // no hand-written declaration to read: every member keeps the helpers
    }
    const whole = content;
    const marker = CSHARP_DECLARED_MEMBER_CLASS[owner];
    if (marker !== undefined) {
        const at = content.indexOf(marker);
        content = (at < 0) ? '' : content.slice(at);
    }
    const lines = content.split('\n');
    const members = new Map<string, { type: string, initializer?: string, routed: boolean }>();
    for (let i = 0; i < lines.length; i++) {
        const match = CSHARP_DECLARED_LINE.exec(lines[i]);
        if (match === null || /^(?:class|enum|interface|struct|delegate|event|const)$/.test(match[1])) {
            continue;
        }
        const [ , type, name, rest ] = match;
        if (rest.startsWith('(')) {
            continue; // a method
        }
        let initializer: string | undefined;
        let routed = false;
        if (rest.startsWith('=')) {
            initializer = rest.slice(1).replace(/;.*$/, '').trim();
        } else if (rest.startsWith('{')) {
            const block = csharpBraceBlock(lines, i);
            routed = block.includes('wrapWsCache');
            const after = /\}\s*=\s*([^;]*);/.exec(block.split('\n')[0]);
            initializer = (after === null) ? undefined : after[1].trim();
        } else if (rest === '') {
            routed = csharpBraceBlock(lines, i + 1).includes('wrapWsCache');
        }
        if (!members.has(name)) {
            members.set(name, { type: type.replace(/\s+/g, ' ').trim(), initializer, routed });
        }
    }
    const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
    for (const [ name, declared ] of members) {
        const entry: CsharpDeclaredMember = { type: declared.type, initializer: declared.initializer, routed: declared.routed };
        const views: { [key: string]: { view: string, sections?: string } } = {};
        for (const [ view, other ] of members) {
            const match = new RegExp('^' + name + '([A-Z]\\w*)Sections$').exec(view);
            if (match !== null && /^Dictionary<string,\s*IDictionary<string,\s*object>>$/.test(other.type)) {
                views[match[1].charAt(0).toLowerCase() + match[1].slice(1)] = { view: name + match[1], sections: view };
            }
        }
        if (Object.keys(views).length > 0) {
            entry.views = views;
        }
        // an `object` member with a declared `<name>Dict` property typed as the string-keyed dictionary
        const dictView = members.get(name + 'Dict');
        if (declared.type === 'object' && dictView !== undefined && /^IDictionary<string,\s*object>$/.test(dictView.type)) {
            entry.dictView = name + 'Dict';
        }
        if (new RegExp('public\\s+void\\s+Refresh' + capital(name) + 'Views\\s*\\(\\s*\\)').test(whole)) {
            entry.refresh = 'Refresh' + capital(name) + 'Views';
        }
        table.set(name, entry);
    }
    return table;
}

// the return types the NON-generated files of <root>/cs/ccxt/base declare per method name
function csharpReadDeclaredMethodReturns(root: string): Map<string, Set<string>> {
    const folder = path.join(root, 'cs', 'ccxt', 'base');
    const cached = csharpDeclaredMethodTables.get(folder);
    if (cached !== undefined) {
        return cached;
    }
    const table = new Map<string, Set<string>>();
    csharpDeclaredMethodTables.set(folder, table);
    let names: string[] = [];
    try {
        names = fs.readdirSync(folder).filter((file) => file.endsWith('.cs'));
    } catch (e) {
        return table;
    }
    for (const file of names) {
        let content: string;
        try {
            content = fs.readFileSync(path.join(folder, file), 'utf8');
        } catch (e) {
            continue;
        }
        if (content.includes('PLEASE DO NOT EDIT THIS FILE, IT IS GENERATED')) {
            continue; // generated: the TS annotation drives these signatures
        }
        for (const line of content.split('\n')) {
            const match = CSHARP_DECLARED_LINE.exec(line);
            if (match !== null && match[3].startsWith('(')) {
                const seen = table.get(match[2]) ?? new Set<string>();
                seen.add(match[1].replace(/\s+/g, ' ').trim());
                table.set(match[2], seen);
            }
        }
    }
    return table;
}

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

// Hand-written BaseExchange fields whose reads print natively although the key may be absent:
// `has`/`options` are concrete dictionaries; `urls`, `markets`, `exceptions` are `object` boxes
// that always hold one. The native read tests the key, so a missing key still reads null.
const CSHARP_MISSING_KEY_FIELDS_NATIVE = [ 'has', 'options', 'urls', 'markets', 'exceptions' ];

// the collection kind of a declared C# type: the string-keyed dictionaries and the object lists the
// helpers (getValue / inOp / getArrayLength) have native member twins for
const CSHARP_DICT_DECLARATION = /^(?:ccxt\.pro\.)?(?:(?:I|Concurrent)?Dictionary<string,\s*object>|OwnedTable<object>|dict)$/;
const CSHARP_LIST_DECLARATION = /^I?List<object>$/;

// hand-written BaseExchange members declared `IDictionary<string, object>` (cs/ccxt/base/Exchange.Options.cs):
// the `(IDictionary<string, object>)` cast on a read is an identity conversion. They may still be null
// (initializeProperties leaves a member unset when describe() has no such row), so reads carry a null test
const CSHARP_DECLARED_DICT_FIELDS = [ 'requiredCredentials' ];

// typed dictionary views the hand-written base declares over a member that stays `object`
// (Exchange.Options.cs): `currencies` -> `currenciesDict` (every writer stores a string-keyed dictionary),
// and `urls['api']` -> `urlsApi` (a Dict in the TS base declaration, `urls: { api: Dict }`)
const CSHARP_DICT_FIELD_VIEWS: { [field: string]: string } = { 'currencies': 'currenciesDict' };
const CSHARP_DICT_ENTRY_VIEWS: { [field: string]: { [key: string]: string } } = { 'urls': { 'api': 'urlsApi' } };

// hand-written members declared `IDictionary<string, object>` whose copy into a local names the declared type
const CSHARP_DECLARED_DICT_COPY_FIELDS = [ 'currencies_by_id' ];

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

// hand-written BaseExchange fields declared a non-nullable C# number (Exchange.Options.cs):
// `public double rateLimit = 2000;` / `public double rollingWindowSize = 0.0;`. A read of one is
// already that number, so `==` against a literal it holds is isEqual's integer/double branch.
// precisionMode is an `object` box holding the mode constants, so it keeps the helper.
const CSHARP_SCALAR_FIELD_KINDS: { [name: string]: string } = {
    'rateLimit': 'double',
    'rollingWindowSize': 'double',
};

// arithmetic prints that still call a runtime helper: such an operand is not native arithmetic,
// so an isEqual around it keeps its own helper too
const CSHARP_HELPER_ARITHMETIC_OPENERS = [ 'mod(', 'add(', 'subtract(', 'multiply(', 'divide(', 'callDynamically(' ];

// a printed expression with the parentheses that wrap the WHOLE text removed (`((a % b))` -> `a % b`)
function csharpStripOuterParens(text: string): string {
    let stripped = text.trim();
    while (stripped.startsWith('(') && stripped.endsWith(')')) {
        let depth = 0;
        let whole = true;
        for (let i = 0; i < stripped.length; i++) {
            if (stripped[i] === '(') {
                depth++;
            } else if (stripped[i] === ')') {
                depth--;
                if ((depth === 0) && (i < stripped.length - 1)) {
                    whole = false;
                    break;
                }
            }
        }
        if (!whole) {
            break;
        }
        stripped = stripped.substring(1, stripped.length - 1).trim();
    }
    return stripped;
}

// C# collection types this printer can name whose members replace the helpers
const CSHARP_NATIVE_COLLECTION_TYPES = [ 'List<object>', 'IList<object>', 'Dictionary<string, object>', 'IDictionary<string, object>' ];

// C# types isEqual's own branches can compare an element with: the box an element read
// yields is unboxed with `as`, which answers null for every other box
const CSHARP_SCALAR_ELEMENT_BOOL = 1;
const CSHARP_SCALAR_ELEMENT_STRING = 2;

// C# dictionary types this printer can name on a local
const CSHARP_NATIVE_DICTIONARY_TYPES = [ 'Dictionary<string, object>', 'IDictionary<string, object>' ];


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

// the value a non-literal slice bound contributes: a nullable one reads 0 when null, the number
// the helper's truncation answers for a null bound
function csharpSliceBoundValue(bound) {
    if (bound.kind === 'int?') {
        return `(${bound.text} ?? 0)`;
    }
    if (bound.kind === 'Int64?') {
        return `(${bound.text} ?? 0L)`;
    }
    return bound.text;
}

// market/currency row locals: their literal-key reads print natively when the declared table
// proves a dictionary; the generic declared-collection read rule leaves them alone
const CSHARP_MARKET_RECEIVER_NAMES = [ 'market', 'currency' ];
// base readers that take a dictionary row as their first argument; function kinds that bind their own names
const CSHARP_ELEMENT_ROW_READERS = [ 'safeString', 'safeInteger', 'safeNumber', 'safeFloat', 'safeBool', 'safeDict', 'safeList', 'safeValue', 'safeStringLower', 'safeStringUpper', 'safeIntegerProduct' ];
// the generated implicit-API abstract classes: ts/src/abstract/<ex>.ts and ts/src/abstract/prediction/<ex>.ts
const CSHARP_IMPLICIT_API_FILE = /(^|[\\/])ts[\\/]src[\\/]abstract[\\/]([a-z0-9_]+[\\/])?[a-z0-9_]+\.ts$/;

const CSHARP_FUNCTION_SCOPES = [ SyntaxKind.MethodDeclaration, SyntaxKind.FunctionDeclaration, SyntaxKind.FunctionExpression, SyntaxKind.ArrowFunction, SyntaxKind.Constructor, SyntaxKind.GetAccessor, SyntaxKind.SetAccessor ];

// Parameters of a method whose override chain the ts/src census cleared: every declaration (base
// member + every override) maps to the same spelling AND every call site in the generated tree
// passes a compatible argument, so the whole-language build stays green. The three surviving
const CSHARP_OVERRIDE_PARAM_TYPES: { [name: string]: { [index: number]: string } } = {
    ethRpc: { 2: 'IList<object>' },
    parsePredictionOpenInterest: { 0: 'IDictionary<string, object>' },
    signEvmTransaction: { 0: 'IDictionary<string, object>' },
};

// a parameter whose ts/src annotation is an array of JSON cells (`Dict[]`, `Market[]`,
// `any[]`) prints `IList<object>` -- the very value the generated C# tree passes for a TS array --
// instead of `object`, so its `.length` / element reads emit `Count` / the guarded indexer. Two
// whole-program proofs gate it, so a base member and every override keep ONE signature and no
// call site needs a conversion:
//   1. every declaration of that (method, position) in the program spells the same list type, and
//   2. every call site of that NAME in the program passes an array of JSON cells at that position,
//      or omits it. The census is name-scoped, so the proof needs no callee identity: a resolved
//      signature handle is not the declaration's node in a worker batch.
// A `string[]`/`number[]` cell keeps `object`: its C# value is a real `string[]`, not an IList.
// Positions the embedding build layer retypes itself are left to it (see the exclusions hook).
const csharpListParamCensuses = new WeakMap<object, Map<string, boolean>>();
const csharpListParamBaseKeys = new WeakMap<object, Set<string>>();

// Base-tier members whose declared array is a dictionary at run time in an override the base program
// cannot see (btcturk.parseOHLCVs reads its `any` parameter with string keys): they keep `object`
const CSHARP_BASE_LIST_PARAM_DICT_OVERRIDES: { [name: string]: number[] } = {
    parseOHLCVs: [ 0 ],
};

// the unified trading tier (`class Exchange extends BaseExchange`): public typed wrappers whose callers,
// generated tests and user code included, pass `object`, so its parameters keep their box
function csharpListParamInTradingTier (node): boolean {
    const owner: any = findAncestor(node, (n) => isClassDeclaration(n));
    return (owner !== undefined) && (owner.name?.text === 'Exchange') && (owner.heritageClauses !== undefined);
}

// the base tier is printed by the driver one source file at a time (`transpileCSharpByPath`), so
// a program rooted in `ts/src/base/*.ts` holds no caller of the methods it declares: its array
// parameters are typed from the declared TS type alone, and every override follows them
function csharpListParamFileIsPrintedAlone (node): boolean {
    const file: any = (typeof node.getSourceFile === 'function') ? node.getSourceFile() : undefined;
    const fileName = String(file?.fileName ?? '');
    if (!fileName.replace(/\\/g, '/').includes('ts/src/base/')) {
        return false;
    }
    // members above the transpile delimiter are hand-written C#: their signatures are not printed
    const delimiter = String(file?.text ?? '').indexOf('METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT');
    return (delimiter < 0) || (node.pos > delimiter);
}

// the annotation an ARRAY type node spells, without asking the checker (cheap pre-filter):
// `X[]`, `(X)[]`, `X[] | undefined` -- whether the element is a JSON cell is the checker's answer
function csharpSyntacticArrayType (node): boolean {
    if (node === undefined) {
        return false;
    }
    if (node.kind === SyntaxKind.ArrayType) {
        return true;
    }
    if (node.kind === SyntaxKind.TypeReference) {
        return String((node as any).typeName?.text ?? '') === 'Strings'; // the checker decides the rest
    }
    if (node.kind === SyntaxKind.UnionType || node.kind === SyntaxKind.ParenthesizedType) {
        const parts = (node.types !== undefined) ? Array.from (node.types as any) : [ (node as any).type ];
        return parts.some ((part: any) => part !== undefined && csharpSyntacticArrayType (part));
    }
    return false;
}

// the parameter declaration behind a receiver, when this printer typed it as a list
// (csharpArrayListParamType): such a read keeps the helper's own null branches
function csharpListParamDeclaration (transpiler, expression): any {
    if (expression === undefined) {
        return undefined;
    }
    const declarations = transpiler.csharpListParamDeclarations;
    const declaration = transpiler.csharpReceiverBinding (expression);
    return ((declarations !== undefined) && (declaration !== undefined) && declarations.has (declaration)) ? declaration : undefined;
}

const CSHARP_LENGTH_CAST = /^\(([A-Za-z_][\w.]*(?:<[^<>]*(?:<[^<>]*>)?[^<>]*>)?)\)/;

// declaration types where `isEqual (x, null)` -> `x == null` is the same test: `T?` (`== null`
// is `!x.HasValue`, the helper's `a == null` guard) and named reference types (reference compare).
// `object`/`var` and non-nullable scalars are refused (`x == null` won't compile for Int64/bool).
const CSHARP_NULL_COMPARISON_REFERENCE_HEADS = [ 'string', 'IDictionary<', 'Dictionary<', 'IList<', 'List<', 'ConcurrentDictionary<', 'ccxt.pro.', 'ArrayCache', 'IOrderBook', 'Future', 'WebSocketClient', 'Delegates' ];

export class CSharpTranspiler extends BaseTranspiler {

    binaryExpressionsWrappers;
    // method node -> 'bool' | 'bool?' | undefined (see csharpBooleanReturnType)
    csharpBooleanReturnTypes = new WeakMap<Node, string | undefined>();
    // method node -> 'string' | 'string?' | undefined (see csharpStringReturnType)
    csharpStringReturnTypes = new WeakMap<Node, string | undefined>();
    // method node -> the type the composed printer writes into its signature
    csharpPrintedReturnTypes = new WeakMap<Node, string | undefined>();
    // method names declared once tree-wide (config.csharp.uniqueMethodNames); absent = the inferred collection return is off
    csharpUniqueMethods: Set<string> | undefined = undefined;
    // the embedding layer renames every async `Promise<int>` / `Promise<Int>` declaration to its PascalCase
    // `Task<Int64>` typed core (ccxt: pascalizeTypedCores); on, the awaited `this.<name>(...)` calls of those
    // methods print that PascalCase name (csharpInt64TaskCallName). Off by default: a standalone print keeps
    // the declaration camelCase, and the call has to match it
    csharpPascalInt64TaskCalls = false;
    // method name -> parameter position -> the C# type the embedding build layer narrows that parameter to
    // (config.csharp.numericArgTypes); with the callee allowlist it lets the printer prove a literal-default
    // numeric parameter's shadow local is typed (csharpShadowedNumericParamType)
    csharpNumericArgTypes: Record<string, Record<number, string>> = {};
    csharpShadowCallees: Set<string> = new Set<string>();
    csharpShadowedParamTypes = new WeakMap<Node, string>();
    // method position key -> 'List<object>' | 'IDictionary<string, object>' | undefined (csharpCollectionReturnType)
    csharpCollectionReturnTypes = new Map<string, string | undefined>();
    csharpCollectionReturnProofs = new Set<string>();
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
    // the declared C# type of a member of the hand-written runtime (cs/ccxt/base/
    // Exchange.Options.cs for `this.<name>`, cs/ccxt/ws/Client.cs for `client.<name>`), installed by
    // the embedding build layer from those files; undefined keeps every member read on the helpers
    csharpDeclaredMemberType?: (owner: 'this' | 'client', name: string) => CsharpDeclaredMember | undefined;
    // the return type the hand-written runtime declares for `this.<name>(...)` (cs/ccxt/base/Exchange.Generic.cs)
    csharpDeclaredMethodReturnType?: (name: string) => string | undefined;
    // optional exclusion of the array-parameter rule below, installed by the embedding build
    // layer for the (method, position) pairs its own post-print pass retypes: those keep the
    // `object` box this printer would otherwise replace, so that pass still owns the signature
    csharpListParamExclusions?: (name: string, index: number) => boolean;
    // `const row = list[i]` whose every use reads a string-keyed dictionary prints
    // `IDictionary<string, object> row = ((IDictionary<string, object>)<read>)`. Native rule: it fires
    // for exchange sources (ts/src/, never the test/example tiers, whose element reads print against
    // the bridge helpers); a host may override the per-file answer with this hook
    csharpElementRowLocalSource?: (fileName: string) => boolean;
    // variable declaration -> the concrete C# type this printer named for it
    // (getCSharpLocalType): 'List<object>' / 'Dictionary<string, object>' / 'string' / ...
    // Only declarations the printer typed itself are kept: the printed `<type> name = `
    // prefix is final, so every later read of the local is statically that type and its
    // members may replace inOp/getArrayLength
    csharpTypedLocals = new WeakMap<Node, string>();
    csharpNativeForIncrementors = new WeakSet<Node>();
    // for-counter declaration -> true when csharpInt64ForCounter proved it Int64 (undefined = not asked yet)
    csharpInt64ForCounters = new WeakMap<Node, boolean>();
    // parameter declarations this printer typed as `IList<object>` (csharpArrayListParamType), so
    // their reads keep the helper's null branches (`(x?.Count ?? 0)`, the guarded indexer)
    csharpListParamDeclarations = new WeakSet<Node>();
    // source file -> member name -> whether every `this.<name> = ...` there stores a dictionary (csharpMemberWritesOnlyDictionaries)
    csharpMemberWriteCache = new WeakMap<object, Map<string, boolean>>();
    // source file -> next pattern variable number of csharpMemberKeyVariable
    csharpMemberKeyCounters = new WeakMap<object, number>();
    // the subset fixed by a base-tier declaration: printed `IList<object> x = null`, the spelling every override shares
    csharpBaseListParamDeclarations = new WeakSet<Node>();
    // variable statements whose `await Promise.all ([...])` prints as typed task
    // locals + `Task.WhenAll`, and the promise-holding declarations that plan prints as `var`
    csharpPromiseAllSites = new WeakMap<Node, any>();
    csharpPromiseAllTaskDeclarations = new WeakSet<Node>();
    // `await Promise.all (list)` over implicit-API tasks of ONE plain
    // T -> List<Task<T>> + Task.WhenAll. Keyed by position (csharpPromiseAllKey): a declaration reached
    // through the checker is not the node the printer visits
    csharpPromiseAllTypedAwaits = new Map<string, string>();
    csharpPromiseAllTypedLists = new Map<string, string>();
    csharpPromiseAllTypedLocals = new Map<string, string>();
    csharpPromiseAllTypedPlanned = new Set<string>();
    // ws handler `message` parameter -> the typed signature this printer prints for it
    csharpHandlerMessageTypes = new WeakMap<Node, string | undefined>();
    // method declaration -> a static call reference exists (a call binds its arguments)
    csharpHandlerCalled = new WeakMap<Node, boolean>();
    // class declaration -> the class routes the raw message through a list test
    csharpListRouteClasses = new WeakMap<Node, boolean>();
    // source file -> method symbol -> a static call reference exists (built once per file: a
    // sticky batch program is shared by every file of the stage, so a program-keyed index
    // would answer for another venue's class)
    csharpHandlerCallIndex = new WeakMap<Node, Map<TsSymbol, boolean>>();
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
    boolSlotBindings = new WeakMap<Node, boolean>();
    // declaration node -> the C# type its printed `<type> <name> =` prefix carries ('' = the
    // printer printed `var`); see csharpDeclaredLocalValueType — asked once per arithmetic read
    csharpDeclaredLocalTypes = new WeakMap<Node, string>();

    // method node -> base-class method it overrides (null: none); see getMethodOverride
    csharpMethodOverrides = new WeakMap<Node, Node | null>();
    // class declaration -> member name -> its LAST method of that name (base scan order)
    csharpClassMethodsByName = new WeakMap<Node, Map<string, Node>>();

    // reads of a hand-written class's string-keyed dictionary member.
    // The C# class that backs a TS class (ccxt: WebSocketClient for ws `Client`) declares members
    // such as `futures` / `subscriptions` as `IDictionary<string, V>` and may carry a typed accessor
    // (`getFuture(string)`). The consumer names such a member through csharpDeclaredDictMember (a
    // table keyed on the checker's receiver class and member, stub undefined here, so an unpatched printer
    // keeps the helper call). `recv.member[key]` and `this.safeValue (recv.member, key)` then print:
    //   - the accessor call `recv.getX(key)` when the table names one (safeValue only: the accessor
    //     answers null for a missing key exactly like the helper), or
    //   - the helper's own key test: `(recv.member != null && key != null && recv.member.ContainsKey(key)
    //     ? recv.member[key] : null)` (literal keys skip the key null test).
    // The key must be a string literal or an identifier whose printed C# type is string / string?
    // (csharpNativeStringKey, then the build layer's declared record); every other key, a write, a
    // delete and a safeValue default keep the helper.
    csharpDeclaredDictMemberReads = new WeakSet<Node>();

    // declared dictionary base fields, and `mod` equality against a literal:
    // A hand-written BaseExchange field the printer's tables above do not name is declared in the
    // embedding build layer's derived table (config.csharp.declaredBaseFieldTypes: the field's C# type in
    // cs/ccxt/base/Exchange.Options.cs, read through csharpDeclaredBaseFieldType). Two declared shapes read natively:
    //   - `IDictionary<string, object>` / `Dictionary<string, object>` (ccxt: urls, headers): the member IS a
    //     dictionary, so its indexer and ContainsKey replace getValue / inOp; the helper's null receiver,
    //     null key and missing key branches are spelled back as tests;
    //   - `object` (ccxt: positions, currencies): the box is a dictionary whenever every write of the member in the
    //     source file stores one (`{}` literal, a dictionary-typed value, null, undefined) and at least one
    //     write exists, so the same reads go through the helper's own `(IDictionary<string,object>)` cast.
    // The key is a string literal, an identifier whose printed C# type is string / string?, or an identifier
    // whose TypeScript type is a string (printed `object` or string: `(string)key` is the helper's own cast).
    // Every other key, a write, a delete and a name no hook declares keep the helper.
    csharpDeclaredBaseFields: { [name: string]: string } = {};

    csharpBaseFieldKeyNames = new WeakMap<object, number>();

    // method node -> the parameter indexes this printer emits as `bool?`; keyed by the ts.Program
    // the census walked, so a sticky batch program and an in-memory snippet never answer for
    // each other
    csharpBooleanParamProofs = new WeakMap<Program, Map<Node, Set<number>>>();

    // ==== configuration, class/method-override lookup and identifiers ====

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

        // the embedding build layer's table of hand-written base member -> declared C# type
        this.csharpDeclaredBaseFields = Object.assign ({}, config['declaredBaseFieldTypes'] ?? {});
        this.csharpUniqueMethods = Array.isArray(config['uniqueMethodNames']) ? new Set<string>(config['uniqueMethodNames']) : undefined;
        this.csharpPascalInt64TaskCalls = config['pascalInt64TaskCalls'] === true;
        this.csharpNumericArgTypes = Object.assign({}, config['numericArgTypes'] ?? {});
        this.csharpShadowCallees = new Set<string>(Array.isArray(config['coreArgShadowCallees']) ? config['coreArgShadowCallees'] : []);
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

        this.ArgTypeReplacements = { ...this.VariableTypeReplacements };

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

    csharpMethodsByName(classDecl): Map<string, Node> {
        let byName = this.csharpClassMethodsByName.get(classDecl);
        if (byName === undefined) {
            byName = new Map();
            for (const elem of classDecl.members ?? []) {
                if (isMethodDeclaration(elem)) {
                    byName.set(elem.name.getText().trim(), elem);
                }
            }
            this.csharpClassMethodsByName.set(classDecl, byName);
        }
        return byName;
    }

    // base getMethodOverride rescans every parent member with getText() on each call; the
    // printer asks per method several times, so memoize it (same walk, same result)
    getMethodOverride(node: Node): Node {
        if (node === undefined || !isClassDeclaration(node.parent) || !(node.parent as any).heritageClauses) {
            return undefined;
        }
        const cached = this.csharpMethodOverrides.get(node);
        if (cached !== undefined) {
            return cached ?? undefined;
        }
        let method = undefined;
        let parentClass = getAllSuperTypeNodes(node.parent)[0];
        while (parentClass !== undefined) {
            const parentClassDecl = this.getChecker().getTypeAtLocation(parentClass)?.getSymbol()?.valueDeclaration?.resolve();
            if (parentClassDecl === undefined) {
                this.warn(node, "Parent class", "Parent class not found");
                method = undefined;
                break;
            }
            method = this.csharpMethodsByName(parentClassDecl).get((node as any).name.text) ?? method;
            parentClass = getAllSuperTypeNodes(parentClassDecl)[0] ?? undefined;
        }
        this.csharpMethodOverrides.set(node, method ?? null);
        return method;
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
        const symbol = type?.getSymbol();
        if (symbol !== undefined) {
            // const declarations = (this.getChecker().getDeclaredTypeOfSymbol(symbol).getSymbol()?.declarations ?? []).map((d) => d.resolve());
            const decl = (symbol?.declarations ?? []).map((d) => d.resolve());
            let isBuiltIn = undefined;
            if (decl.length > 0) {
                isBuiltIn = decl[0].getSourceFile().fileName.indexOf('typescript') > -1; //very hacky find a better solution later
            }

            if (isBuiltIn !== undefined && !isBuiltIn) {
                // const isClassDeclaration = declarations.find(l => l.kind === SyntaxKind.ClassDeclaration);
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
                        const first = symbol.declarations[0].resolve();
                        if (first.kind === SyntaxKind.ClassDeclaration) {
                            isClassDeclaration = true;
                        }
                        if (first.kind === SyntaxKind.ImportSpecifier) {
                            const importedSymbol = this.getChecker().getAliasedSymbol(symbol);
                            if (importedSymbol?.declarations[0]?.resolve()?.kind === SyntaxKind.ClassDeclaration) {
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
        let superClause = '';
        node.body?.statements.forEach(statement => {
            if (isExpressionStatement(statement)) {
                const expression = statement.expression;
                if (isCallExpression(expression)) {
                    const expressionText = expression.expression.getText().trim();
                    if (expressionText === 'super') {
                        const superCallParams = expression.arguments.map((a) => {
                            return this.printNode(a, identation).trim();
                        }).join(", ");
                        superClause = ` : ${this.SUPER_CALL_TOKEN}(${superCallParams})`;
                    }
                }
            }
        });

        return this.getIden(identation) + className + `(${args})` + superClause + constructorBody;
    }

    printDynamicCall(node, identation) {
        const elementAccess = node.expression;
        if (elementAccess?.kind === SyntaxKind.ElementAccessExpression) {
            const parsedArg = node.arguments.map(n => this.printNode(n, identation).trimStart()).join(", ");
            const target = this.printNode(elementAccess.expression, 0);
            const propName = this.printNode(elementAccess.argumentExpression, 0);
            // always typed as async: the caller cannot tell whether the dynamic target is
            return `((Task<object>)${this.DYNAMIC_CALL_OPEN}${target}, ${propName}, new object[] { ${parsedArg} }))`;
        }
        return undefined;
    }

    csharpIsSameDeclaration(identifier, declaration): boolean {
        return this.getChecker().getSymbolAtLocation(identifier)?.valueDeclaration?.resolve() === declaration;
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

    csharpContains(outer, inner): boolean {
        if (outer === undefined || inner === undefined) {
            return false;
        }
        return inner.getStart() >= outer.getStart() && inner.getEnd() <= outer.getEnd();
    }

    csharpIdentifierSymbol(node): any {
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        return this.checkerOrUndefined()?.getSymbolAtLocation(node);
    }

    // the global `parseInt` / `parseFloat` live in the TS lib chain; a declaration anywhere else
    // means the call prints a different function than the runtime helper
    csharpCalleeIsGlobalFunction(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return true; // in-memory program without a checker: the name is all there is
        }
        const declarations = (checker.getSymbolAtLocation(node)?.declarations ?? []).map((d) => d.resolve());
        return declarations.every((declaration) => declaration.getSourceFile().fileName.indexOf('typescript') > -1);
    }

    // `(x as T)` / `(x)` -> x: the assertion prints no cast on a dictionary read here, so the read
    // underneath is the same box
    csharpUnwrapAssertion(node) {
        let current = node;
        while (current?.kind === SyntaxKind.ParenthesizedExpression || current?.kind === SyntaxKind.AsExpression) {
            current = current.expression;
        }
        return current;
    }

    // mirrors printWrappedUnknownThisProperty: a `this.<name>(...)` call whose callee the
    // checker cannot resolve is printed as `callDynamically(this, "<name>", ...)`, whose C#
    // signature returns `object` whatever the name says
    csharpCalleeResolves(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        return checker.getResolvedSignature(node)?.declaration !== undefined;
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

    // an identifier's spelling in the ts7 ast (`text`; `escapedText` no longer exists)
    csharpNodeText(node) {
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const text = (node as any).text ?? (node as any).escapedText;
        return (typeof text === 'string' && text.length > 0) ? text : undefined;
    }

    // a declaration resolved through the checker comes back as a fresh handle, so method identity
    // is the source position, never the node object
    csharpNodePositionKey(node) {
        if (node === undefined) {
            return undefined;
        }
        const source = node.getSourceFile?.();
        return (source === undefined) ? undefined : `${source.fileName}:${node.pos}:${node.end}`;
    }

    // getFunctionType for a call site: TS7's getSignatureFromDeclaration panics on a CallExpression
    // (TS6 returned the resolved call signature there), so resolve the call itself
    csharpCallSiteFunctionType(node) {
        const checker = this.getChecker();
        const type = checker.getReturnTypeOfSignature(checker.getResolvedSignature(node));
        const parsedType = this.getTypeFromRawType(type);
        if (parsedType !== this.PROMISE_TYPE_KEYWORD) {
            return parsedType;
        }
        const typeArguments = checker.getTypeArguments(type as any);
        if (typeArguments.length === 0 || (typeArguments.length === 1 && typeArguments[0].flags === TypeFlags.Void)) {
            return this.PROMISE_TYPE_KEYWORD;
        }
        const insideTypes = typeArguments.map((t) => this.getTypeFromRawType(t)).join(",");
        return (insideTypes.length > 0) ? `${this.PROMISE_TYPE_KEYWORD}<${insideTypes}>` : undefined;
    }

    isOverrideMethod(node): boolean {
        const override = this.getMethodOverride(node);
        return (override !== undefined) && (override !== node);
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

    csharpSameBinding(node, symbol): boolean {
        try {
            const resolved = this.getChecker().getSymbolAtLocation(node);
            return (resolved !== undefined) && (resolved === symbol);
        } catch (e) {
            return false;
        }
    }

    printPropertyAccessModifiers(node) {
        let modifiers = this.printModifiers(node);
        if (modifiers === '') {
            modifiers = this.defaultPropertyAccess;
        }
        // add type
        let typeText = 'object';
        if (node.type) {
            typeText = this.getType(node);
            if (!typeText && node.type.kind === SyntaxKind.AnyKeyword) {
                typeText = this.OBJECT_KEYWORD + ' ';
            }
        }
        return modifiers + ' ' + typeText + ' ';
    }

    // ==== ws handler `message` parameters ====

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

    // the identifier is the raw `message` parameter of a handler-shaped method (a `Client`
    // first parameter, so `handleMessage` with its `any` annotation included): the class can
    // route that same value through its list arm
    csharpIsHandlerMessageIdentifier(node): boolean {
        if (!isIdentifier(node)) {
            return false;
        }
        try {
            const declaration: any = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration?.resolve();
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
    csharpHandlerCallIndexFor(file): Map<TsSymbol, boolean> {
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
        const index = new Map<TsSymbol, boolean>();
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

    // ==== Promise.all -> Task.WhenAll ====

    csharpPromiseAllPrintList(node) {

        let arrayOpen = this.ARRAY_OPENING_TOKEN;
        const elems = node.elements;

        const elements = node.elements.map((e) => this.printNode(e)).join(", ");

        // take into consideration list of promises
        if (elems.length > 0) {
            const first = elems[0];
            if (first.kind === SyntaxKind.CallExpression) {
                // const type = this.getChecker().getTypeAtLocation(first);
                let type = this.csharpCallSiteFunctionType(first);
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

    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return `promiseAll(${parsedArg})`;
    }

    // ---- `await Promise.all ([a, b])` -> typed task locals + Task.WhenAll ----
    //
    // PromiseAll only reflects because an element's Task<T> has been erased to object. With every
    // element a statically typed Task<T> whose T the helper hands back unchanged, WhenAll waits for
    // exactly those tasks and `.Result` is the value the helper collected, in list order.

    // the statements of a block are planned before any of them prints: a local feeding the list has
    // to be emitted as `var` (a concrete Task<T>) by the time the site reads its `.Result`
    printBlock(node, identation, chainBlock = false) {
        this.csharpPromiseAllPlanBlock(node);
        if ((node?.parent !== undefined) && (CSHARP_FUNCTION_SCOPES.indexOf(node.parent.kind) >= 0)) {
            this.csharpPromiseAllTypedPlanFunction(node.parent);
        }
        return super.printBlock(node, identation, chainBlock);
    }

    printVariableStatement(node, identation) {
        const plan = this.csharpPromiseAllSites.get(node);
        if (plan === undefined) {
            return super.printVariableStatement(node, identation);
        }
        return this.printNodeCommentsIfAny(node, identation, this.csharpPromiseAllNativeStatement(plan, identation));
    }

    csharpPromiseAllPlanBlock(block) {
        const statements = block?.statements;
        if (statements === undefined) {
            return;
        }
        for (let index = 0; index < statements.length; index++) {
            const plan = this.csharpPromiseAllPlanStatement(statements, index) ?? this.csharpPromiseAllSlotsPlan(statements, index);
            if (plan !== undefined) {
                this.csharpPromiseAllSites.set(statements[index], plan);
                for (const declaration of plan.declarations) {
                    this.csharpPromiseAllTaskDeclarations.add(declaration);
                }
            }
        }
    }

    // `const r = await Promise.all ([...])` over 2..8 elements, each one a typed task the helper
    // passes through: nothing else about the statement may change
    csharpPromiseAllPlanStatement(statements, index) {
        const statement = statements[index];
        if (statement?.kind !== SyntaxKind.VariableStatement) {
            return undefined;
        }
        const declarations = statement.declarationList?.declarations;
        if ((declarations === undefined) || (declarations.length !== 1)) {
            return undefined;
        }
        const elements = this.csharpPromiseAllList(declarations[0].initializer);
        if ((elements === undefined) || ((declarations[0].parent?.flags & NodeFlags.Const) === 0)) {
            return undefined; // a `let` may be rewritten with another shape, which the List<object> local would refuse
        }
        const parsed = [];
        const taskDeclarations = [];
        for (const element of elements) {
            const resolved = this.csharpPromiseAllElement(statements, index, element);
            if (resolved === undefined) {
                return undefined;
            }
            parsed.push(resolved);
            if (resolved.declaration !== undefined) {
                taskDeclarations.push(resolved.declaration);
            }
        }
        return { statement, declaration: declarations[0], elements: parsed, declarations: taskDeclarations };
    }

    // the element list of `await Promise.all ([...])`, or undefined for every other shape
    csharpPromiseAllList(initializer) {
        if (initializer?.kind !== SyntaxKind.AwaitExpression) {
            return undefined;
        }
        const call = initializer.expression;
        if ((call?.kind !== SyntaxKind.CallExpression) || (call.expression?.getText() !== 'Promise.all')) {
            return undefined;
        }
        const list = call.arguments?.[0];
        if ((list?.kind !== SyntaxKind.ArrayLiteralExpression) || (list.elements.length < 2) || (list.elements.length > 8)) {
            return undefined;
        }
        return list.elements;
    }

    // one element: a `this.<name> (...)` call the printer resolves (an unresolved callee prints
    // callDynamically, which returns object), or a const local declared earlier in the same block
    // that already holds such a call
    csharpPromiseAllElement(statements, index, element) {
        if (element?.kind === SyntaxKind.CallExpression) {
            const expression = element.expression;
            const isThisCall = (expression?.kind === SyntaxKind.PropertyAccessExpression) && (expression.expression?.kind === SyntaxKind.ThisKeyword);
            if (!isThisCall || !this.csharpCalleeResolves(element)) {
                return undefined;
            }
            return this.csharpPromiseAllValueIsPlain(element) ? { text: this.printNode(element, 0).trim() } : undefined;
        }
        if (element?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const declaration = this.csharpReceiverBinding(element);
        if ((declaration?.kind !== SyntaxKind.VariableDeclaration) || ((declaration.parent?.flags & NodeFlags.Const) === 0)) {
            return undefined;
        }
        const statement = declaration.parent.parent;
        const position = statements.indexOf(statement);
        const singleDeclarator = (declaration.parent as any)?.declarations?.length === 1;
        if (!singleDeclarator || (position < 0) || (position >= index)) {
            return undefined;
        }
        return this.csharpPromiseAllValueIsPlain(element) ? { text: this.printNode(element, 0).trim(), declaration } : undefined;
    }

    // the awaited value of the element's Promise survives PromiseAll unchanged: FromTyped's switch
    // covers the struct families and FromDictList reboxes List<Dictionary<...>> only, so an
    // anonymous dictionary, a list of those, or a scalar is never rewritten; `any`/`object` and the
    // named struct types keep the helper
    csharpPromiseAllValueIsPlain(element) {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        let type;
        try {
            type = checker.getTypeAtLocation(element);
        } catch (e) {
            return false;
        }
        if (this.getTypeFromRawType(type) !== this.PROMISE_TYPE_KEYWORD) {
            return false;
        }
        const resolved = checker.getTypeArguments(type);
        if ((resolved === undefined) || (resolved.length !== 1)) {
            return false;
        }
        return this.csharpPromiseAllTypeIsPlain(checker, resolved[0], 0);
    }

    csharpPromiseAllTypeIsPlain(checker, type, depth) {
        if ((type === undefined) || (depth > 1)) {
            return false;
        }
        const flags = type.flags;
        if ((flags & (TypeFlags.String | TypeFlags.Number | TypeFlags.Boolean)) !== 0) {
            return true;
        }
        if ((flags & (TypeFlags.Any | TypeFlags.Unknown | TypeFlags.Void | TypeFlags.Null | TypeFlags.Undefined | TypeFlags.Never)) !== 0) {
            return false;
        }
        const name = type.getSymbol()?.escapedName;
        if ((name === '__object') || this.csharpPromiseAllIsIndexOnlyObject(type)) {
            return true;
        }
        if (name !== 'Array') {
            return false;
        }
        // `T[]` is an ArrayType: this checker panics on getTypeArguments for one, the index type is
        // the element type it holds
        const element = this.csharpPromiseAllIndexType(type);
        return (element !== undefined) && this.csharpPromiseAllTypeIsPlain(checker, element, depth + 1);
    }

    // `Dict` reaches the checker as a named alias whose symbol is the alias, so the shape proves it:
    // a string index signature holding `any` and no declared members. A typed map alias (Currencies)
    // holds a struct under the same shape and is de-typed by the helper, so it stays out.
    csharpPromiseAllIsIndexOnlyObject(type) {
        try {
            if ((type.getProperties?.() ?? []).length > 0) {
                return false;
            }
            const index = type.getStringIndexType?.();
            return (index !== undefined) && ((index.flags & TypeFlags.Any) !== 0);
        } catch (e) {
            return false;
        }
    }

    csharpPromiseAllIndexType(type) {
        try {
            return type.getNumberIndexType?.();
        } catch (e) {
            return undefined;
        }
    }

    // `await Promise.all ([this.a (), this.b ()]);` as a statement.
    // The result is discarded, so the helper's re-box is unobservable and WhenAll waits for the same
    // tasks whatever their T: every element is a resolved `this.<m> (...)` call typed Promise<...>.
    csharpPromiseAllDiscardedTasks(awaited): any[] | undefined {
        const call = awaited?.expression;
        if ((awaited?.parent?.kind !== SyntaxKind.ExpressionStatement) || (call?.kind !== SyntaxKind.CallExpression)
            || (call.expression?.getText() !== 'Promise.all') || (call.arguments?.length !== 1)) {
            return undefined;
        }
        const list = call.arguments[0];
        if ((list?.kind !== SyntaxKind.ArrayLiteralExpression) || (list.elements.length === 0)) {
            return undefined;
        }
        return list.elements.every((element) => this.csharpPromiseAllIsThisTaskCall(element)) ? [ ...list.elements ] : undefined;
    }

    csharpPromiseAllIsThisTaskCall(element): boolean {
        const callee = element?.expression;
        if ((element?.kind !== SyntaxKind.CallExpression) || (callee?.kind !== SyntaxKind.PropertyAccessExpression)
            || (callee.expression?.kind !== SyntaxKind.ThisKeyword) || !this.csharpCalleeResolves(element)) {
            return false;
        }
        try {
            return this.getTypeFromRawType(this.getChecker().getTypeAtLocation(element)) === this.PROMISE_TYPE_KEYWORD;
        } catch (e) {
            return false;
        }
    }

    // `const [a, b] = await Promise.all ([p, q])` over const task
    // locals read nowhere else, each holding a resolved `this.<m> (...)` call whose Task<T> has a plain T. The
    // locals print as Task<T>, one WhenAll waits for them, and each slot is read from its own task.
    csharpPromiseAllSlotsPlan(statements, index) {
        const statement = statements[index];
        const declaration = statement?.declarationList?.declarations?.[0];
        if ((statement?.kind !== SyntaxKind.VariableStatement) || (statement.declarationList.declarations.length !== 1)
            || ((statement.declarationList.flags & NodeFlags.Const) === 0) || (declaration.name?.kind !== SyntaxKind.ArrayBindingPattern)) {
            return undefined;
        }
        const elements = this.csharpPromiseAllList(declaration.initializer);
        const bindings = declaration.name.elements;
        if ((elements === undefined) || (bindings.length !== elements.length)
            || bindings.some((binding) => (binding.kind !== SyntaxKind.BindingElement) || (binding.name?.kind !== SyntaxKind.Identifier) || (binding.initializer !== undefined) || (binding.dotDotDotToken !== undefined))) {
            return undefined;
        }
        const fn = this.csharpEnclosingFunction(statement);
        // one plain implicit-API T across every slot is the typed List<Task<T>> plan's shape
        const typedElements = elements.map((element) => this.csharpPromiseAllTypedElement(fn, element));
        if (typedElements.every((typed) => typed !== undefined) && (new Set(typedElements.map((typed) => typed!.type)).size === 1)) {
            return undefined;
        }
        const slots = [];
        const locals = [];
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const local: any = (element?.kind === SyntaxKind.Identifier) ? this.csharpReceiverBinding(element) : undefined;
            const position = statements.indexOf(local?.parent?.parent);
            if ((local?.kind !== SyntaxKind.VariableDeclaration) || (local.name?.kind !== SyntaxKind.Identifier) || ((local.parent?.flags & NodeFlags.Const) === 0)
                || (local.parent.declarations.length !== 1) || (position < 0) || (position >= index) || (local.initializer === undefined)
                || !this.csharpPromiseAllIsThisTaskCall(local.initializer) || (this.csharpPromiseAllMentions(fn, local) !== 1)) {
                return undefined;
            }
            const type = this.csharpPromiseAllSlotTaskType(local.initializer);
            if ((type === undefined) || locals.some((other) => other.name.text === local.name.text)) {
                return undefined;
            }
            locals.push({ name: local.name, declaration: local, type });
            slots.push({ task: local.name.text, name: this.printNode(bindings[i].name, 0).trim() });
        }
        for (const local of locals) {
            this.csharpPromiseAllTypedLocals.set(this.csharpPromiseAllKey(local.declaration), local.type);
        }
        return { statement, declaration, elements: [], declarations: [], slots };
    }

    // the plain T of the Task<T> a `this.<m> (...)` call prints: an implicit-API endpoint's body type, or the
    // object of an un-annotated method returning `any`; undefined for anything the helper would re-box
    csharpPromiseAllSlotTaskType(call): string | undefined {
        const implicit = this.csharpImplicitApiTaskType(call);
        if (implicit !== undefined) {
            return implicit;
        }
        let declaration;
        try {
            declaration = this.getChecker().getResolvedSignature(call)?.declaration?.resolve();
        } catch (e) {
            return undefined;
        }
        if ((declaration?.kind !== SyntaxKind.MethodDeclaration) || (declaration.type !== undefined) || (this.csharpPrintedReturnType(declaration) !== 'Task<object>')) {
            return undefined;
        }
        return 'object';
    }

    csharpPromiseAllNativeStatement(plan, identation) {
        const indent = this.getIden(identation);
        const lines = [];
        if (plan.slots !== undefined) {
            // each slot reads its own task: the helper's re-box is the identity on these plain T
            lines.push('await Task.WhenAll(' + plan.slots.map((slot) => slot.task).join(', ') + ')' + this.LINE_TERMINATOR);
            for (const slot of plan.slots) {
                lines.push('var ' + slot.name + ' = await ' + slot.task + this.LINE_TERMINATOR);
            }
            return lines.map((line) => indent + line).join('\n');
        }
        const tasks = [];
        for (const element of plan.elements) {
            if (element.declaration !== undefined) {
                tasks.push(element.text);
                continue;
            }
            // the call runs once, in place: the task local is what the list collects from
            const task = 'hxauTask' + plan.statement.pos + '_' + tasks.length;
            lines.push('var ' + task + ' = ' + element.text + this.LINE_TERMINATOR);
            tasks.push(task);
        }
        lines.push('await Task.WhenAll(' + tasks.join(', ') + ')' + this.LINE_TERMINATOR);
        const values = tasks.map((task) => task + '.Result');
        const collected = 'new List<object> { ' + values.join(', ') + ' }';
        const binding = plan.declaration.name;
        if (binding.kind !== SyntaxKind.ArrayBindingPattern) {
            lines.push('List<object> ' + this.printNode(binding, 0).trim() + ' = ' + collected + this.LINE_TERMINATOR);
            return lines.map((line) => indent + line).join('\n');
        }
        // `const [a, b] = await Promise.all (...)`: same holder-and-index shape the printer uses for
        // every other destructured result, so the two locals read as they did
        const targets = binding.elements.map((element) => this.printNode(element.name, 0).trim());
        const holder = targets.join('') + 'Variable';
        lines.push('List<object> ' + holder + ' = ' + collected + this.LINE_TERMINATOR);
        targets.forEach((target, index) => {
            lines.push('var ' + target + ' = ((IList<object>) ' + holder + ')[' + index + ']' + this.LINE_TERMINATOR);
        });
        return lines.map((line) => indent + line).join('\n');
    }

    // ---- promiseAll over implicit-API tasks -> Task.WhenAll ----
    //
    // PromiseAll re-boxes every element through AsTaskOfObject/FromTyped, which hands a plain box back
    // unchanged. When EVERY element of the awaited list is the Task<T> of an implicit-API endpoint (a
    // `this.<m> (...)` call whose resolved signature is declared in the generated ts/src/abstract/<ex>.ts,
    // so the generated api file prints exactly `Task<T>` for it) and T is one plain box, the list is a
    // List<Task<T>> and Task.WhenAll waits for exactly those tasks. The list is either an array literal
    // or a local that is only pushed to, measured by `.length` and awaited here; a task local feeding it
    // is read nowhere else. Anything unproven keeps the helper call.

    csharpPromiseAllKey(node): string {
        return (node.getSourceFile?.()?.fileName ?? '') + ':' + node.pos + ':' + node.end + ':' + node.kind;
    }

    // the T of the List<Task<T>> an identifier names when the typed plan declared it so, else undefined
    csharpPromiseAllTypedListRead(receiver): string | undefined {
        if (receiver?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const declaration = this.csharpReceiverBinding(receiver);
        return (declaration === undefined) ? undefined : this.csharpPromiseAllTypedLists.get(this.csharpPromiseAllKey(declaration));
    }

    printAwaitExpression(node, identation) {
        const discarded = this.csharpPromiseAllDiscardedTasks(node);
        if (discarded !== undefined) {
            return `await Task.WhenAll(new Task[] {${discarded.map((element) => this.printNode(element, 0).trim()).join(', ')}})`;
        }
        if (this.csharpPromiseAllTypedAwaits.has(this.csharpPromiseAllKey(node))) {
            return `new List<object>(await Task.WhenAll(${this.printNode(node.expression.arguments[0], 0)}))`;
        }
        return super.printAwaitExpression(node, identation);
    }

    // plan every `const r = await Promise.all (list)` of one function (nested functions plan themselves)
    csharpPromiseAllTypedPlanFunction(fn) {
        if ((fn?.body === undefined) || (this.checkerOrUndefined() === undefined)) {
            return;
        }
        const functionKey = this.csharpPromiseAllKey(fn);
        if (this.csharpPromiseAllTypedPlanned.has(functionKey)) {
            return;
        }
        this.csharpPromiseAllTypedPlanned.add(functionKey);
        const visit = (n: any) => {
            if (CSHARP_FUNCTION_SCOPES.indexOf(n.kind) >= 0) {
                return;
            }
            if (n.kind === SyntaxKind.AwaitExpression) {
                this.csharpPromiseAllTypedPlanAwait(fn, n);
            }
            n.forEachChild(visit);
        };
        fn.body.forEachChild(visit);
    }

    csharpPromiseAllTypedPlanAwait(fn, awaited) {
        const call = awaited.expression;
        if ((call?.kind !== SyntaxKind.CallExpression) || (call.expression?.getText() !== 'Promise.all') || (call.arguments?.length !== 1)) {
            return;
        }
        // the result is bound by a single-declarator `const|let r = ...` / `const [a, b] = ...` of this function
        const declaration = awaited.parent;
        if ((declaration?.kind !== SyntaxKind.VariableDeclaration) || (declaration.initializer !== awaited)
            || ((declaration.name?.kind === SyntaxKind.Identifier) && (((declaration.parent as any)?.flags & NodeFlags.Const) === 0)) // a `let` may be written with another shape
            || ((declaration.parent as any)?.declarations?.length !== 1)
            || (declaration.parent.parent?.kind !== SyntaxKind.VariableStatement)
            || this.csharpPromiseAllSites.has(declaration.parent.parent)) {
            return; // a statement the Promise.all plan above prints stays its
        }
        const argument = call.arguments[0];
        let list: any = undefined; // the declaration holding the list, when the argument is a local
        let literal: any = undefined; // the array literal that starts the list
        const elements: any[] = [];
        if (argument.kind === SyntaxKind.ArrayLiteralExpression) {
            literal = argument;
        } else if (argument.kind === SyntaxKind.Identifier) {
            list = this.csharpPromiseAllLocalDeclaration(fn, argument);
            literal = list?.initializer;
            if ((literal?.kind !== SyntaxKind.ArrayLiteralExpression) || !this.csharpPromiseAllListUsesAreProvable(fn, list, argument, elements)) {
                return;
            }
        } else {
            return;
        }
        elements.unshift(...literal.elements);
        if (elements.length === 0) {
            return; // an empty list says nothing about the element type
        }
        let taskType: string | undefined = undefined;
        const taskLocals: any[] = [];
        for (const element of elements) {
            const resolved = this.csharpPromiseAllTypedElement(fn, element);
            if ((resolved === undefined) || ((taskType !== undefined) && (taskType !== resolved.type))) {
                return; // mixed Task<T> elements: no single WhenAll overload
            }
            taskType = resolved.type;
            if (resolved.declaration !== undefined) {
                taskLocals.push(resolved.declaration);
            }
        }
        if (taskType === undefined) {
            return;
        }
        this.csharpPromiseAllTypedAwaits.set(this.csharpPromiseAllKey(awaited), taskType);
        this.csharpPromiseAllTypedLists.set(this.csharpPromiseAllKey(literal), taskType);
        if (list !== undefined) {
            this.csharpPromiseAllTypedLists.set(this.csharpPromiseAllKey(list), taskType);
        }
        for (const local of taskLocals) {
            this.csharpPromiseAllTypedLocals.set(this.csharpPromiseAllKey(local), taskType);
        }
    }

    // the single-declarator `const|let name = [...]` statement of this function an identifier names
    csharpPromiseAllLocalDeclaration(fn, identifier) {
        const declaration: any = this.csharpReceiverBinding(identifier);
        if ((declaration?.kind !== SyntaxKind.VariableDeclaration) || (declaration.name?.kind !== SyntaxKind.Identifier)
            || ((declaration.parent as any)?.declarations?.length !== 1) || (declaration.parent.parent?.kind !== SyntaxKind.VariableStatement)
            || (this.csharpEnclosingFunction(declaration)?.pos !== fn.pos)) {
            return undefined;
        }
        return declaration;
    }

    // every mention of the local other than its declaration is `name.push (x)` as a statement, a
    // `.length` read, or the awaited argument itself; the pushed values join `elements`
    csharpPromiseAllListUsesAreProvable(fn, list, awaitedArgument, elements): boolean {
        const name = list.name.text;
        const listKey = this.csharpPromiseAllKey(list);
        let provable = true;
        const visit = (n: any) => {
            if (!provable) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name) && (n !== list.name) && (n.pos !== list.name.pos)) {
                const memberName = (n.parent?.kind === SyntaxKind.PropertyAccessExpression) && (n.parent.name === n);
                const binding = memberName ? undefined : this.csharpReceiverBinding(n);
                if ((binding !== undefined) && (this.csharpPromiseAllKey(binding) === listKey) && (n.pos !== awaitedArgument.pos)) {
                    const access = n.parent;
                    const call = access?.parent;
                    const sameFunction = this.csharpEnclosingFunction(n)?.pos === fn.pos;
                    if (!sameFunction || (access?.kind !== SyntaxKind.PropertyAccessExpression) || (access.expression !== n)) {
                        provable = false;
                    } else if (access.name?.text === 'push') {
                        if ((call?.kind !== SyntaxKind.CallExpression) || (call.expression !== access) || (call.arguments?.length !== 1)
                            || (call.parent?.kind !== SyntaxKind.ExpressionStatement)) {
                            provable = false;
                        } else {
                            elements.push(call.arguments[0]);
                        }
                    } else if ((access.name?.text !== 'length') || ((call?.kind === SyntaxKind.BinaryExpression) && (call.left === access)
                        && (call.operatorToken?.kind >= SyntaxKind.FirstAssignment) && (call.operatorToken?.kind <= SyntaxKind.LastAssignment))) {
                        provable = false;
                    }
                }
            }
            n.forEachChild(visit);
        };
        fn.body.forEachChild(visit);
        return provable;
    }

    // one list element: a `this.<endpoint> (...)` call, or a local read nowhere else whose only
    // initializer is such a call; the T of its Task<T>
    csharpPromiseAllTypedElement(fn, element): { type: string, declaration?: any } | undefined {
        if (element?.kind === SyntaxKind.CallExpression) {
            const type = this.csharpImplicitApiTaskType(element);
            return (type === undefined) ? undefined : { type };
        }
        if (element?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const declaration = this.csharpPromiseAllLocalDeclaration(fn, element);
        const type = (declaration?.initializer === undefined) ? undefined : this.csharpImplicitApiTaskType(declaration.initializer);
        if ((type === undefined) || (this.csharpPromiseAllMentions(fn, declaration) !== 1)) {
            return undefined; // a task local is declared, listed once, and read nowhere else
        }
        return { type, declaration };
    }

    csharpPromiseAllMentions(fn, declaration): number {
        const key = this.csharpPromiseAllKey(declaration);
        let count = 0;
        const visit = (n: any) => {
            if ((n.kind === SyntaxKind.Identifier) && (n.text === declaration.name.text) && (n.pos !== declaration.name.pos)
                && !((n.parent?.kind === SyntaxKind.PropertyAccessExpression) && (n.parent.name === n))) {
                const binding = this.csharpReceiverBinding(n);
                if ((binding !== undefined) && (this.csharpPromiseAllKey(binding) === key)) {
                    count++;
                }
            }
            n.forEachChild(visit);
        };
        fn.body.forEachChild(visit);
        return count;
    }

    // `this.<m> (...)` whose resolved signature is a method of the generated implicit-API abstract class:
    // the generated C# api prints `Task<T>` with T from the declared Promise<...> (Dict -> a dictionary,
    // List -> a list, string -> string, a union -> object), which is the T this answers when it is plain
    csharpImplicitApiTaskType(call): string | undefined {
        const callee = call?.expression;
        if ((call?.kind !== SyntaxKind.CallExpression) || (callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        let returned: any = undefined;
        try {
            const signature = checker?.getResolvedSignature(call);
            const declaration = signature?.declaration?.resolve();
            const fileName = declaration?.getSourceFile?.()?.fileName;
            if ((declaration?.kind !== SyntaxKind.MethodDeclaration) || (typeof fileName !== 'string') || !CSHARP_IMPLICIT_API_FILE.test(fileName)) {
                return undefined;
            }
            returned = checker.getReturnTypeOfSignature(signature);
            if (this.getTypeFromRawType(returned) !== this.PROMISE_TYPE_KEYWORD) {
                return undefined;
            }
            const resolved = checker.getTypeArguments(returned);
            return (resolved?.length === 1) ? this.csharpImplicitApiBodyType(resolved[0]) : undefined;
        } catch (e) {
            return undefined;
        }
    }

    csharpImplicitApiBodyType(type): string | undefined {
        const members = ((type.flags & TypeFlags.Union) !== 0) ? (type as UnionType).getTypes() : [ type ];
        const kinds = new Set<string>();
        for (const member of members) {
            if ((member.flags & TypeFlags.String) !== 0) {
                kinds.add('string');
            } else if (member.getSymbol()?.escapedName === 'Array') {
                const element = this.csharpPromiseAllIndexType(member);
                if ((element === undefined) || ((element.flags & TypeFlags.Any) === 0)) {
                    return undefined;
                }
                kinds.add('List<object>');
            } else if (this.csharpPromiseAllIsIndexOnlyObject(member)) {
                kinds.add('Dictionary<string, object>');
            } else {
                return undefined;
            }
        }
        // several members have no honest narrowing: the generated api keeps `Task<object>` for them
        return (kinds.size === 1) ? [ ...kinds ][0] : ((kinds.size > 1) ? 'object' : undefined);
    }

    // ==== parameter types (list, bool, override spellings) ====

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

    // the identifier is written (assigned, ++/--) anywhere in its enclosing function
    csharpParameterWrittenAnywhere(identifier): boolean {
        const scope = this.csharpEnclosingFunction(identifier);
        if (scope === undefined) {
            return true;
        }
        const name = identifier.text as string;
        let written = false;
        const visit = (n) => {
            if (written) {
                return;
            }
            if ((n.kind === SyntaxKind.Identifier) && (n.text === name)) {
                const parent = n.parent;
                if (((parent?.kind === SyntaxKind.BinaryExpression) && (parent.left === n) && this.csharpIsAssignmentOperator(parent.operatorToken.kind))
                    || (((parent?.kind === SyntaxKind.PostfixUnaryExpression) || (parent?.kind === SyntaxKind.PrefixUnaryExpression))
                        && ((parent.operator === SyntaxKind.PlusPlusToken) || (parent.operator === SyntaxKind.MinusMinusToken)))) {
                    written = true;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return written;
    }

    // the array-parameter rule -- the type an array-annotated parameter prints with, or
    // undefined when the whole-program census (csharpListParamCensus) has not admitted it
    csharpArrayListParamType(node): string | undefined {
        if (node === undefined || node.kind !== SyntaxKind.Parameter || node.name === undefined || node.dotDotDotToken !== undefined) {
            return undefined;
        }
        const method: any = findAncestor(node, (n) => isMethodDeclaration(n));
        if (method === undefined || method.name === undefined || method.parameters === undefined) {
            return undefined;
        }
        // cheap pre-filter: an `X[]` / `X[] | undefined` / `Strings` annotation, or a loosely typed override
        const loose = (node.type === undefined) || (node.type.kind === SyntaxKind.AnyKeyword);
        if (!csharpSyntacticArrayType(node.type) && !(loose && method.parent?.heritageClauses !== undefined)) {
            return undefined;
        }
        const index = method.parameters.indexOf(node);
        if (index < 0) {
            return undefined;
        }
        const census = this.csharpListParamCensus();
        const key = method.name.getText().trim() + ':' + index;
        const admitted = (census === undefined) ? undefined : census.get(key);
        if (admitted === true && csharpListParamBaseKeys.get(this.getProgram() as any)?.has(key)) {
            this.csharpBaseListParamDeclarations.add(node);
        }
        return (admitted === true) ? 'IList<object>' : undefined;
    }

    // a top-level function's `string[]` parameter holds a list box; the list interface types it
    // unless the body rebinds the name
    csharpFunctionStringListParamType(node): string | undefined {
        const fn: any = node.parent;
        if (fn?.kind !== SyntaxKind.FunctionDeclaration || fn.body === undefined || !isIdentifier(node.name)
            || node.type?.kind !== SyntaxKind.ArrayType || node.type.elementType?.kind !== SyntaxKind.StringKeyword) {
            return undefined;
        }
        let written = false;
        this.csharpWalkIdentifiers(fn.body, (identifier: any) => {
            const parent: any = identifier.parent;
            if (!written && this.csharpIsSameDeclaration(identifier, node) && isBinaryExpression(parent) && parent.left === identifier) {
                written = CSHARP_ASSIGNMENT_OPERATOR_KINDS.indexOf(parent.operatorToken.kind) >= 0;
            }
        });
        return written ? undefined : 'IList<object>';
    }

    // The C# spelling an annotation proves, or undefined: an array (or a `T[] | undefined` union)
    // whose cells the generated C# holds as `object` -- an `any` cell, a JSON dictionary, or a row
    // class/interface (a TS object is a Dictionary<string, object> in every generated port). A
    // `string`/`number`/`boolean` cell and a nested array keep their own C# type, so they decline.
    csharpListParamSpelling(node, anyCell = false): string | undefined {
        return this.csharpListSpellingOfType(this.getChecker().getTypeAtLocation(node), 1, anyCell);
    }

    // anyCell: the base tier boxes every array cell (`string[]`, `number[][]`) as the list's `object`
    csharpListSpellingOfType(type, unionArms = 1, anyCell = false): string | undefined {
        if (type === undefined || unionArms !== 1) {
            return undefined;
        }
        const checker: any = this.getChecker();
        if (type.isUnionType && type.isUnionType()) {
            const arms = (type.getTypes() ?? []).filter((arm) => (arm.flags & (TypeFlags.Undefined | TypeFlags.Null)) === 0);
            return (arms.length === 1) ? this.csharpListSpellingOfType(arms[0], arms.length, anyCell) : undefined;
        }
        if (type.flags & (TypeFlags.TypeParameter | TypeFlags.Any | TypeFlags.Unknown | TypeFlags.EnumLike)) {
            return undefined;
        }
        if (!checker.isArrayType(type) && !checker.isTupleType(type)) {
            return undefined;
        }
        const element = (checker.getTypeArguments(type) || [])[0];
        if (element === undefined) {
            return undefined;
        }
        if (element.flags & (TypeFlags.Any | TypeFlags.Unknown)) {
            return 'IList<object>';
        }
        if (anyCell) {
            return 'IList<object>';
        }
        if (checker.isArrayType(element) || checker.isTupleType(element)) {
            return undefined;
        }
        if (this.isStringType(element.flags) || (element.flags & (TypeFlags.NumberLike | TypeFlags.BooleanLike))) {
            return undefined;
        }
        const declarations = element.getSymbol?.()?.declarations ? element.getSymbol().declarations.map((declaration) => declaration.resolve()) : [];
        if (declarations.some((declaration) => (declaration.kind === SyntaxKind.ClassDeclaration) || (declaration.kind === SyntaxKind.InterfaceDeclaration))) {
            return 'IList<object>';
        }
        if (element.getCallSignatures && element.getCallSignatures().length > 0) {
            return undefined;
        }
        return (checker.getIndexTypeOfType(element, IndexKind.String) !== undefined) ? 'IList<object>' : undefined;
    }

    // The (method, position) pairs the program proves, built once: every declaration of the pair
    // spells a JSON-cell array, and every call the program resolves for it passes one (or omits it)
    csharpListParamCensus(): Map<string, boolean> | undefined {
        const program: any = this.getProgram();
        if (program === undefined || typeof program.getSourceFileNames !== 'function') {
            return undefined;
        }
        let census = csharpListParamCensuses.get(program);
        if (census !== undefined) {
            return census;
        }
        census = new Map<string, boolean>();
        const baseKeys = new Set<string>();
        csharpListParamBaseKeys.set(program, baseKeys);
        const declarations = new Map<string, any[]>();
        const calls = new Map<string, any[]>();
        const add = (table: Map<string, any[]>, key: string, value: any) => {
            const row = table.get(key);
            if (row === undefined) {
                table.set(key, [ value ]);
            } else {
                row.push(value);
            }
        };
        for (const name of program.getSourceFileNames() as any[]) {
            const file: any = program.getSourceFile(name);
            if (file === undefined) {
                continue;
            }
            const fileName = String(file.fileName ?? name);
            if (fileName.endsWith('.d.ts') || fileName.includes('node_modules')) {
                continue;
            }
            const walk = (node: any) => {
                if (isMethodDeclaration(node) && node.name !== undefined && node.parameters !== undefined && node.parameters.length > 0) {
                    const methodName = node.name.getText().trim();
                    Array.from(node.parameters as any).forEach((parameter: any, index: number) => {
                        if (parameter.dotDotDotToken === undefined && node.body !== undefined) {
                            add(declarations, methodName + ':' + index, parameter);
                        }
                    });
                } else if (isCallExpression(node) && isPropertyAccessExpression(node.expression) && isIdentifier(node.expression.name)) {
                    add(calls, node.expression.name.getText().trim(), node);
                }
                node.forEachChild(walk);
            };
            file.forEachChild(walk);
        }
        // one decision per key, memoized: an ARGUMENT that is itself a parameter of this rule needs
        // that parameter's OWN decision, and a cycle of such hand-offs keeps both boxed
        const memo = new Map<string, boolean>();
        const visiting = new Set<string>();
        const decide = (key: string): boolean => {
            const cached = memo.get(key);
            if (cached !== undefined) {
                return cached;
            }
            if (visiting.has(key)) {
                return false;
            }
            visiting.add(key);
            const separator = key.lastIndexOf(':');
            const methodName = key.substring(0, separator);
            const index = Number(key.substring(separator + 1));
            let admitted = !(typeof this.csharpListParamExclusions === 'function' && this.csharpListParamExclusions(methodName, index));
            const rows = declarations.get(key) ?? [];
            // a base-tier declaration fixes the spelling (declared type alone); overrides must follow it
            const baseTier = rows.some((parameter) => csharpListParamFileIsPrintedAlone(parameter));
            if (rows.some((parameter) => csharpListParamFileIsPrintedAlone(parameter) && csharpListParamInTradingTier(parameter))) {
                admitted = false;
            }
            if (baseTier) {
                baseKeys.add(key);
                if ((CSHARP_BASE_LIST_PARAM_DICT_OVERRIDES[methodName] ?? []).includes(index)) {
                    admitted = false;
                }
            }
            for (const parameter of rows) {
                // an override of a base-tier member follows the base spelling whatever it annotates
                const followsBase = baseTier && !csharpListParamFileIsPrintedAlone(parameter) && this.csharpListParamBodyReadsAsList(parameter);
                // the signature printer only types an array annotation: the census must say the same
                if (baseTier && !followsBase && !csharpSyntacticArrayType(parameter.type)) {
                    admitted = false;
                    break;
                }
                if (!followsBase && this.csharpListParamSpelling(parameter, baseTier) !== 'IList<object>') {
                    admitted = false;
                    break;
                }
                if (this.csharpListParamIsWritten(parameter)) {
                    admitted = false; // a body that rebinds the box would assign an object into an IList
                    break;
                }
            }
            if (admitted && !baseTier) {
                for (const call of calls.get(methodName) ?? []) {
                    const args = Array.from((call.arguments ?? []) as any);
                    if (index >= args.length) {
                        continue; // an omitted argument prints the parameter's own default
                    }
                    if (this.csharpListParamArgumentPrintsList(args[index], decide)) {
                        continue; // the argument's own C# declaration already holds a list
                    }
                    admitted = false; // an `object` argument would need a conversion at the call site
                    break;
                }
            }
            visiting.delete(key);
            memo.set(key, admitted);
            return admitted;
        };
        for (const key of declarations.keys()) {
            census.set(key, decide(key));
        }
        csharpListParamCensuses.set(program, census);
        return census;
    }

    // whether every read of a parameter in its method body is a list read (`.length`, a non-string
    // index, an argument): a string-keyed read means the value is a dictionary at run time
    csharpListParamBodyReadsAsList(parameter): boolean {
        const name = (parameter.name === undefined || parameter.name.getText === undefined) ? '' : parameter.name.getText().trim();
        const method: any = findAncestor(parameter, (n) => isMethodDeclaration(n));
        if (name === '' || method === undefined || method.body === undefined) {
            return name !== '';
        }
        let list = true;
        const walk = (node: any) => {
            if (!list) {
                return;
            }
            if (isElementAccessExpression(node) && isIdentifier(node.expression) && node.expression.text === name) {
                const argumentType = this.getChecker().getTypeAtLocation(node.argumentExpression);
                if (isStringLiteral(node.argumentExpression) || (argumentType !== undefined && this.isStringType(argumentType.flags))) {
                    list = false;
                    return;
                }
            }
            if (isPropertyAccessExpression(node) && isIdentifier(node.expression) && node.expression.text === name && node.name.text !== 'length') {
                list = false;
                return;
            }
            // `this.safeList (param, 'key')`: a string key into the parameter is a dictionary read
            if (isCallExpression(node) && node.arguments.length >= 2 && isIdentifier(node.arguments[0]) && node.arguments[0].text === name && isStringLiteral(node.arguments[1])) {
                list = false;
                return;
            }
            node.forEachChild(walk);
        };
        method.body.forEachChild(walk);
        return list;
    }

    csharpArgumentMayBeList(type): boolean {
        if (type === undefined) {
            return false;
        }
        if (type.isUnionType && type.isUnionType()) {
            const arms = (type.getTypes() ?? []).filter((arm) => (arm.flags & (TypeFlags.Undefined | TypeFlags.Null)) === 0);
            return arms.length > 0 && arms.every((arm) => this.csharpArgumentMayBeList(arm));
        }
        const checker: any = this.getChecker();
        return ((type.flags & (TypeFlags.Any | TypeFlags.Unknown)) !== 0) || checker.isArrayType(type) || checker.isTupleType(type);
    }

    // A call of a base-tier method whose array parameter this rule typed from its declared type: an
    // argument the printer does not hold as a list is converted at the call (toArray)
    printArgsForCallExpression(node, identation) {
        const callee: any = node.expression;
        const fileName = String(node.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
        const exchangeSource = fileName.includes('ts/src/') && !/\/test\//.test(fileName) && !fileName.includes('examples/');
        if (!exchangeSource || node.kind !== SyntaxKind.CallExpression || !isPropertyAccessExpression(callee) || !isIdentifier(callee.name) || node.arguments.length === 0) {
            return super.printArgsForCallExpression(node, identation);
        }
        const census = this.csharpListParamCensus();
        const baseKeys = (census === undefined) ? undefined : csharpListParamBaseKeys.get(this.getProgram() as any);
        const name = callee.name.getText().trim();
        if (census === undefined || baseKeys === undefined || !Array.from(baseKeys).some((key) => key.startsWith(name + ':'))) {
            return super.printArgsForCallExpression(node, identation);
        }
        const decide = (key: string) => census.get(key) === true;
        return Array.from(node.arguments as any).map((argument: any, index: number) => {
            const printed = this.printNode(argument, identation).trim();
            const key = name + ':' + index;
            if (!baseKeys.has(key) || census.get(key) !== true || printed === 'null') {
                return printed;
            }
            let inner: any = argument;
            while (isParenthesizedExpression(inner)) {
                inner = inner.expression;
            }
            const proven = this.csharpExpressionTypeOf(inner);
            if ((proven === 'List<object>') || (proven === 'IList<object>')) {
                return printed;
            }
            if (!isAsExpression(inner) && this.csharpListParamArgumentPrintsList(inner, decide)) {
                return printed;
            }
            // only an `any` or array argument can be a list at run time; a scalar or dictionary stays as printed
            if (!this.csharpArgumentMayBeList(this.getChecker().getTypeAtLocation(inner))) {
                return printed;
            }
            // toArray keeps a List<object> as is and re-boxes a typed list (a hard cast would throw)
            return `this.toArray(${printed})`;
        }).join(', ');
    }

    // whether the method body rebinds the parameter (an assignment or ++/--): the declaration
    // would then have to accept a value that is not a list
    csharpListParamIsWritten(parameter): boolean {
        const name = (parameter.name === undefined || parameter.name.getText === undefined) ? '' : parameter.name.getText().trim();
        if (name === '') {
            return true;
        }
        const method: any = findAncestor(parameter, (n) => isMethodDeclaration(n));
        if (method === undefined || method.body === undefined) {
            return false;
        }
        let written = false;
        const walk = (node: any) => {
            if (written) {
                return;
            }
            if (isBinaryExpression(node) && isIdentifier(node.left) && (node.left.text === name) && this.csharpIsAssignmentOperator(node.operatorToken.kind)) {
                written = true;
                return;
            }
            if ((isPrefixUnaryExpression(node) || isPostfixUnaryExpression(node)) && isIdentifier(node.operand) && (String(node.operand.getText()).trim() === name)) {
                written = true;
                return;
            }
            node.forEachChild(walk);
        };
        method.body.forEachChild(walk);
        return written;
    }

    // whether a variable binding is rebound anywhere in its function (assignment or ++/--)
    csharpListBindingIsWritten(declaration): boolean {
        const name = (declaration.name === undefined || declaration.name.getText === undefined) ? '' : declaration.name.getText().trim();
        if (name === '') {
            return true;
        }
        const fn: any = findAncestor(declaration, (n) => isFunctionLike(n));
        if (fn === undefined || fn.body === undefined) {
            return false;
        }
        let written = false;
        const walk = (node: any) => {
            if (written) {
                return;
            }
            if (isBinaryExpression(node) && isIdentifier(node.left) && (node.left.text === name) && this.csharpIsAssignmentOperator(node.operatorToken.kind)) {
                written = true;
                return;
            }
            if ((isPrefixUnaryExpression(node) || isPostfixUnaryExpression(node)) && isIdentifier(node.operand) && (String(node.operand.getText()).trim() === name)) {
                written = true;
                return;
            }
            node.forEachChild(walk);
        };
        fn.body.forEachChild(walk);
        return written;
    }

    // whether the argument's own printed C# declaration holds a list: an array literal, an
    // identifier whose declaration this printer types as a list (or a parameter this rule types
    // for its own key), or an initializer the printer's local table names as one
    csharpListParamArgumentPrintsList(argument, decide?: (key: string) => boolean): boolean {
        let node: any = argument;
        while (node !== undefined && (isAsExpression(node) || isParenthesizedExpression(node))) {
            node = node.expression;
        }
        if (node === undefined) {
            return true;
        }
        if (isArrayLiteralExpression(node)) {
            return true;
        }
        if (isIdentifier(node)) {
            const declaration: any = this.csharpReceiverBinding(node);
            if (declaration === undefined) {
                return false;
            }
            if (declaration.kind === SyntaxKind.Parameter) {
                // a parameter of the same rule: only the census decision of ITS OWN key prints a
                // list -- the annotation alone admits a parameter a sibling proof kept boxed
                const method: any = findAncestor(declaration, (n) => isMethodDeclaration(n));
                if (decide === undefined || method === undefined || method.name === undefined || method.parameters === undefined) {
                    return false;
                }
                const position = (method.parameters as any).indexOf(declaration);
                return (position < 0) ? false : decide(method.name.getText().trim() + ':' + position);
            }
            if (!isVariableDeclaration(declaration)) {
                return false;
            }
            // the declaration must be the one the printer emits as a list: a single binding, never
            // rebound, and a type this printer's own local table names -- the value oracle answers
            // for locals the build layer leaves `object`
            if (((declaration.parent as any)?.declarations?.length ?? 1) !== 1) {
                return false;
            }
            if (this.csharpListBindingIsWritten(declaration)) {
                return false;
            }
            const type: string | undefined = this.getCSharpLocalType(declaration);
            return (type === 'List<object>') || (type === 'IList<object>');
        }
        const type: string | undefined = this.csharpTypeOfInitializer(node);
        return (type === 'List<object>') || (type === 'IList<object>');
    }

    // A parameter of a method that participates in an override relation prints the spelling its
    // base member and every sibling override agree on (CSHARP_OVERRIDE_PARAM_TYPES): C# is
    // invariant on override parameter types, so a half-retyped name is CS0115, while a name the
    printParameterType(node) {
        if (node === undefined || node.kind !== SyntaxKind.Parameter) {
            return super.printParameterType(node);
        }
        const listType = this.csharpArrayListParamType(node) ?? this.csharpFunctionStringListParamType(node);
        if (listType !== undefined) {
            return listType;
        }
        const method: any = findAncestor(node, (n) => isMethodDeclaration(n));
        const name = method === undefined || method.name === undefined ? undefined : method.name.getText().trim();
        const row = name === undefined ? undefined : CSHARP_OVERRIDE_PARAM_TYPES[name as string];
        const wanted = row === undefined ? undefined : row[method.parameters.indexOf(node)];
        if (wanted === undefined) {
            const booleanParam = this.csharpBooleanParamType(node);
            return (booleanParam === undefined) ? super.printParameterType(node) : booleanParam;
        }
        if (this.csharpOverrideParamSpelling(node) !== wanted) {
            return super.printParameterType(node);
        }
        return wanted;
    }

    // checker spelling of a parameter the override table covers: a dictionary-shaped type (string
    // index signature, never a class instance or a callable) or an array of any/dictionary cells
    csharpOverrideParamSpelling(node): string | undefined {
        const type = this.getChecker().getTypeAtLocation(node);
        if (type === undefined || !type.isUnionType()) {
            return this.csharpOverrideParamSpellingOfType(type, 1);
        }
        const arms = type.getTypes().filter((m) => !(m.flags & (TypeFlags.Undefined | TypeFlags.Null)));
        return this.csharpOverrideParamSpellingOfType(arms[0], arms.length);
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
        const declarations = type.getSymbol()?.declarations ? type.getSymbol().declarations.map((d) => d.resolve()) : [];
        if (declarations.some((d) => d.kind === SyntaxKind.ClassDeclaration)) {
            return undefined;   // a class instance is not a JSON dictionary
        }
        if (type.getCallSignatures && type.getCallSignatures().length > 0) {
            return undefined;   // a callable is not a JSON dictionary
        }
        return 'IDictionary<string, object>';
    }

    // A `boolean` parameter of a generated method prints `bool?` only when the whole-program
    // call-site census proves every argument at that position is a C# bool (see the census
    // below): C# is invariant on arguments, so a single caller passing `object` is CS1503 and
    // that parameter has to stay `object`.
    csharpBooleanParamType(node) {
        if (node?.kind !== SyntaxKind.Parameter) {
            return undefined;
        }
        if (this.checkerOrUndefined() === undefined) {
            return undefined;
        }
        const method: any = findAncestor(node, (n) => isMethodDeclaration(n));
        if (method === undefined) {
            return undefined;
        }
        const index = method.parameters.indexOf(node);
        if (index < 0) {
            return undefined;
        }
        const accepted = this.csharpBooleanParamCensus().get(method);
        return (accepted?.has(index) === true) ? this.BOOLEAN_KEYWORD + '?' : undefined;
    }

    csharpBooleanParamCensus(): Map<Node, Set<number>> {
        const program = this.getProgram();
        const cached = this.csharpBooleanParamProofs.get(program);
        if (cached !== undefined) {
            return cached;
        }
        // installed before the walk: a census that throws leaves the printer on the untyped
        // emission instead of retrying for every parameter
        const accepted = new Map<Node, Set<number>>();
        this.csharpBooleanParamProofs.set(program, accepted);
        const candidates = [];
        const byName = new Map<string, any[]>();
        const blocked = new Set<Node>();
        const collect = (node) => {
            if (node?.kind === SyntaxKind.MethodDeclaration) {
                this.csharpBooleanParamCandidateRows(node, candidates, byName);
            }
            node.forEachChild(collect);
        };
        const sources = program.getSourceFileNames().map((name) => program.getSourceFile(name)).filter((file) => file !== undefined);
        for (const file of sources) {
            if (file.isDeclarationFile) {
                continue;
            }
            file.forEachChild(collect);
        }
        if (candidates.length === 0) {
            return accepted;
        }
        // call sites: only the names a candidate declares reach the checker
        const walk = (node) => {
            if (node?.kind === SyntaxKind.CallExpression) {
                const callee = node.expression;
                const name = (callee?.kind === SyntaxKind.PropertyAccessExpression)
                    ? this.csharpNodeText(callee.name)
                    : this.csharpNodeText(callee);
                const rows = (name === undefined) ? undefined : byName.get(name as string);
                if (rows !== undefined) {
                    const declaration: any = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
                    const key = this.csharpNodePositionKey(declaration);
                    for (const row of rows) {
                        if ((key !== undefined) && (row.key === key)) {
                            row.calls.push({ arguments: node.arguments ?? [] });
                        }
                    }
                }
                // `this.spawn (this.method, a, b)` invokes the method with the trailing arguments
                const spawned = this.csharpSpawnedMethodCall(node);
                if (spawned !== undefined) {
                    const spawnedRows = byName.get(spawned.name);
                    for (const row of spawnedRows ?? []) {
                        if (row.key === spawned.key) {
                            row.calls.push({ arguments: spawned.arguments });
                        }
                    }
                }
            }
            node.forEachChild(walk);
        };
        for (const file of sources) {
            if (file.isDeclarationFile) {
                continue;
            }
            file.forEachChild(walk);
        }
        // a call this printer cannot bind (a spread, more arguments than the signature declares)
        // blocks the whole method: the argument would not convert
        for (const row of candidates) {
            for (const call of row.calls) {
                const args = call.arguments;
                const spread = args.some((a) => a.kind === SyntaxKind.SpreadElement);
                if (spread || (args.length > row.method.parameters.length)) {
                    blocked.add(row.method);
                }
            }
        }
        let changed = true;
        while (changed) {
            changed = false;
            for (const row of candidates) {
                if (blocked.has(row.method) || (accepted.get(row.method)?.has(row.index) === true)) {
                    continue;
                }
                // no call site in this program is no proof: a caller in another stage (rails that
                // print in their own batch) would still have to convert
                const proven = (row.calls.length > 0) && row.calls.every((call) => this.csharpBooleanArgumentProven(call, row.index, accepted));
                if (!proven) {
                    continue;
                }
                if (accepted.get(row.method) === undefined) {
                    accepted.set(row.method, new Set());
                }
                accepted.get(row.method).add(row.index);
                changed = true;
            }
        }
        return accepted;
    }

    // `this.spawn (this.method, a, b)`: the method name, its declaration's position key and the
    // arguments it is invoked with (undefined for any other call)
    csharpSpawnedMethodCall(node): { name: string, key: string, arguments: any[] } | undefined {
        const callee = node.expression;
        if ((callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.expression?.kind !== SyntaxKind.ThisKeyword) || (this.csharpNodeText(callee.name) !== 'spawn')) {
            return undefined;
        }
        const target = node.arguments?.[0];
        if ((target?.kind !== SyntaxKind.PropertyAccessExpression) || (target.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        const name = this.csharpNodeText(target.name);
        const declaration: any = (name === undefined) ? undefined : this.getChecker().getSymbolAtLocation(target.name)?.valueDeclaration?.resolve();
        const key = this.csharpNodePositionKey(declaration);
        return (key === undefined) ? undefined : { name: name as string, key, arguments: node.arguments.slice(1) };
    }

    // candidate rows of one method declaration: a body-carrying method that overrides nothing
    // (C# is invariant on override parameter types, CS0115) and has a boolean parameter
    csharpBooleanParamCandidateRows(node, candidates, byName) {
        if (node.body === undefined || node.name?.kind !== SyntaxKind.Identifier) {
            return;
        }
        if (!isClassDeclaration(node.parent) || (this.getMethodOverride(node) !== undefined)) {
            return;
        }
        for (let index = 0; index < node.parameters.length; index++) {
            const parameter = node.parameters[index];
            if ((parameter.dotDotDotToken !== undefined) || !this.csharpParamIsBooleanTyped(parameter)) {
                continue;
            }
            const row = { method: node, key: this.csharpNodePositionKey(node), index, calls: [] };
            candidates.push(row);
            const name = this.csharpNodeText(node.name);
            const rows = byName.get(name);
            if (rows === undefined) {
                byName.set(name, [ row ]);
            } else {
                rows.push(row);
            }
        }
    }

    // `boolean`, `boolean | undefined` / `| null` and the literal-boolean unions; a mixed union
    // or `any` keeps the parameter `object`
    csharpParamIsBooleanTyped(parameter) {
        if (parameter.type === undefined) {
            // an un-annotated `flag = false` parameter is the boolean its literal default says
            const init = parameter.initializer;
            return (init?.kind === SyntaxKind.TrueKeyword) || (init?.kind === SyntaxKind.FalseKeyword);
        }
        const type = this.getChecker().getTypeFromTypeNode(parameter.type);
        if (type === undefined) {
            return false;
        }
        if (type.flags & TypeFlags.BooleanLike) {
            return true;
        }
        if (!type.isUnionType()) {
            return false;
        }
        let booleans = 0;
        for (const member of type.getTypes()) {
            if (member.flags & (TypeFlags.Undefined | TypeFlags.Null)) {
                continue;
            }
            if ((member.flags & TypeFlags.BooleanLike) === 0) {
                return false;
            }
            booleans += 1;
        }
        return booleans > 0;
    }

    // One call-site argument of a boolean parameter: a bool literal, `null` / `undefined`, a shape
    // the printer already renders as a C# bool, or the caller's own proven `bool?` parameter.
    // Locals keep the parameter `object`: their printed type is the build layer's decision and
    // this census cannot see it (a `var` from a tuple element prints `object`).
    csharpBooleanArgumentProven(call, index, accepted) {
        let value = call.arguments[index];
        if (value === undefined) {
            return true;
        }
        while (value.kind === SyntaxKind.ParenthesizedExpression) {
            value = value.expression;
        }
        if (value.kind === SyntaxKind.TrueKeyword || value.kind === SyntaxKind.FalseKeyword || value.kind === SyntaxKind.NullKeyword) {
            return true;
        }
        if (value.kind === SyntaxKind.Identifier) {
            if (this.csharpNodeText(value) === 'undefined') {
                return true; // prints `null`, which a `bool?` accepts
            }
            const declaration: any = this.getChecker().getSymbolAtLocation(value)?.valueDeclaration?.resolve();
            if (declaration?.kind !== SyntaxKind.Parameter) {
                // a local: only a declaration printed `bool` / `bool?` converts (`var` boxes bool
                // into object)
                const local = this.csharpDeclaredLocalType(value);
                return (local === 'bool') || (local === 'bool?');
            }
            const method: any = findAncestor(declaration, (n) => isMethodDeclaration(n));
            const parameterIndex = (method === undefined) ? -1 : method.parameters.indexOf(declaration);
            return (parameterIndex >= 0) && (accepted.get(method)?.has(parameterIndex) === true);
        }
        return this.csharpConditionPrintsBool(value);
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
        const listType = this.csharpArrayListParamType(node);
        if (listType !== undefined) {
            // the printed declaration is final, so the body's .length / element reads of this
            // parameter are that list and print Count / the guarded indexer
            this.csharpTypedLocals.set(node, listType);
            this.csharpListParamDeclarations.add(node);
        }
        let type = handlerType !== undefined ? handlerType : this.printParameterType(node);
        type = type ? type : "";
        this.csharpParamTypes.set(node, type); // see csharpPrintedParamType

        if (defaultValue) {
            if (initializer) {
                const customDefaultValue = this.printCustomDefaultValueIfNeeded(initializer);
                const defaultValue = customDefaultValue ? customDefaultValue : this.printNode(initializer, 0);
                const baseList = this.csharpBaseListParamDeclarations.has(node);
                type = (defaultValue === "null" && type !== "object" && !baseList) ? (type.endsWith('?') ? type + " " : type + "? ") : type + " ";
                return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + defaultValue;
            }
            return type + " " + name;
        }
        return name;
    }

    // ==== hand-written runtime members, base fields and their views ====

    // a read of a hand-written BaseExchange dictionary member whose key may be absent: the key
    // test plus the indexer print what the helper computes, so a missing key still reads null
    // (a bare indexer would throw). The member's declared C# type (csharpDeclaredMemberType) names
    // the dictionary; any other receiver or a numeric key keeps the helper
    csharpMissingKeyFieldRead(expression, argumentExpression, isStringKey): string | undefined {
        const member = this.csharpMemberReceiver(expression);
        if (member === undefined || member.routed === true) {
            return undefined;
        }
        if (member.kind === 'list') {
            // a literal index into a declared list member: the helper's null and past-the-end branches
            const index = isNumericLiteral(argumentExpression) ? Number((argumentExpression as any).text) : NaN;
            if (!Number.isInteger(index) || (index < 0)) {
                return undefined;
            }
            return `(${member.text} != null && ${index} < ${member.text}.Count ? ${member.text}[${index}] : null)`;
        }
        if (!isStringKey) {
            return undefined;
        }
        const printedKey = this.printNode(argumentExpression, 0);
        const test = (member.nullTest === undefined) ? '' : `${member.nullTest} != null && `;
        return `(${test}${member.text}.ContainsKey(${printedKey}) ? ${member.text}[${printedKey}] : null)`;
    }

    // The typed C# dictionary a `this.<member>` / `this.<member>[<literal>]` read of the hand-written
    // BaseExchange is: a declared IDictionary member is itself, `object` members with a typed view
    // property (CSHARP_DICT_FIELD_VIEWS / CSHARP_DICT_ENTRY_VIEWS) are that view. Both may be null.
    // Parentheses and `as` assertions print as their operand. Any other node has no view and keeps its cast / the helper.
    csharpBaseDictionaryView(node): string | undefined {
        // `(this.urls['api'] as Dict)['ws']`: a parenthesis / type assertion prints as its operand
        while (isParenthesizedExpression(node) || isAsExpression(node)) {
            node = node.expression;
        }
        if (isPropertyAccessExpression(node) && node.expression.kind === SyntaxKind.ThisKeyword) {
            const name = node.name?.text as string;
            if (Object.prototype.hasOwnProperty.call(CSHARP_DICT_FIELD_VIEWS, name)) {
                return `this.${CSHARP_DICT_FIELD_VIEWS[name]}`;
            }
            return CSHARP_DECLARED_DICT_FIELDS.indexOf(name) >= 0 ? this.printNode(node, 0) : undefined;
        }
        if (isElementAccessExpression(node) && isStringLiteralLikeNode(node.argumentExpression)
            && isPropertyAccessExpression(node.expression) && node.expression.expression.kind === SyntaxKind.ThisKeyword) {
            const views = CSHARP_DICT_ENTRY_VIEWS[node.expression.name?.text as string];
            const key = (node.argumentExpression as any).text as string;
            return (views !== undefined && Object.prototype.hasOwnProperty.call(views, key)) ? `this.${views[key]}` : undefined;
        }
        return undefined;
    }

    // How a key identifier is spelled for a typed-view ContainsKey: 'string' when its emitted declaration
    // is a C# string (the printer's tables, then the build layer's declared-local record, which also
    // answers the core-argument parameters it narrows), 'object' for a parameter nobody retypes
    // (printed `object`: the helper's own `(string)` cast of the key), otherwise undefined
    csharpBaseDictionaryViewKeyKind(key): 'string' | 'object' | undefined {
        if (!isIdentifier(key)) {
            return undefined;
        }
        const declared = this.csharpDeclaredKeyType(key) ?? this.csharpDeclaredLocalResolverType(key) ?? this.csharpParameterOperandType(key);
        if (declared === 'string' || declared === 'string?') {
            return 'string';
        }
        if (declared !== 'object' || this.csharpReceiverBinding(key)?.kind !== SyntaxKind.Parameter) {
            return undefined;
        }
        // the `(string)` cast of an object parameter only compiles while the key can be a string box
        const flags = this.getChecker().getTypeAtLocation(key).flags;
        return (this.isStringType(flags) || (flags === TypeFlags.Any)) ? 'object' : undefined;
    }

    // `<view-able>[<key>]` with a literal or string-declared key: the helper's null-receiver, null-key
    // and missing-key tests spelled with the typed view instead of getValue (a bare indexer would throw)
    csharpBaseDictionaryViewRead(expression, argumentExpression): string | undefined {
        const view = this.csharpBaseDictionaryView(expression);
        if (view === undefined || !this.csharpIsPlainRead(argumentExpression.parent)) {
            return undefined;
        }
        const printedKey = this.printNode(argumentExpression, 0);
        if (isStringLiteralLikeNode(argumentExpression)) {
            return `(${view} != null && ${view}.ContainsKey(${printedKey}) ? ${view}[${printedKey}] : null)`;
        }
        const kind = this.csharpBaseDictionaryViewKeyKind(argumentExpression);
        if (kind === undefined) {
            return undefined;
        }
        // GetValue's dictionary branch casts an object key to string, so a non-string key throws there too
        const key = (kind === 'string') ? printedKey : `(string)${printedKey}`;
        return `(${view} != null && ${printedKey} != null && ${view}.ContainsKey(${key}) ? ${view}[${key}] : null)`;
    }

    // `key in <view-able>` with a literal or string-declared key: InOp's dictionary branch on the typed view
    // (a null receiver or key answers false, as the helper does)
    csharpBaseDictionaryViewIn(key, obj): string | undefined {
        const view = this.csharpBaseDictionaryView(obj);
        if (view === undefined) {
            return undefined;
        }
        const printedKey = this.printNode(key, 0);
        if (isStringLiteralLikeNode(key)) {
            return `(${view} != null && ${view}.ContainsKey(${printedKey}))`;
        }
        return (this.csharpBaseDictionaryViewKeyKind(key) === 'string')
            ? `(${view} != null && ${printedKey} != null && ${view}.ContainsKey(${printedKey}))` : undefined;
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

    // the C# value kind of a `this.<field>` read of a hand-written numeric field
    // (CSHARP_SCALAR_FIELD_KINDS), or undefined for every other read
    csharpScalarFieldKind(node): string | undefined {
        while (node?.kind === SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        if (!isPropertyAccessExpression(node) || (node.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return undefined;
        }
        const named = CSHARP_SCALAR_FIELD_KINDS[node.name?.text as string];
        return (named === undefined) ? undefined : this.csharpValueEqualityKind(named);
    }

    // `isEqual (this.<number>, N)` -> `==` / `!=`: the field's C# declaration is a non-nullable
    // number, so the operator is isEqual's integer/double branch and a literal it holds converts
    // exactly. Two such fields of one kind compare by value in both; every other shape keeps the
    // helper (precisionMode is an `object` box, so it never reaches here).
    csharpNativeScalarFieldEquality(left, right, leftText: string, rightText: string, isEquality: boolean): string | undefined {
        const leftKind = this.csharpScalarFieldKind(left);
        const rightKind = this.csharpScalarFieldKind(right);
        if ((leftKind !== undefined) && (rightKind !== undefined)) {
            if (leftKind !== rightKind) {
                return undefined;
            }
            return isEquality ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        if ((leftKind === undefined) && (rightKind === undefined)) {
            return undefined;
        }
        const fieldKind = (leftKind === undefined) ? rightKind : leftKind;
        const literalKind = this.csharpIntegerLiteralKind((leftKind === undefined) ? left : right);
        if ((literalKind === undefined) || !this.csharpNumericKindHoldsLiteral(fieldKind, literalKind)) {
            return undefined;
        }
        return isEquality ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
    }

    csharpDeclaredDictMember(node): { getter?: string } | undefined {
        return undefined; // stub to override
    }

    // true when the printer printed this read as a typed member read (the build layer then drops the
    // `(ValueType)` box cast it would add around a helper read)
    csharpIsDeclaredDictMemberRead(node): boolean {
        return this.csharpDeclaredDictMemberReads.has(node);
    }

    // the receiver of the member is a parameter of the enclosing function: its printed type is the
    // hand-written class (ccxt's `object client` -> `WebSocketClient client`), whereas a local bound
    // from a call prints `var` and keeps the helper
    csharpDeclaredDictMemberReceiverIsParameter(member): boolean {
        return this.csharpReceiverBinding(member.expression)?.kind === SyntaxKind.Parameter;
    }

    csharpDeclaredDictMemberKey(key): string | undefined {
        if (isStringLiteralLikeNode(key)) {
            return this.printNode(key, 0);
        }
        if (!isIdentifier(key)) {
            return undefined;
        }
        const printedParam = this.csharpPrintedParamType(key); // a parameter whose printed signature is string
        if ((printedParam === 'string') || (printedParam === 'string?')) {
            return this.printNode(key, 0);
        }
        return this.csharpNativeStringKey(key) ?? this.csharpDeclaredStringKey(key);
    }

    csharpDeclaredDictMemberElementRead(node): string | undefined {
        if (node?.kind !== SyntaxKind.ElementAccessExpression || !isPropertyAccessExpression(node.expression)) {
            return undefined;
        }
        const parent = node.parent;
        const isWrite = (parent?.kind === SyntaxKind.BinaryExpression && parent.left === node
            && parent.operatorToken.kind >= SyntaxKind.FirstAssignment && parent.operatorToken.kind <= SyntaxKind.LastAssignment)
            || parent?.kind === SyntaxKind.DeleteExpression
            || ((parent?.kind === SyntaxKind.PrefixUnaryExpression || parent?.kind === SyntaxKind.PostfixUnaryExpression)
                && (parent.operator === SyntaxKind.PlusPlusToken || parent.operator === SyntaxKind.MinusMinusToken));
        const exception: any = this.printElementAccessExpressionExceptionIfAny(node);
        if (isWrite || exception || !this.ELEMENT_ACCESS_WRAPPER_OPEN || !this.ELEMENT_ACCESS_WRAPPER_CLOSE) {
            return undefined;
        }
        const member = this.csharpDeclaredDictMemberReceiverIsParameter(node.expression) ? this.csharpDeclaredDictMember(node.expression) : undefined;
        const key = this.csharpDeclaredDictMemberKey(node.argumentExpression);
        if (member === undefined || key === undefined) {
            return undefined;
        }
        const receiver = this.printNode(node.expression, 0);
        this.csharpDeclaredDictMemberReads.add(node);
        const keyTest = isStringLiteralLikeNode(node.argumentExpression) ? '' : ` && ${key} != null`;
        return `(${receiver} != null${keyTest} && ${receiver}.ContainsKey(${key}) ? ${receiver}[${key}] : null)`;
    }

    csharpDeclaredDictMemberCall(node): string | undefined {
        if (node?.kind !== SyntaxKind.CallExpression || node.arguments?.length !== 2) {
            return undefined;
        }
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression?.kind !== SyntaxKind.ThisKeyword || callee.name?.text !== 'safeValue') {
            return undefined;
        }
        const target = node.arguments[0];
        if (!isPropertyAccessExpression(target)) {
            return undefined;
        }
        const member = this.csharpDeclaredDictMemberReceiverIsParameter(target) ? this.csharpDeclaredDictMember(target) : undefined;
        const key = this.csharpDeclaredDictMemberKey(node.arguments[1]);
        if (member?.getter === undefined || key === undefined) {
            return undefined;
        }
        this.csharpDeclaredDictMemberReads.add(node);
        return `${this.printNode(target.expression, 0)}.${member.getter}(${key})`;
    }

    csharpDeclaredBaseFieldType(name: string): string | undefined {
        return Object.prototype.hasOwnProperty.call(this.csharpDeclaredBaseFields, name) ? this.csharpDeclaredBaseFields[name] : undefined;
    }

    // the member is declared a dictionary type in the hand-written base (so `(IDictionary<string, object>)this.<name>` is an identity cast)
    csharpBaseFieldDeclaredDictionary(name: string): boolean {
        const declared = (typeof this.csharpDeclaredBaseFieldType === 'function') ? this.csharpDeclaredBaseFieldType(name) : undefined;
        return (declared !== undefined) && (declared.indexOf('Dictionary<') >= 0);
    }

    // `this.<member>` whose hand-written declaration is a dictionary type (any table: the declaration is the proof)
    csharpBaseFieldIsDeclaredDictionary(node): boolean {
        return isPropertyAccessExpression(node) && (node.expression?.kind === SyntaxKind.ThisKeyword)
            && this.csharpBaseFieldDeclaredDictionary(node.name?.text as string);
    }

    // `this.<field>` that the table above declares and no printer table names, or undefined
    csharpBaseFieldName(node): string | undefined {
        if (!isPropertyAccessExpression(node) || node.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const name = node.name?.text as string;
        if ((CSHARP_NATIVE_FIELDS[name] !== undefined) || (CSHARP_OBJECT_DICT_FIELDS.indexOf(name) >= 0) || (CSHARP_MISSING_KEY_FIELDS_NATIVE.indexOf(name) >= 0)) {
            return undefined;
        }
        return (typeof this.csharpDeclaredBaseFieldType === 'function' && this.csharpDeclaredBaseFieldType(name) !== undefined) ? name : undefined;
    }

    // every write of `this.<name>` in the node's source file stores a dictionary (or null), and there is one
    csharpBaseFieldWritesAreDictionaries(node, name: string): boolean {
        const source: any = node.getSourceFile?.();
        if (source === undefined) {
            return false;
        }
        let writes = 0;
        let ok = true;
        const isField = (n) => isPropertyAccessExpression(n) && n.expression?.kind === SyntaxKind.ThisKeyword && n.name?.text === name;
        const visit = (n) => {
            if (!ok) {
                return;
            }
            if (isBinaryExpression(n) && this.csharpIsAssignmentOperator(n.operatorToken.kind) && isField(n.left)) {
                writes++;
                const right = n.right;
                const nullish = (right.kind === SyntaxKind.NullKeyword) || (isIdentifier(right) && right.text === 'undefined');
                const type = this.getChecker().getTypeAtLocation(right);
                if ((n.operatorToken.kind !== SyntaxKind.EqualsToken)
                    || !(nullish || isObjectLiteralExpression(right) || this.csharpIsDictionaryType(type) || this.csharpNullableDictionaryType(type))) {
                    ok = false;
                }
            }
            n.forEachChild(visit);
        };
        source.forEachChild(visit);
        return ok && writes > 0;
    }

    // the receiver text of a declared base-field dictionary, or undefined
    csharpBaseFieldDictionary(node): { text: string, type: string, field: string, name: string } | undefined {
        const name = this.csharpBaseFieldName(node);
        if (name === undefined) {
            return undefined;
        }
        const declared = this.csharpDeclaredBaseFieldType(name) as string;
        const field = this.printNode(node, 0);
        if (declared.indexOf('Dictionary<') >= 0) {
            return { text: field, type: declared, field, name };
        }
        if ((declared === 'object') && this.csharpBaseFieldWritesAreDictionaries(node, name)) {
            const cast = `((IDictionary<string,object>)${field})`;
            return { text: cast, type: 'IDictionary<string, object>', field: cast, name };
        }
        return undefined;
    }

    // the key of a declared base-field read: { text, cast } or undefined
    csharpBaseFieldKey(key, allowObject: boolean): { text: string, kind: 'literal' | 'string' | 'string?' | 'object' } | undefined {
        if (isStringLiteralLikeNode(key)) {
            return { text: this.printNode(key, 0), kind: 'literal' };
        }
        if (!isIdentifier(key)) {
            return undefined;
        }
        const declared = this.csharpDeclaredKeyType(key) ?? this.csharpPrintedParamType(key) ?? this.csharpParameterOperandType(key);
        if ((declared === 'string') || (declared === 'string?')) {
            return { text: this.printNode(key, 0), kind: declared };
        }
        if ((declared !== undefined) && (declared !== 'object')) {
            return undefined;
        }
        if (!allowObject) {
            return undefined; // a dictionary-declared member: only a key the printed declaration proves a string
        }
        // a parameter the body writes gets a shadow local the embedding build layer retypes after printing:
        // a `(string)` cast here would hide the string-typed use from that retype, so the helper stays
        const binding: any = this.csharpReceiverBinding(key);
        if ((binding?.kind === SyntaxKind.Parameter) && ((binding.initializer !== undefined) || this.csharpParameterWrittenAnywhere(key))) {
            return undefined; // a default value prints a `??=` prologue: the same shadow
        }
        const type = this.getChecker().getTypeAtLocation(key);
        const members = ((type.flags & TypeFlags.Union) !== 0) ? ((type as UnionType).getTypes() ?? []) : [ type ];
        const strings = members.filter((t) => this.isStringType(t.flags)).length;
        const nullish = members.filter((t) => (t.flags & (TypeFlags.Undefined | TypeFlags.Null)) !== 0).length;
        return ((strings > 0) && (strings + nullish === members.length)) ? { text: this.printNode(key, 0), kind: 'object' } : undefined;
    }

    // `this.<field>[key]` as a read: the helper's null-receiver, null-key and missing-key answers as tests
    csharpBaseFieldElementRead(node): string | undefined {
        if (node?.kind !== SyntaxKind.ElementAccessExpression || !isPropertyAccessExpression(node.expression)) {
            return undefined;
        }
        const parent = node.parent;
        const isWrite = (parent?.kind === SyntaxKind.BinaryExpression && parent.left === node
            && parent.operatorToken.kind >= SyntaxKind.FirstAssignment && parent.operatorToken.kind <= SyntaxKind.LastAssignment)
            || parent?.kind === SyntaxKind.DeleteExpression
            || ((parent?.kind === SyntaxKind.PrefixUnaryExpression || parent?.kind === SyntaxKind.PostfixUnaryExpression)
                && (parent.operator === SyntaxKind.PlusPlusToken || parent.operator === SyntaxKind.MinusMinusToken));
        if (isWrite || !this.ELEMENT_ACCESS_WRAPPER_OPEN || !this.ELEMENT_ACCESS_WRAPPER_CLOSE || this.printElementAccessExpressionExceptionIfAny(node)) {
            return undefined;
        }
        const receiver = this.csharpBaseFieldDictionary(node.expression);
        const key = (receiver === undefined) ? undefined : this.csharpBaseFieldKey(node.argumentExpression, !this.csharpBaseFieldDeclaredDictionary(receiver.name));
        if (receiver === undefined || key === undefined) {
            return undefined;
        }
        const keyText = (key.kind === 'object') ? `(string)${key.text}` : key.text;
        // a non-nullable string key is its own proof on a member declared a dictionary; a string? / object key (and any key
        // through the object member's cast form) may hold null, where ContainsKey throws
        const keyTest = ((key.kind === 'literal') || ((key.kind === 'string') && this.csharpBaseFieldDeclaredDictionary(receiver.name))) ? '' : ` && ${key.text} != null`;
        return `(${receiver.field} != null${keyTest} && ${receiver.text}.ContainsKey(${keyText}) ? ${receiver.text}[${keyText}] : null)`;
    }

    // `key in this.<field>`: inOp's dictionary branch (a non-string key answers false)
    csharpBaseFieldInExpression(key, obj): string | undefined {
        const receiver = this.csharpBaseFieldDictionary(obj);
        const printedKey = (receiver === undefined) ? undefined : this.csharpBaseFieldKey(key, !this.csharpBaseFieldDeclaredDictionary(receiver.name));
        if (receiver === undefined || printedKey === undefined) {
            return undefined;
        }
        if (printedKey.kind === 'literal') {
            return `(${receiver.field} != null && ${receiver.text}.ContainsKey(${printedKey.text}))`;
        }
        if ((printedKey.kind === 'string') && this.csharpBaseFieldDeclaredDictionary(receiver.name)) {
            return `(${receiver.field} != null && ${receiver.text}.ContainsKey(${printedKey.text}))`; // a non-nullable string is its own key proof
        }
        if (printedKey.kind === 'string?') {
            return undefined; // a nullable string key keeps the existing nullable-key guard
        }
        if (printedKey.kind === 'string') {
            return `(${receiver.field} != null && ${printedKey.text} != null && ${receiver.text}.ContainsKey(${printedKey.text}))`;
        }
        // inOp's dictionary branch answers false for a non-string key: a declaration pattern tests and binds it once
        // (a bare `is string` on a key a later pass retypes `string` would be CS0183); one name per use in the file
        const source: any = key.getSourceFile?.();
        const used = this.csharpBaseFieldKeyNames.get(source) ?? 0;
        this.csharpBaseFieldKeyNames.set(source, used + 1);
        const bound = `entryKey${used}`;
        return `(${receiver.field} != null && ${printedKey.text} is string ${bound} && ${receiver.text}.ContainsKey(${bound}))`;
    }

    // `isEqual (a % b, N)` -> `((a % b) == N)` when both operands are Int64 / Int64? locals: the helper takes the double remainder and converts it back, which is the
    // integer remainder for every value the type holds in practice, and the lifted `%` / `==` answer false for a
    // null operand exactly where isEqual does against a non-null integer literal.
    csharpNativeModLiteralEquality(left, right, isEquality: boolean): string | undefined {
        const strip = (n) => {
            while (n?.kind === SyntaxKind.ParenthesizedExpression) {
                n = n.expression;
            }
            return n;
        };
        const l = strip(left);
        const r = strip(right);
        const modIsLeft = isBinaryExpression(l) && (l.operatorToken.kind === SyntaxKind.PercentToken);
        const mod = modIsLeft ? l : r;
        const literal = modIsLeft ? r : l;
        if (!isBinaryExpression(mod) || (mod.operatorToken.kind !== SyntaxKind.PercentToken) || (this.csharpIntegerLiteralKind(literal) === undefined)) {
            return undefined;
        }
        const int64 = (n) => [ 'Int64', 'Int64?', 'long', 'long?' ].indexOf(this.csharpArithmeticOperandType(n) as string) >= 0;
        const operand = (n) => isIdentifier(n) && int64(n);
        const divisor = mod.right;
        if (!operand(mod.left) || !operand(divisor)) {
            return undefined; // a literal divisor keeps mod(): the build layer's own mod rules print that one
        }
        const arithmetic = `(${this.printNode(mod.left, 0)} % ${this.printNode(divisor, 0)})`;
        const literalText = this.printNode(literal, 0);
        return isEquality ? `(${arithmetic} == ${literalText})` : `(${arithmetic} != ${literalText})`;
    }

    // `this.<member>['k1'][key]` over a member whose hand-written class declares a typed view of `['k1']`
    // (urls['api'] -> urlsApi): the key read goes through the view's own ContainsKey/indexer, carrying the
    // helper's null-receiver and null-key tests; an object key casts like GetValue. Other keys keep the helper.
    csharpMemberViewRead(node): string | undefined {
        if (node?.kind !== SyntaxKind.ElementAccessExpression || !this.ELEMENT_ACCESS_WRAPPER_OPEN || !this.ELEMENT_ACCESS_WRAPPER_CLOSE) {
            return undefined;
        }
        const entry = this.csharpUnwrapAssertion(node.expression);
        if (entry?.kind !== SyntaxKind.ElementAccessExpression || !isStringLiteralLikeNode(entry.argumentExpression)
            || !isPropertyAccessExpression(entry.expression) || entry.expression.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const parent = node.parent;
        const isWrite = (parent?.kind === SyntaxKind.BinaryExpression && parent.left === node
            && parent.operatorToken.kind >= SyntaxKind.FirstAssignment && parent.operatorToken.kind <= SyntaxKind.LastAssignment)
            || parent?.kind === SyntaxKind.DeleteExpression
            || ((parent?.kind === SyntaxKind.PrefixUnaryExpression || parent?.kind === SyntaxKind.PostfixUnaryExpression)
                && (parent.operator === SyntaxKind.PlusPlusToken || parent.operator === SyntaxKind.MinusMinusToken));
        if (isWrite || this.printElementAccessExpressionExceptionIfAny(node)) {
            return undefined;
        }
        const root = entry.expression;
        if (!this.csharpMemberDeclaredIn(root, 'this')) {
            return undefined;
        }
        const view = this.csharpDeclaredMember(root, 'this', root.name?.text as string)?.views?.[(entry.argumentExpression as any).text]?.view;
        if (view === undefined || !/^IDictionary<string,\s*object>$/.test(this.csharpDeclaredMember(root, 'this', view)?.type ?? '')) {
            return undefined;
        }
        const target = `this.${view}`;
        const key = node.argumentExpression;
        if (isStringLiteralLikeNode(key)) {
            const printed = this.printNode(key, 0);
            return `(${target} != null && ${target}.ContainsKey(${printed}) ? ${target}[${printed}] : null)`;
        }
        if (!isIdentifier(key) || !this.csharpIsPlainRead(key)) {
            return undefined;
        }
        const kind = this.csharpMemberKeyKind(key);
        const printedKey = this.printNode(key, 0);
        if (kind === 'string' || kind === 'string?') {
            return `(${target} != null && ${printedKey} != null && ${target}.ContainsKey(${printedKey}) ? ${target}[${printedKey}] : null)`;
        }
        if (kind === 'object' || kind === 'param') {
            return `(${target} != null && ${printedKey} != null && ${target}.ContainsKey((string)${printedKey}) ? ${target}[(string)${printedKey}] : null)`;
        }
        return undefined;
    }

    // `this.<member>['k1']['k2']['k3']` over a member whose hand-written class declares a
    // typed view of `['k1']` entries that are themselves dictionaries (urls['api'] -> urlsApiSections):
    // the section read becomes the view's two indexers, carrying the helper's missing-key tests. The
    // view is re-derived by the refresh method after every write of the member (csharpMemberRefresh)
    csharpMemberSectionRead(expression, argumentExpression): string | undefined {
        if (!isStringLiteralLikeNode(argumentExpression)) {
            return undefined;
        }
        const section = this.csharpUnwrapAssertion(expression);
        if (section?.kind !== SyntaxKind.ElementAccessExpression || !isStringLiteralLikeNode(section.argumentExpression)) {
            return undefined;
        }
        const entry = this.csharpUnwrapAssertion(section.expression);
        if (entry?.kind !== SyntaxKind.ElementAccessExpression || !isStringLiteralLikeNode(entry.argumentExpression)
            || !isPropertyAccessExpression(entry.expression) || entry.expression.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const root = entry.expression;
        if (!this.csharpMemberDeclaredIn(root, 'this')) {
            return undefined;
        }
        const view = this.csharpDeclaredMember(root, 'this', root.name?.text as string)?.views?.[(entry.argumentExpression as any).text];
        if (view?.sections === undefined) {
            return undefined;
        }
        const sections = `this.${view.sections}`;
        const first = this.printNode(section.argumentExpression, 0);
        const second = this.printNode(argumentExpression, 0);
        return `(${sections}.ContainsKey(${first}) && ${sections}[${first}].ContainsKey(${second}) ? ${sections}[${first}][${second}] : null)`;
    }

    // the refresh call a statement writing `this.<member>` (or an element of it) owes the typed views
    // the hand-written class derives from the member
    csharpMemberRefreshStatement(node, identation): string | undefined {
        const expression = node?.expression;
        if (expression?.kind !== SyntaxKind.BinaryExpression || expression.operatorToken.kind !== SyntaxKind.EqualsToken) {
            return undefined;
        }
        const parentKind = node.parent?.kind;
        if (parentKind !== SyntaxKind.Block && parentKind !== SyntaxKind.CaseClause && parentKind !== SyntaxKind.DefaultClause) {
            return undefined; // a refresh line after an unbraced body would leave the write's own statement
        }
        // the member itself or one entry of it: a deeper write mutates a section the view already shares
        let target = expression.left;
        if (target?.kind === SyntaxKind.ElementAccessExpression) {
            target = target.expression;
        }
        if (!isPropertyAccessExpression(target) || target.expression?.kind !== SyntaxKind.ThisKeyword || !this.csharpMemberDeclaredIn(target, 'this')) {
            return undefined;
        }
        const refresh = this.csharpDeclaredMember(target, 'this', target.name?.text as string)?.refresh;
        return (refresh === undefined) ? undefined : this.getIden(identation) + `this.${refresh}();`;
    }

    printExpressionStatement(node, identation) {
        const printed = super.printExpressionStatement(node, identation);
        if (printed === '') {
            return printed;
        }
        const refresh = this.csharpMemberRefreshStatement(node, identation);
        return (refresh === undefined) ? printed : printed + '\n' + refresh;
    }

    // the receiver `this.<member>` / `<client>.<member>` of a hand-written runtime member
    // whose DECLARED C# type (csharpDeclaredMemberType: Exchange.Options.cs, ws/Client.cs) is a
    // string-keyed object dictionary or an object list, so its own members replace the helpers.
    // `text` is the receiver as written (an `object` member proven dictionary-only carries the
    // interface cast), `type` the collection type, `nullTest` set when the declaration may hold null
    csharpMemberReceiver(node): { text: string, type: string, kind: 'dict' | 'list', declared: boolean, routed?: boolean, nullTest?: string } | undefined {
        if (!isPropertyAccessExpression(node)) {
            return undefined;
        }
        const name = node.name?.text as string;
        let owner: 'this' | 'client' | undefined;
        if (node.expression?.kind === SyntaxKind.ThisKeyword) {
            owner = 'this';
        } else if (isIdentifier(node.expression)) {
            owner = 'client';
        }
        // the checker's own proof that the member IS the hand-written runtime's: its TS declaration
        // lives in the base Exchange class (`this`) or the ws Client class (`client`)
        const declared = (owner === undefined || !this.csharpMemberIsOfOwner(node, owner)) ? undefined : this.csharpDeclaredMember(node, owner, name);
        if (declared === undefined) {
            return undefined;
        }
        const printed = this.printNode(node, 0);
        const type = declared.type.replace(/\s+/g, ' ');
        if (declared.routed === true) {
            // an owner-routed ws cache (the accessors hand the value to the ws owner): membership and size go
            // through the interface the property declares; its element reads stay with the ws cache layer
            return /^IDictionary<string, object>$/.test(type)
                ? { text: printed, type, kind: 'dict', declared: false, routed: true, nullTest: printed }
                : undefined;
        }
        if (CSHARP_LIST_DECLARATION.test(type)) {
            // a settable list property may be assigned null: every read keeps the helper's null branch
            return { text: printed, type: type.replace(/^List/, 'List'), kind: 'list', declared: true, nullTest: printed };
        }
        if (CSHARP_DICT_DECLARATION.test(type)) {
            const concurrent = /^(?:ccxt\.pro\.)?(?:OwnedTable<object>|ConcurrentDictionary<string, object>)$/.test(type);
            const canonical = concurrent ? 'ConcurrentDictionary<string, object>' : (type.startsWith('I') ? 'IDictionary<string, object>' : 'Dictionary<string, object>');
            // an interface-typed or initializer-less member may hold null; a concrete class-typed one
            // is created with its declaration and keeps no null test
            const mayBeNull = type.startsWith('I') || (declared.initializer === undefined) || (declared.initializer === 'null');
            const identity = (type === 'Dictionary<string, object>') || (type === 'IDictionary<string, object>');
            return { text: printed, type: canonical, kind: 'dict', declared: identity, nullTest: mayBeNull ? printed : undefined };
        }
        if (type === 'object' && owner === 'this' && declared.dictView !== undefined) {
            // the declared dictionary view of the box (Exchange.Options.cs): its own members replace the helpers
            const view = `this.${declared.dictView}`;
            return { text: view, type: 'IDictionary<string, object>', kind: 'dict', declared: false, nullTest: view };
        }
        if (type === 'object' && owner === 'this' && this.csharpMemberWritesOnlyDictionaries(node, name)) {
            // an `object` box that only ever holds a dictionary: every write in this file stores a
            // dictionary (literal or any-valued dictionary type) or null
            const cast = `((IDictionary<string,object>)${printed})`;
            return { text: cast, type: 'IDictionary<string, object>', kind: 'dict', declared: false, nullTest: cast };
        }
        return undefined;
    }

    // the declared C# type of a hand-written runtime member: the embedding layer's hook when installed, else the
    // declaration read from the ccxt checkout the source file belongs to
    csharpDeclaredMember(node, owner: 'this' | 'client', name: string): CsharpDeclaredMember | undefined {
        if (typeof this.csharpDeclaredMemberType === 'function') {
            return this.csharpDeclaredMemberType(owner, name);
        }
        const root = csharpRuntimeRoot(node);
        return (root === undefined) ? undefined : csharpReadDeclaredMembers(root, owner).get(name);
    }

    // the return type the hand-written base declares for `this.<name>(...)` ('overloaded' when its overloads differ)
    csharpDeclaredMethodReturn(node, name: string): string | undefined {
        if (typeof this.csharpDeclaredMethodReturnType === 'function') {
            return this.csharpDeclaredMethodReturnType(name);
        }
        const root = csharpRuntimeRoot(node);
        const seen = (root === undefined) ? undefined : csharpReadDeclaredMethodReturns(root).get(name);
        return (seen === undefined) ? undefined : (seen.size === 1 ? [ ...seen ][0] : 'overloaded');
    }

    // the member's TS declaration is a property of the base class the hand-written C# class mirrors:
    // `Exchange` / `BaseExchange` (owner `this`, cs/ccxt/base/Exchange.Options.cs) or the ws `Client` (owner `client`,
    // cs/ccxt/ws/Client.cs). A subclass redeclaring the property is a different declaration
    csharpMemberDeclaredIn(node, owner: 'this' | 'client'): boolean {
        try {
            const declaration: any = this.getChecker().getSymbolAtLocation(node.name)?.valueDeclaration?.resolve();
            const parent: any = declaration?.parent;
            const names = (owner === 'this') ? [ 'Exchange', 'BaseExchange' ] : [ 'Client' ];
            return isClassLikeDeclaration(parent) && (names.indexOf(parent.name?.text) >= 0);
        } catch (e) {
            return false;
        }
    }

    // the receiver IS the hand-written class instance: the checker resolves the member to the mirrored base class,
    // or (a `client` the TS source types `any`, as `this.safeValue (this.clients, url)` does) the receiver is a
    // local whose emitted C# declaration is the `WebSocketClient` the member is read from
    csharpMemberIsOfOwner(node, owner: 'this' | 'client'): boolean {
        if (this.csharpMemberDeclaredIn(node, owner)) {
            return true;
        }
        const receiver = node.expression;
        if (owner !== 'client' || !isIdentifier(receiver)) {
            return false;
        }
        const printed = (typeof (this as any).csharpPrintedLocalType === 'function') ? (this as any).csharpPrintedLocalType(receiver) : undefined;
        return (this.csharpTypedLocalType(receiver) ?? this.csharpDeclaredLocalResolverType(receiver) ?? printed) === 'WebSocketClient';
    }

    // every write of `this.<name>` in the source file stores a dictionary literal, `undefined` or
    // `null` (and there is at least one): the `object` box then always holds a dictionary or null
    csharpMemberWritesOnlyDictionaries(node, name: string): boolean {
        const file: any = node.getSourceFile?.();
        if (file === undefined) {
            return false;
        }
        const cached = this.csharpMemberWriteCache.get(file) ?? new Map<string, boolean>();
        this.csharpMemberWriteCache.set(file, cached);
        if (cached.has(name)) {
            return cached.get(name) as boolean;
        }
        let writes = 0;
        let dictionaryOnly = true;
        const visit = (n) => {
            if (!dictionaryOnly) {
                return;
            }
            if (n.kind === SyntaxKind.BinaryExpression && n.operatorToken.kind === SyntaxKind.EqualsToken
                && isPropertyAccessExpression(n.left) && n.left.expression?.kind === SyntaxKind.ThisKeyword && n.left.name?.text === name) {
                writes++;
                const right = n.right;
                const nullish = (right.kind === SyntaxKind.NullKeyword) || (isIdentifier(right) && right.text === 'undefined');
                if (!nullish && right.kind !== SyntaxKind.ObjectLiteralExpression
                    && !this.csharpIsAnyValuedDictionaryType(this.getChecker().getTypeAtLocation(right))) {
                    dictionaryOnly = false;
                }
            }
            n.forEachChild(visit);
        };
        file.forEachChild(visit);
        const result = dictionaryOnly && writes > 0;
        cached.set(name, result);
        return result;
    }

    // `this.<field>` reads of the hand-written BaseExchange bool fields: the field is declared
    // `bool` there, so a checker-typed plain boolean read is a C# bool the condition can use bare
    csharpFieldPrintsBool(node): boolean {
        if (node.expression?.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        return (CSHARP_NATIVE_BOOL_FIELDS.indexOf(node.name?.text as string) >= 0) && this.csharpIsCheckedBoolean(node);
    }

    // ==== slice -> Substring / GetRange ====

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
        const startBound = this.csharpSliceBoundOperand(args[0], false);
        if (startBound === undefined) {
            return undefined;
        }
        const hasEnd = args.length === 2;
        const endBound = hasEnd ? this.csharpSliceBoundOperand(args[1], true) : { kind: 'open' };
        if (endBound === undefined) {
            return undefined;
        }
        const openEnd = (endBound.kind === 'open');
        const start = (startBound.kind === 'literal') ? startBound.value : undefined;
        const end = (endBound.kind === 'literal') ? endBound.value : undefined;
        // one clamped bound keeps the emitted line compact; two would repeat both reads as four
        // clamped operands and push the line past the generated-code long-line limit
        if ((start === undefined) && (end === undefined) && !openEnd) {
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
        const from = (start !== undefined) ? this.csharpSliceBoundExpression(start, length) : this.csharpSliceClampExpression(startBound, length);
        // the null guard reproduces the helper's null -> null result for a null receiver; the
        // whole emission is parenthesised because a ternary binds looser than the `+` / `+` chain
        // the printer may wrap this call in
        const guard = `(${this.csharpNullComparison(name, true)} ? null : `;
        const method = isString ? 'Substring' : 'GetRange';
        if (!hasEnd || openEnd) {
            // the open end is the length itself: `Substring (from)` and `GetRange (from, length - from)`
            const open = isString ? `Substring(${from})` : `GetRange(${from}, ${from === '0' ? length : `${length} - ${from}`})`;
            return `${guard}${cast}.${open})`;
        }
        const to = (end !== undefined) ? this.csharpSliceBoundExpression(end, length) : this.csharpSliceClampExpression(endBound, length);
        let count;
        if ((start !== undefined) && (end !== undefined)) {
            // from <= to is proven per case: 0 is never above a clamp, and two literals clamp
            // monotonically once they keep their order (non-negative, or both counting from the end)
            const ordered = (start === 0) || ((start >= 0) && (end >= 0) && (start <= end)) || ((start < 0) && (end < 0) && (start <= end));
            if (from === to) {
                count = '0'; // two bounds that clamp to the same index: an empty result
            } else if (from === '0') {
                count = to; // from 0: the clamped end IS the count
            } else {
                // an inverted pair yields an empty slice in JS, so the count never goes below 0
                count = ordered ? `${to} - ${from}` : `Math.Max(${to} - ${from}, 0)`;
            }
        } else if (from === '0') {
            count = to;
        } else {
            // two clamped bounds keep no proven order: JS answers the empty slice, never a throw
            count = `Math.Max(${to} - ${from}, 0)`;
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

    // The bound of a native slice, or undefined when the helper must stay: an integer literal,
    // a read whose printed C# kind is `int` / `Int64`, and (end position only) an explicit
    // null / undefined, which the helper answers as "to the end". The value is repeated by the
    // clamp, so a call / assignment operand is refused; `double` is truncated by the helper.
    csharpSliceBoundOperand(node, isEnd = false) {
        const literal = this.csharpSliceLiteralBound(node);
        if (literal !== undefined) {
            return { kind: 'literal', value: literal };
        }
        if (isEnd && ((node?.kind === SyntaxKind.NullKeyword)
            || ((node?.kind === SyntaxKind.Identifier) && (node.text === 'undefined')))) {
            return { kind: 'open' };
        }
        const arithmetic = this.csharpSliceArithmeticBound(node);
        if (arithmetic !== undefined) {
            return arithmetic;
        }
        if (!this.csharpSliceReceiverIsSideEffectFree(node)) {
            return undefined;
        }
        const kind = this.csharpExpressionTypeOf(node);
        if (CSHARP_SLICE_BOUND_KINDS.indexOf(kind) < 0) {
            return undefined;
        }
        return { kind: kind, text: this.printNode(node, 0).trim() };
    }

    // A bound written as `+` / `-` arithmetic (`n - 1`, `x.length - 3`, `i + 1`) whose operands are
    // reads or integer literals and whose PRINTED form is native int / Int64 arithmetic (never a
    // helper call, never double): the clamp repeats the text, which is then pure. A nullable
    // operand lifts to null and is refused, as is every operand that is a call or an assignment.
    csharpSliceArithmeticBound(node) {
        let inner = node;
        while (inner?.kind === SyntaxKind.ParenthesizedExpression) {
            inner = inner.expression;
        }
        if ((inner?.kind !== SyntaxKind.BinaryExpression)
            || ((inner.operatorToken?.kind !== SyntaxKind.PlusToken) && (inner.operatorToken?.kind !== SyntaxKind.MinusToken))
            || !this.csharpSliceArithmeticOperandsArePure(inner)) {
            return undefined;
        }
        // the operands are printed natively here: the arithmetic helpers (subtract / add) the
        // generic path prints are exactly what the bound must not repeat
        const text = this.csharpSliceNativeArithmeticText(inner);
        if (text === undefined) {
            return undefined;
        }
        return { kind: text.kind, text: text.text };
    }

    // `(a - b)` / `(a + b)` over operands that are int / Int64 reads or integer literals: the printed
    // operator of two integers never overflows into a helper and never turns into a double, so the
    // value equals the helper's (and JS's) whole number for every length-sized operand.
    csharpSliceNativeArithmeticText(node): { kind: string, text: string } | undefined {
        while (node?.kind === SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        if (node?.kind === SyntaxKind.BinaryExpression) {
            const left = this.csharpSliceNativeArithmeticText(node.left);
            const right = this.csharpSliceNativeArithmeticText(node.right);
            if ((left === undefined) || (right === undefined)) {
                return undefined;
            }
            const op = (node.operatorToken.kind === SyntaxKind.PlusToken) ? '+' : '-';
            const kind = ((left.kind === 'int') && (right.kind === 'int')) ? 'int' : 'Int64';
            return { kind: kind, text: `(${left.text} ${op} ${right.text})` };
        }
        const literal = this.csharpSliceLiteralBound(node);
        if (literal !== undefined) {
            return { kind: 'int', text: literal < 0 ? `(${literal})` : String(literal) };
        }
        const kind = this.csharpArithmeticOperandKind(this.csharpArithmeticOperandType(node));
        const raw = this.csharpArithmeticOperandType(node);
        if (((kind !== 'int') && (kind !== 'Int64')) || (raw?.endsWith('?') === true)) {
            return undefined;
        }
        return { kind: kind, text: this.printNode(node, 0).trim() };
    }

    csharpSliceArithmeticOperandsArePure(node): boolean {
        while (node?.kind === SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        if (node?.kind === SyntaxKind.BinaryExpression) {
            const op = node.operatorToken?.kind;
            return ((op === SyntaxKind.PlusToken) || (op === SyntaxKind.MinusToken))
                && this.csharpSliceArithmeticOperandsArePure(node.left) && this.csharpSliceArithmeticOperandsArePure(node.right);
        }
        if (this.csharpSliceLiteralBound(node) !== undefined) {
            return true;
        }
        if (!this.csharpSliceReceiverIsSideEffectFree(node)) {
            return false;
        }
        const type = this.csharpArithmeticOperandType(node);
        return (type !== undefined) && (type.endsWith('?') === false);
    }

    // JS clamps a bound into [0, length] the same way for any integer value: a non-negative one
    // is min (bound, length), a negative one counts from the end. The length is an `int`, so a
    // wider bound is clamped in Int64 and narrowed after the clamp (still inside [0, length]).
    csharpSliceClampExpression(bound, length) {
        const wide = (bound.kind === 'Int64') || (bound.kind === 'Int64?');
        const value = csharpSliceBoundValue(bound);
        const total = wide ? `((Int64)${length})` : length;
        const ranged = `(${value} < 0 ? ${total} + (${value}) : ${value})`;
        const clamped = `Math.Max(Math.Min(${ranged}, ${total}), ${wide ? '0L' : '0'})`;
        return wide ? `((int)${clamped})` : clamped;
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
        const members = type.getTypes?.() ?? [];
        return (members.length > 0) && members.every((member) => this.isStringType(member.flags)
            || (member.flags === TypeFlags.Undefined) || (member.flags === TypeFlags.Null));
    }

    // True for receivers that read a value without calling anything: `x`, `x.y`, `this.x`,
    // `(x as string)` and parenthesised forms of those. Guards the repeated receiver read —
    // the clamp reads `Length` / `Count` and the call itself reads the receiver again.
    csharpSliceReceiverIsSideEffectFree(expression): boolean {
        if (expression === undefined) {
            return false;
        }
        if (isIdentifier(expression) || (expression.kind === SyntaxKind.ThisKeyword)) {
            return true;
        }
        if (isParenthesizedExpression(expression) || isAsExpression(expression) || isTypeAssertion(expression)
            || isPropertyAccessExpression(expression)) {
            return this.csharpSliceReceiverIsSideEffectFree(expression.expression);
        }
        return false;
    }

    // ==== string methods: indexOf / includes and the other receiver calls ====

    // `a + b` prints `add (a, b)`: when the chain's LEFT SPINE starts at a value whose emitted C#
    // type is a NON-NULL string, every enclosing `+` is that same string whatever the remaining
    // operands are (add(string, *) IS C# concatenation and never answers null), so the declaration
    // may name it. `self` is the declaration under test: its own reads use the running type, so a
    // `x = x + v` write cannot recurse through x's declaration.
    csharpPlusChainNonNullStringType(node, self = undefined): string | undefined {
        if (node?.kind !== SyntaxKind.BinaryExpression || (node.operatorToken?.kind !== SyntaxKind.PlusToken)) {
            return undefined;
        }
        return this.csharpNonNullStringOperandType(node.left, self);
    }

    // the emitted C# static type of a `+` operand proven a NON-NULL string: a literal, a call the
    // printer rebinds to a string-returning member (`x.toUpperCase ()` -> `((string)x).ToUpper()`,
    // which throws instead of answering null), a local the printer itself declares `string`, a
    // conditional whose every arm is one, or such a chain's own left spine. Undefined everywhere
    // else — a nullable or boxed operand keeps the helper.
    csharpNonNullStringOperandType(node, self = undefined, guardedConcat = false): string | undefined {
        let value = node;
        while (value?.kind === SyntaxKind.ParenthesizedExpression) {
            value = value.expression;
        }
        // a local answered through its own declaration initializer can name another local: bound
        // the recursion on the instance (each nested local starts its own operand proof)
        const depth = (this as any).csharpStringChainDepth ?? 0;
        if (value === undefined || depth > 6) {
            return undefined;
        }
        (this as any).csharpStringChainDepth = depth + 1;
        try {
            return this.csharpNonNullStringLeafType(value, self, guardedConcat);
        } finally {
            (this as any).csharpStringChainDepth = depth;
        }
    }

    csharpNonNullStringLeafType(value, self = undefined, guardedConcat = false): string | undefined {
        switch (value.kind) {
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case SyntaxKind.BinaryExpression:
            return this.csharpPlusChainNonNullStringType(value, self);
        case SyntaxKind.ConditionalExpression:
            return ((this.csharpNonNullStringOperandType(value.whenTrue, self) === 'string')
                && (this.csharpNonNullStringOperandType(value.whenFalse, self) === 'string')) ? 'string' : undefined;
        case SyntaxKind.CallExpression: {
            const type = this.csharpCallReturnType(value);
            return (type === 'string') ? 'string' : undefined;
        }
        case SyntaxKind.Identifier: {
            const declaration = this.csharpReceiverBinding(value);
            if ((self !== undefined) && (declaration === self)) {
                return 'string'; // the local being declared: a non-null string by induction
            }
            if (declaration?.kind !== SyntaxKind.VariableDeclaration || (declaration.parent as any)?.declarations?.length !== 1) {
                return undefined;
            }
            const type = this.getCSharpLocalType(declaration);
            // a `string?` read a non-null proof dominates, in a concat whose right operand prints a
            // string: the helper's string branch and C# concatenation agree on a non-null left
            if (guardedConcat && (type === 'string?') && this.csharpGuardedStringConcatRead(value)) {
                return 'string';
            }
            return (type === 'string') ? 'string' : undefined;
        }
        }
        return undefined;
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
        if ((declared === 'List<object>') || (declared === 'IList<object>')) {
            return `((${declared})${name}).IndexOf(${parsedArg})`;
        }
        // a `string?` local holds a string or null: `?.` answers the helper's -1 for null; the
        // needle is a literal or a local, so skipping its evaluation on null changes nothing
        const key = node.arguments?.[0];
        const plainNeedle = (key !== undefined) && (isStringLiteralLikeNode(key) || isIdentifier(key));
        if ((declared === 'string?') && isIdentifier(receiver) && plainNeedle) {
            const needle = this.csharpNativeIndexOfNeedle(node.arguments?.[0], parsedArg);
            if (needle !== undefined) {
                return `(${name}?.IndexOf(${needle}, StringComparison.Ordinal) ?? -1)`;
            }
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
        const declarations: any[] = (symbol?.declarations ?? []).map((d) => d.resolve());
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
        return (initializer?.kind === SyntaxKind.NullKeyword)
            || ((initializer?.kind === SyntaxKind.Identifier) && (initializer.text === 'undefined'));
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
            if (parent.kind === SyntaxKind.ConditionalExpression) {
                // `x === undefined ? undefined : x + y` / `x !== undefined ? x + y : undefined`:
                // the arm that concatenates runs only where the test proved x non-null
                if ((parent.whenTrue === current) && this.csharpTestIsNonNullCheck(parent.condition, symbol, true)) {
                    return true;
                }
                if ((parent.whenFalse === current) && this.csharpTestIsNonNullCheck(parent.condition, symbol, false)) {
                    return true;
                }
            }
            if ((isBlock(parent) || isSourceFile(parent)) && this.csharpEarlyExitNonNullGuarded(parent, current, symbol, scope)) {
                return true;
            }
            if (this.csharpIsFunctionLike(parent)) {
                return false; // a guard outside this function cannot dominate a read inside it
            }
            current = parent;
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
        if (keyType === 'string') {
            return printed;
        }
        return ((keyType === undefined) || (keyType === 'string?')) ? `((string)${printed})` : undefined;
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

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `${this.csharpStringMethodReceiver(node, name)}.Replace((string)${parsedArg}, (string)${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return this.printReplaceCall(node, identation, name, parsedArg, parsedArg2);
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

    // ==== for counters, increments and loop-bounded list reads ====

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
        const declaration = this.getChecker().getSymbolAtLocation(counter)?.valueDeclaration?.resolve();
        const checker = this.getChecker();
        return declaration !== undefined &&
            checker.getSymbolAtLocation(left)?.valueDeclaration?.resolve() === declaration &&
            checker.getSymbolAtLocation(receiverExpression)?.valueDeclaration?.resolve() === checker.getSymbolAtLocation(receiver)?.valueDeclaration?.resolve();
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
        return Number(declaration.initializer.text) >= 0 && this.getChecker().getSymbolAtLocation(counter)?.valueDeclaration?.resolve() === declaration;
    }

    // the header moves the counter forward: a decrement could leave a negative index behind
    csharpCounterAdvances(loop, counter): boolean {
        const declaration = this.getChecker().getSymbolAtLocation(counter)?.valueDeclaration?.resolve();
        const incrementor: any = this.csharpUnparenthesized(loop.incrementor);
        if (incrementor === undefined || declaration === undefined) {
            return false;
        }
        if (incrementor.kind === SyntaxKind.PostfixUnaryExpression || incrementor.kind === SyntaxKind.PrefixUnaryExpression) {
            return incrementor.operator === SyntaxKind.PlusPlusToken &&
                this.getChecker().getSymbolAtLocation(incrementor.operand)?.valueDeclaration?.resolve() === declaration;
        }
        if (incrementor.kind === SyntaxKind.BinaryExpression && incrementor.operatorToken.kind === SyntaxKind.PlusEqualsToken) {
            return this.getChecker().getSymbolAtLocation(incrementor.left)?.valueDeclaration?.resolve() === declaration &&
                isNumericLiteral(incrementor.right) && Number(incrementor.right.text) >= 0;
        }
        return false;
    }

    // a write to the counter in the body invalidates the bound the condition proved
    csharpCounterUnwrittenIn(range, counter): boolean {
        const declaration = this.getChecker().getSymbolAtLocation(counter)?.valueDeclaration?.resolve();
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
            } else {
                written = ((isPrefixUnaryExpression(parent) || isPostfixUnaryExpression(parent)) && parent.operand === identifier)
                    || isDeleteExpression(parent);
            }
        });
        return !written;
    }

    // the condition's `<recv>.length` still proves the range only while the list is intact: inside
    // the body the receiver may be read (element reads, its own `.length`) and nothing else
    csharpReceiverIntactIn(range, receiver): boolean {
        const declaration = this.getChecker().getSymbolAtLocation(receiver)?.valueDeclaration?.resolve();
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
        if (this.csharpIsSetOrAddTarget(node)) {
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

    // the node is the left side of `=` or `+=`
    csharpIsSetOrAddTarget(node): boolean {
        const parent: any = node.parent;
        return parent?.kind === SyntaxKind.BinaryExpression
            && (parent.operatorToken.kind === SyntaxKind.EqualsToken || parent.operatorToken.kind === SyntaxKind.PlusEqualsToken)
            && parent.left === node;
    }

    csharpIsAssignmentOperator(kind): boolean {
        return (kind >= SyntaxKind.FirstAssignment) && (kind <= SyntaxKind.LastAssignment);
    }

    // `for (let i = <int literal>; …; i++)` whose every read normalises the box: an ordered / equality
    // comparison operand, an element index, the key of a `this.safe*` read, or `i ± <int literal>`.
    // Each such read takes an Int64 the way it takes the Int32 box, so the counter is declared Int64
    // and its increment is the native `i++`. Counters the embedding build layer already types
    // (csharpFinalDeclaredLocalType) keep that type.
    csharpInt64ForCounter(declaration): boolean {
        if (!isVariableDeclaration(declaration)) {
            return false;
        }
        const cached = this.csharpInt64ForCounters.get(declaration);
        if (cached !== undefined) {
            return cached;
        }
        this.csharpInt64ForCounters.set(declaration, false); // a re-entrant question answers no
        const proven = this.csharpInt64ForCounterProof(declaration);
        this.csharpInt64ForCounters.set(declaration, proven);
        return proven;
    }

    csharpInt64ForCounterProof(declaration): boolean {
        const list: any = declaration.parent;
        const loop: any = list?.parent;
        const name = declaration.name;
        if ((name?.kind !== SyntaxKind.Identifier) || (list?.declarations?.length !== 1) || !isForStatement(loop) || (loop.initializer !== list)
            || (loop.statement?.kind !== SyntaxKind.Block) || (loop.incrementor === undefined)) {
            return false;
        }
        const init: any = declaration.initializer;
        if ((init?.kind !== SyntaxKind.NumericLiteral) || !/^\d{1,9}$/.test(init.text)) {
            return false;
        }
        const step: any = loop.incrementor;
        if (!isPostfixUnaryExpression(step) || (step.operator !== SyntaxKind.PlusPlusToken) || !isIdentifier(step.operand) || (step.operand.text !== name.text)) {
            return false;
        }
        const file = String(declaration.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
        if ((file.indexOf('ts/src/test/') >= 0) || (file.indexOf('examples/') >= 0)) {
            return false; // generated tests and examples keep the helper form
        }
        if (this.csharpTypeNameIsShadowed(this.csharpEnclosingFunction(declaration), 'Int64')) {
            return false;
        }
        const classified = this.csharpFinalDeclaredLocalType(declaration); // re-entry answers no above: this is the build layer's own type
        if ((classified !== undefined) && (classified !== this.VAR_TOKEN) && (classified !== 'var')) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        let reads = 0;
        let ok = true;
        const visit = (n: any) => {
            if (!ok) {
                return;
            }
            if (isIdentifier(n) && (n.text === name.text) && (n !== name) && (n !== step.operand)) {
                if (checker.getSymbolAtLocation(n)?.valueDeclaration?.resolve() !== declaration) {
                    return; // another binding of the name
                }
                if (!this.csharpCounterReadNormalises(n)) {
                    ok = false;
                    return;
                }
                reads += 1;
            }
            n.forEachChild(visit);
        };
        visit(loop.condition);
        visit(loop.statement);
        return ok && (reads > 0);
    }

    csharpCounterReadNormalises(read): boolean {
        let current: any = read;
        while (current.parent?.kind === SyntaxKind.ParenthesizedExpression) {
            current = current.parent;
        }
        const parent: any = current.parent;
        if (parent === undefined) {
            return false;
        }
        if (parent.kind === SyntaxKind.ElementAccessExpression) {
            return (parent.argumentExpression === current) && !this.csharpIsWriteTarget(parent);
        }
        if (parent.kind === SyntaxKind.CallExpression) {
            const callee: any = parent.expression;
            return isPropertyAccessExpression(callee) && (callee.expression?.kind === SyntaxKind.ThisKeyword)
                && (CSHARP_COUNTER_KEYED_CALLS.indexOf(callee.name?.text as string) >= 0) && (parent.arguments?.[1] === current);
        }
        if (parent.kind !== SyntaxKind.BinaryExpression) {
            return false;
        }
        const op = parent.operatorToken.kind;
        if (CSHARP_COUNTER_COMPARISONS.indexOf(op) >= 0) {
            return true;
        }
        if ((op === SyntaxKind.PlusToken) || (op === SyntaxKind.MinusToken)) {
            const right: any = parent.right;
            return (parent.left === current) && (right?.kind === SyntaxKind.NumericLiteral) && /^\d{1,9}$/.test(right.text);
        }
        return false;
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
        if (this.csharpExpressionTypeOf(node.operand) === 'int') {
            return true;
        }
        if (this.csharpNativeForIncrementors.has(node)) {
            return true;
        }
        const declaration: any = this.getChecker().getSymbolAtLocation(node.operand)?.valueDeclaration?.resolve();
        return (declaration !== undefined) && this.csharpInt64ForCounter(declaration);
    }

    // `x++` on the loop's own counter is native once its printed declaration names a numeric type
    csharpTypedForCounterIncrement(node, initializer: string): boolean {
        const list: any = node.initializer;
        const step: any = node.incrementor;
        if (!list || list.kind !== SyntaxKind.VariableDeclarationList || list.declarations.length !== 1 || !step || !isPostfixUnaryExpression(step)
            || step.operator !== SyntaxKind.PlusPlusToken || !isIdentifier(step.operand) || !isIdentifier(list.declarations[0].name)) {
            return false;
        }
        const declaration = list.declarations[0];
        if (this.getChecker().getSymbolAtLocation(step.operand)?.valueDeclaration?.resolve() !== declaration) {
            return false;
        }
        const printedName = this.printNode(declaration.name, 0);
        return new RegExp('^(?:int|Int64|double) ' + printedName + ' = ').test(initializer);
    }

    printForStatement(node, identation) {
        const initializer = this.printNode(node.initializer, 0);
        const condition = this.printNode(node.condition, 0);
        if (this.csharpTypedForCounterIncrement(node, initializer)) {
            this.csharpNativeForIncrementors.add(node.incrementor);
        }
        const incrementor = this.printNode(node.incrementor, 0);
        const forStm = this.getIden(identation) + this.FOR_TOKEN + " " + this.CONDITION_OPENING +
            initializer + "; " + condition + "; " + incrementor + this.CONDITION_CLOSE + this.printBlock(node.statement, identation);
        return this.printNodeCommentsIfAny(node, identation, forStm);
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
        return (op === '--') ? `postFixDecrement(ref ${leftSide})` : `postFixIncrement(ref ${leftSide})`;
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
        const nativeNegation = this.csharpNativeNegatedLocal(operand, leftSide) ?? this.csharpNativeNegatedNullableLocal(node, leftSide);
        if (nativeNegation !== undefined) {
            return nativeNegation;
        }
        return `prefixUnaryNeg(ref ${leftSide})`;
    }

    // ==== conditions: isTrue removal and bool proofs ====

    // A `this.<name>(...)` call to a method the enclosing class (or a non-root class it extends) declares
    // with a plain `bool` return (csharpBooleanReturnType prints that `bool`) hands back an unboxed bool,
    // so a local holding it is `bool`. Root-class helpers, names the table answers and overloaded families
    // keep their box.
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
            declaration = checker.getResolvedSignature(node)?.declaration?.resolve();
        } catch (e) {
            return false;
        }
        if (!isMethodDeclaration(declaration) || (this.csharpBooleanReturnType(declaration) !== 'bool')) {
            return false;
        }
        const owner = findAncestor(declaration, isClassLikeDeclaration);
        if ((owner === undefined) || !this.csharpClassIsOrExtends(findAncestor(node, isClassLikeDeclaration), owner)) {
            return false;
        }
        // a root class (no `extends`) is the one the C# port overlays with hand-written members of its
        // own signature (CSHARP_HANDWRITTEN_CALLEES_NATIVE): an inherited call to it keeps the box
        if ((owner !== findAncestor(node, isClassLikeDeclaration)) && (getAllSuperTypeNodes(owner).length === 0)) {
            return false;
        }
        return checker.getSymbolAtLocation(declaration.name)?.declarations?.length === 1;
    }

    // `const [ x, p ] = this.handleOptionAndParams (...)`: `x` is the non-null bool slot and every
    // other use of the name keeps a `bool` local legal
    csharpBoolSlotBinding(element): boolean {
        if (element?.kind !== SyntaxKind.BindingElement) {
            return false;
        }
        const cached = this.boolSlotBindings.get(element);
        if (cached !== undefined) {
            return cached;
        }
        const pattern = element.parent;
        const declaration = pattern?.parent;
        const proven = (pattern?.kind === SyntaxKind.ArrayBindingPattern) && (pattern.elements?.[0] === element)
            && (element.dotDotDotToken === undefined) && (element.initializer === undefined) && (element.name?.kind === SyntaxKind.Identifier)
            && (declaration?.kind === SyntaxKind.VariableDeclaration) && (declaration.name === pattern)
            && ((declaration.parent as any)?.declarations?.length === 1) && this.csharpBoolOptionSlotCall(declaration.initializer)
            && this.csharpLocalIsSafeToType(this.csharpEnclosingFunction(element), element, element.name.text, 'bool');
        this.boolSlotBindings.set(element, proven);
        return proven;
    }

    // The declared C# type of the `<a><b>Variable` holder of a destructuring block, or undefined
    // (keeps a `var` holder read via `((IList<object>)holder)[i]`). The ccxt classifier overrides this
    // for the tuple-returning `handle*AndParams` family: holder is `IList<object>`, read directly.
    csharpDestructuringTempType(initializer): string | undefined {
        return undefined;
    }

    // whether the typed holder needs the `(T)` cast on its printed initializer; a consumer that
    // proves the printed call already returns T (or a subtype) answers false
    csharpDestructuringTempNeedsCast(initializer, printedExpression: string): boolean {
        return true;
    }

    // `isTrue (x)` is the identity on a C# `bool`, and `x == true` is what it computes for a `bool?`
    // (null -> false), so in a condition the wrapper adds nothing. The hook answers the emitted
    // declaration's type (getCSharpLocalType, plus classifier retypes); unnamed operands keep isTrue.
    csharpConditionOperandType(node) {
        const declaration = this.csharpReceiverBinding(node);
        if (declaration?.kind === SyntaxKind.Parameter) {
            // a `bool?` signature this printer emitted for the parameter (csharpBooleanParamType):
            // the recorded type is the printed one, so the condition is a lifted bool test
            return (this.csharpPrintedParamType(node) === 'bool?') ? 'bool?' : undefined;
        }
        if (declaration?.kind === SyntaxKind.BindingElement) {
            return this.csharpBoolSlotBinding(declaration) ? 'bool' : undefined;
        }
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) {
            return undefined; // a member read has no declaration this pass retypes
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
    // ternary condition has its own hook-driven fold (csharpTernaryConditionOperand) because
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

    printInstanceOfExpression(node, identation) {
        const left = node.left.text;
        const right = node.right.text;
        return this.getIden(identation) + `${left} is ${right}`;
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
            const members = type.isUnionType() ? type.getTypes() : [ type ];
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
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration?.resolve();
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
    csharpStaticCalleeName(node): string | undefined {
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

    // `isTrue(<call>)` goes bare when the call's own C# signature is non-nullable `bool`: (a)
    // hand-written cs/ccxt/base callees (CSHARP_BOOL_CALLEES_NATIVE), (b) `this.<name>(...)` printed by
    // the same csharpBooleanReturnType. Hand-written overrides and `callDynamically` keep the wrapper.
    csharpCallHasBoolSignature(node): boolean {
        const callee = this.csharpStaticCalleeName(node);
        if (callee !== undefined && CSHARP_BOOL_CALLEES_NATIVE[callee] === true) {
            return true;
        }
        return this.csharpGeneratedThisCallBoolType(node, callee) === 'bool';
    }

    // csharpBooleanReturnType of a generator-printed `this.<name>(...)` callee, else undefined
    csharpGeneratedThisCallBoolType(node, callee: string | undefined): string | undefined {
        if (callee === undefined || callee.indexOf('this.') !== 0) {
            return undefined;
        }
        // a callee the hand-written C# base declares itself (Exchange.Generic.cs `bool isDictionary`) is
        // bound by that declaration, not by the TS annotation: only a declared `bool` loses the wrapper
        const handWritten = this.csharpDeclaredMethodReturn(node, callee.substring('this.'.length));
        if (handWritten !== undefined && handWritten !== 'bool') {
            return undefined;
        }
        if (!this.csharpCalleeResolves(node)) {
            return undefined;
        }
        const declaration: any = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
        // a bodiless overload signature (`safeBool (…, defaultValue: boolean): boolean` next to a
        // `boolean | undefined` implementation) states only that overload's type, while C# binds
        // the single implementation: its `bool?` must not lose the wrapper
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body === undefined) {
            return undefined;
        }
        return this.csharpBooleanReturnType(declaration);
    }

    // calls the printer gives a concrete bool signature (inArray, valueIsDefined, startsWith,
    // Array.isArray, ...); safeBool and friends are `bool?` / `object` and keep the wrapper
    csharpCallPrintsBool(node): boolean {
        return this.csharpIsCheckedBoolean(node) && ((this.csharpCallReturnType(node) === 'bool') || this.csharpCallHasBoolSignature(node));
    }

    // The declared type of an identifier read: build layer's proof first, then this printer's table;
    // `var`/`object` mean "no type". `isTrue (x)` answers false for a null box, exactly the lifted
    // `x == true` on a `bool?`. Only reads declared `bool?` qualify; every other shape keeps helper.
    csharpNullableBoolCondition(node): string | undefined {
        let value = node;
        while (value?.kind === SyntaxKind.ParenthesizedExpression) {
            value = value.expression;
        }
        // the resolver arm: a declaration the embedding build layer retyped itself — the parameter/override
        // signatures the build layer prints for typed parameters: the recorded type IS the emitted
        // declaration's, so a `bool?` parameter is no C# condition either
        const nullable = (value?.kind === SyntaxKind.Identifier)
            ? (this.csharpDeclaredLocalType(value) === 'bool?' || this.csharpDeclaredLocalResolverType(value) === 'bool?')
            : ((value?.kind === SyntaxKind.CallExpression) && this.csharpCallPrintsNullableBool(value));
        return nullable ? `(${this.printNode(value, 0)} == true)` : undefined;
    }

    // a call whose printed C# signature is `bool?`: the `bool? safeBool(...)` family of the
    // hand-written base (CSHARP_THIS_RETURN_TYPES, which names that signature), and a
    // `this.<name>(...)` whose TS declaration the generator itself prints — definition and call
    csharpCallPrintsNullableBool(node): boolean {
        if (this.csharpCallReturnType(node) === 'bool?') {
            return true;
        }
        return this.csharpGeneratedThisCallBoolType(node, this.csharpStaticCalleeName(node)) === 'bool?';
    }

    // same emission as the base implementation except for the bare-bool branch: the node is
    // printed once and only wrapped in isTrue(...) when the printer did not already render a bool
    //
    // the single `printCondition` override, rules layered strongest-proof-first over the base
    // body (the untyped fallback at the bottom):
    // bare `isTrue (x)` in an if / while / && / || / ! condition: the operand is already
    // the `bool` (or `bool?`) the helper computes, so the wrapper adds nothing (the gate is the
    // csharpConditionPositionAllowsNative / csharpNativeCondition pair, never a name shape).
    // a condition whose printed text is already a C# `bool` helper call
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
        const underNot = parent?.kind === SyntaxKind.PrefixUnaryExpression && parent.operator === SyntaxKind.ExclamationToken;
        if (op === SyntaxKind.InstanceOfKeyword) {
            const underCast = parent?.kind === SyntaxKind.ConditionalExpression && parent.condition === node;
            return (underNot || underCast) ? `(${printed})` : printed;
        }
        if (op !== SyntaxKind.BarBarToken && op !== SyntaxKind.AmpersandAmpersandToken) {
            return printed;
        }
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
        const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
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

    // a `?` at paren/bracket/brace depth 0 in printed condition text is a C# conditional; its type
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

    // is this printed condition text already a C# `bool`? Only `isTrue`/`isEqual`/`isGreaterThan
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

    // ==== equality, null comparisons, arithmetic and Math.min/max ====

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

    // the declaration behind an identifier read that is a plain method parameter; a
    // destructured or rest parameter prints a different declaration shape
    csharpParameterDeclaration(node): ParameterDeclaration | undefined {
        const declaration: any = (this.checkerOrUndefined() as any)?.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
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
        return this.csharpTypeHasValueScalar(checker.getTypeAtLocation(declaration));
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
        const declaration: any = (this.checkerOrUndefined() as any)?.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        if (declaration?.kind === SyntaxKind.VariableDeclaration) {
            return this.getCSharpLocalType(declaration);
        }
        if (declaration?.kind === SyntaxKind.BindingElement) {
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

    // the null-comparison rule's gate, stricter than csharpIsNullComparableType above:
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
            const members = type.getTypes?.() ?? [];
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
        return (named !== undefined) ? named : this.csharpResolvedReadType(node);
    }

    // the embedding build layer's string answer for a read, or undefined (no resolver, it threw)
    csharpResolvedReadType(node): string | undefined {
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
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration?.resolve();
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
        return this.csharpResolvedReadType(node) ?? printerType;
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
        // an operand the printer could not name (or only named `object`) is not a
        // rejection by itself -- the value branch below re-reads its DECLARED scalar type
        if ((leftType === 'null') || (rightType === 'null')) {
            const [other, otherType, otherText] = (leftType === 'null') ? [right, rightType, rightText] : [left, leftType, leftText];
            if (!this.csharpIsNullComparableType(otherType) || !this.csharpOperandIsNullComparable(other)) {
                return undefined;
            }
            return this.csharpNullComparison(otherText, isEquality);
        }
        // a read the printer's own tables could only call `object` still has the C# type
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
            return undefined; // parameters of a written body / accesses / calls keep the helper
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

    // The C# numeric kind of an operand printed as `%` / `*` / `+` / `-` over two operands this
    // printer can name in one family: C# types the result to that family. An operand that still
    // prints an arithmetic helper (`mod(...)`, `add(...)`), a mixed int/double pair and an unnamed
    // operand all answer undefined, so the helper stays.
    csharpPrintedArithmeticKind(node, text: string): string | undefined {
        while (node?.kind === SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        if (node?.kind !== SyntaxKind.BinaryExpression) {
            return undefined;
        }
        const op = node.operatorToken?.kind;
        if ((op !== SyntaxKind.PercentToken) && (op !== SyntaxKind.AsteriskToken)
            && (op !== SyntaxKind.PlusToken) && (op !== SyntaxKind.MinusToken)) {
            return undefined;
        }
        if (CSHARP_HELPER_ARITHMETIC_OPENERS.some((opener) => csharpStripOuterParens(text).startsWith(opener))) {
            return undefined;
        }
        const leftKind = this.csharpArithmeticOperandKind(this.csharpArithmeticOperandType(node.left));
        const rightKind = this.csharpArithmeticOperandKind(this.csharpArithmeticOperandType(node.right));
        if ((leftKind === undefined) || (rightKind === undefined)) {
            return undefined;
        }
        if ((leftKind === 'double') || (rightKind === 'double')) {
            return ((leftKind === 'double') && (rightKind === 'double')) ? 'double' : undefined;
        }
        return ((leftKind === 'int') && (rightKind === 'int')) ? 'int' : 'Int64';
    }

    // The numeric family of an arithmetic operand: a nullable spelling (`Int64?`) is the same
    // family — the printed operator lifts, and null answers false in both `==` and isEqual. Any
    // other type is not a number this printer named.
    csharpArithmeticOperandKind(csharpType: string | undefined): string | undefined {
        switch (csharpType) {
        case 'Int64':
        case 'long':
        case 'Int64?':
        case 'long?':
            return 'Int64';
        case 'int':
        case 'int?':
            return 'int';
        case 'double':
        case 'double?':
            return 'double';
        }
        return undefined;
    }

    // The C# type this printer gave a local's own DECLARATION: getCSharpLocalType is the function
    // that printed the `<type> <name> =` prefix, so its answer IS the declaration type (the same
    // oracle csharpConditionOperandType uses for isTrue). Undefined for a parameter, a member read
    // and a multi-declarator statement, whose reads no single declaration types.
    csharpDeclaredLocalValueType(node): string | undefined {
        const declaration = this.csharpReceiverBinding(node);
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) {
            return undefined;
        }
        if ((declaration.parent as any)?.declarations?.length !== 1) {
            return undefined;
        }
        const cached = this.csharpDeclaredLocalTypes.get(declaration);
        if (cached !== undefined) {
            return (cached === '') ? undefined : cached;
        }
        const type = this.getCSharpLocalType(declaration);
        const named = ((type === undefined) || (type === this.VAR_TOKEN)) ? '' : type;
        this.csharpDeclaredLocalTypes.set(declaration, named);
        return (named === '') ? undefined : named;
    }

    // the C# type of an arithmetic operand: the printer's own proof for the expression first, then
    // the declaration type of the local it reads (a chain the embedding build layer typed)
    csharpArithmeticOperandType(node): string | undefined {
        const named = this.csharpExpressionTypeOf(node);
        return (named !== undefined) ? named : this.csharpDeclaredLocalValueType(node);
    }

    // two arithmetic kinds isEqual compares by value: the same family, or the two integer families
    // (isEqual's ToInt64 branch and C#'s implicit int -> long promotion agree; a double never
    // compares against an integer family, where isEqual's truncating branch and the operator differ)
    csharpArithmeticKindsCompare(leftKind: string, rightKind: string): boolean {
        if (leftKind === rightKind) {
            return true;
        }
        return (leftKind !== 'double') && (rightKind !== 'double');
    }

    // `isEqual (<numeric arithmetic>, N)` -> `==` / `!=`: the printed expression is native C#
    // arithmetic of one numeric kind, so an integer literal it holds exactly compares the way
    // isEqual's ToInt64 / Convert.ToDouble branches do. Two such expressions of one kind compare by
    // value in both; every other pair keeps the helper.
    csharpNativeArithmeticEquality(left, right, leftText: string, rightText: string, isEquality: boolean): string | undefined {
        const modEquality = this.csharpNativeModEquality(left, right, isEquality);
        if (modEquality !== undefined) {
            return modEquality;
        }
        const leftKind = this.csharpPrintedArithmeticKind(left, leftText);
        const rightKind = this.csharpPrintedArithmeticKind(right, rightText);
        if ((leftKind !== undefined) && (rightKind !== undefined)) {
            if (leftKind !== rightKind) {
                return undefined;
            }
            return isEquality ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
        }
        if ((leftKind === undefined) && (rightKind === undefined)) {
            return undefined;
        }
        const arithmeticKind = (leftKind === undefined) ? rightKind : leftKind;
        const other = (leftKind === undefined) ? left : right;
        const literalKind = this.csharpIntegerLiteralKind(other);
        const literalText = (leftKind === undefined) ? leftText : rightText;
        // the arithmetic operand keeps its own operator (it binds tighter than `==`), so the
        // wrapper's parentheses are the pair the comparison needs
        const arithmeticText = (leftKind === undefined) ? csharpStripOuterParens(rightText) : csharpStripOuterParens(leftText);
        if ((literalKind !== undefined) && this.csharpNumericKindHoldsLiteral(arithmeticKind, literalKind)) {
            return isEquality ? `(${arithmeticText} == ${literalText})` : `(${arithmeticText} != ${literalText})`;
        }
        // or a local whose DECLARATION this printer typed as a number of a comparable family: both
        // sides are then C# numbers, where the helper's integer branch and the operator agree
        const operandKind = this.csharpArithmeticOperandKind(this.csharpDeclaredLocalValueType(other));
        if ((operandKind === undefined) || !this.csharpArithmeticKindsCompare(arithmeticKind, operandKind)) {
            return undefined;
        }
        return isEquality ? `(${arithmeticText} == ${literalText})` : `(${arithmeticText} != ${literalText})`;
    }

    // `isEqual (x % N, M)` for an Int64 / Int64? identifier `x`, a positive integer literal divisor of at most
    // nine digits and an integer literal `M`: mod's double remainder converted back to Int64 is exact there
    // (below 2^53), and the lifted `==` answers false for a null `x` exactly like isEqual. The printed
    // remainder is the form mod(Int64, literal) prints once the host's numeric pass has typed `x`
    csharpNativeModEquality(left, right, isEquality: boolean): string | undefined {
        const [ modSide, literal ] = (this.csharpUnparenthesized(left)?.kind === SyntaxKind.BinaryExpression) ? [ left, right ] : [ right, left ];
        const mod = this.csharpUnparenthesized(modSide);
        if (mod?.kind !== SyntaxKind.BinaryExpression || mod.operatorToken.kind !== SyntaxKind.PercentToken || !isIdentifier(mod.left)) {
            return undefined;
        }
        const divisor = csharpLiteralNumericValue(mod.right);
        const expected = this.csharpIntegerLiteralKind(literal);
        if ((divisor === undefined) || !Number.isInteger(divisor) || (divisor <= 0) || (divisor > 999999999) || (expected === undefined)) {
            return undefined;
        }
        const type = this.csharpArithmeticOperandType(mod.left);
        const text = this.printNode(mod.left, 0);
        const remainder = ((type === 'Int64') || (type === 'long')) ? `((Int64)((double)${text} % ${divisor}))`
            : (((type === 'Int64?') || (type === 'long?')) ? `((Int64?)((double?)${text} % ${divisor}))` : undefined);
        if (remainder === undefined || !this.csharpNumericKindHoldsLiteral('Int64', expected)) {
            return undefined;
        }
        const printedLiteral = this.printNode(literal, 0);
        return isEquality ? `(${remainder} == ${printedLiteral})` : `(${remainder} != ${printedLiteral})`;
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

    // `const n = c ? 1999 : 1000` is typed `1999 | 1000` by the checker: every member is a number literal
    csharpOperandIsNumberLiteralUnion(operand): boolean {
        const checker: any = this.checkerOrUndefined();
        const type = checker?.getTypeAtLocation(operand);
        if (type?.flags !== TypeFlags.Union) {
            return false;
        }
        const members = type.getTypes?.() ?? [];
        return (members.length > 0) && members.every((member) => member.flags === TypeFlags.NumberLiteral);
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
        return this.csharpNativeSameKindMinMax(node, name, parsedArg1, parsedArg2)
            ?? this.csharpNativeIntegralMinMax(node, name, parsedArg1, parsedArg2);
    }

    csharpNativeSameKindMinMax(node, name: string, parsedArg1: string, parsedArg2: string): string | undefined {
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

    // Native `%` and Math.Min/Max over declared integral operands: an integer literal or an
    // identifier whose declared C# kind (local, narrowed core parameter) is int / Int64 / Int64?; others keep the helper.
    csharpIntegralOperand(node): { kind: string, node: any, literal: boolean, zero: boolean, small: boolean, literalKind?: string } | undefined {
        const unwrap = (n) => {
            while (isParenthesizedExpression(n) || (isAsExpression(n) && (n.type?.kind === SyntaxKind.NumberKeyword))) {
                n = n.expression;
            }
            return n;
        };
        let inner: any = unwrap(node);
        const signed: any = inner;
        const negative = isPrefixUnaryExpression(inner) && (inner.operator === SyntaxKind.MinusToken);
        if (negative) {
            inner = unwrap(inner.operand);
        }
        if (isNumericLiteral(inner)) {
            if (!/^\d{1,15}$/.test(inner.text)) {
                return undefined;
            }
            return { kind: 'literal', node: inner, literal: true, zero: !negative && (Number(inner.text) === 0),
                small: !negative && /^[1-9]\d{0,8}$/.test(inner.text), literalKind: this.csharpIntegerLiteralKind(negative ? signed : inner) };
        }
        if (negative || !isIdentifier(inner)) {
            return undefined;
        }
        const declared = this.csharpArithmeticOperandType(inner) ?? this.csharpShadowedNumericParamType(inner) ?? this.csharpParameterOperandType(inner);
        const kind = (declared === 'long') ? 'Int64' : declared;
        if ((kind !== 'int') && (kind !== 'Int64') && (kind !== 'Int64?')) {
            return undefined;
        }
        // a non-null kind needs the checker's plain number too; an Int64? read is proven by its null test
        if ((kind !== 'Int64?') && !this.csharpOperandIsPlainNumber(inner) && !this.csharpOperandIsNumberLiteralUnion(inner)) {
            return undefined;
        }
        return { kind, node: inner, literal: false, zero: false, small: false };
    }

    // `a % b` over Int64 / Int64? / literal operands (not two literals, divisor not 0 or a small positive literal):
    // the lifted `%` is null exactly where mod's null branch is
    csharpNativeIntegralMod(node, leftText: string, rightText: string): string | undefined {
        const left = this.csharpIntegralOperand(node.left);
        const right = this.csharpIntegralOperand(node.right);
        if ((left === undefined) || (right === undefined) || (left.literal && right.literal) || right.zero || right.small) {
            return undefined;
        }
        const wide = (o) => o.literal || (o.kind === 'Int64') || (o.kind === 'Int64?');
        if (!wide(left) || !wide(right) || !this.csharpMinMaxResultIsPlainValue(node)) {
            return undefined;
        }
        return `(${leftText.trim()} % ${rightText.trim()})`;
    }

    // `Math.min/max (a, b)` over int / Int64 operands (a literal widens) and an Int64? identifier under an
    // unbroken dominating null test (`.Value`); double keeps the helper (NaN, signed zero)
    csharpNativeIntegralMinMax(node, name: string, parsedArg1: string, parsedArg2: string): string | undefined {
        const args = node.arguments;
        if ((args?.length !== 2) || !this.csharpMinMaxResultIsPlainValue(node)) {
            return undefined;
        }
        const left = this.csharpIntegralOperand(args[0]);
        const right = this.csharpIntegralOperand(args[1]);
        if ((left === undefined) || (right === undefined) || (left.literal && right.literal)) {
            return undefined;
        }
        const base = (o) => o.kind.replace('?', '');
        if (left.literal !== right.literal) {
            const [ literal, other ] = left.literal ? [ left, right ] : [ right, left ];
            if ((base(other) === 'int') && (literal.literalKind !== 'int')) {
                return undefined; // a long literal widens an int operand's pair to long
            }
        } else if (base(left) !== base(right)) {
            // Math.Min(int, long) boxes a long where the helper hands back the original box: only an Int64? read
            // (unboxed under its null proof) beside an int keeps the native form, and never into an int sink
            if (((left.kind !== 'Int64?') && (right.kind !== 'Int64?')) || this.csharpMinMaxSinkIsNarrowInt(node)) {
                return undefined;
            }
        }
        const l = this.csharpIntegralNonNullText(node, left, parsedArg1);
        const r = this.csharpIntegralNonNullText(node, right, parsedArg2);
        return ((l === undefined) || (r === undefined)) ? undefined : `Math.${name}(${l}, ${r})`;
    }

    // `int x = Math.min (a, b)` / `x = Math.min (a, b)`: the sink is printed with a narrow integer type
    csharpMinMaxSinkIsNarrowInt(call): boolean {
        let value: any = call;
        while (value.parent !== undefined && isParenthesizedExpression(value.parent)) {
            value = value.parent;
        }
        const parent: any = value.parent;
        const narrow = (type: string | undefined) => [ 'int', 'uint', 'short', 'byte' ].indexOf(type as string) >= 0;
        if (isBinaryExpression(parent) && (parent.operatorToken.kind === SyntaxKind.EqualsToken) && (parent.right === value)) {
            return narrow(this.csharpExpressionTypeOf(parent.left)); // `x = Math.min (a, b)` on an int local
        }
        if (!isVariableDeclaration(parent) || parent.initializer !== value) {
            return false;
        }
        return narrow(this.csharpFinalDeclaredLocalType(parent) ?? this.getCSharpLocalType(parent));
    }

    // the operand text, `.Value` appended for a null-tested Int64? identifier; undefined when unproven
    csharpIntegralNonNullText(call, operand, printed: string): string | undefined {
        if (operand.kind !== 'Int64?') {
            return printed;
        }
        let symbol: any;
        try {
            symbol = this.getChecker().getSymbolAtLocation(operand.node);
        } catch (e) {
            return undefined;
        }
        if ((symbol === undefined) || (!this.csharpIntegralTestedInExpression(call, symbol)
            && (this.csharpIntegralBindingIsRewritten(symbol) || !this.csharpNullGuardAdmitsRead(call, operand.node)))) {
            return undefined;
        }
        return `${printed}.Value`;
    }

    // the null test sits in the same expression as the read (`x == null ? a : f(x)`, `x != null && f(x)`)
    csharpIntegralTestedInExpression(call, symbol): boolean {
        let current: any = call;
        while (current.parent !== undefined) {
            const parent: any = current.parent;
            if ((parent.kind === SyntaxKind.ConditionalExpression) && (parent.condition !== current)
                && this.csharpTestIsNonNullCheck(parent.condition, symbol, parent.whenTrue === current)) {
                return true;
            }
            if ((parent.kind === SyntaxKind.BinaryExpression) && (parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken)
                && (parent.right === current) && this.csharpTestIsNonNullCheck(parent.left, symbol, true)) {
                return true;
            }
            if (isBlock(parent) || isExpressionStatement(parent) || isReturnStatement(parent) || isIfStatement(parent)
                || (parent.kind === SyntaxKind.VariableDeclarationList) || this.csharpIsFunctionLike(parent)) {
                return false;
            }
            current = parent;
        }
        return false;
    }

    // any write to the binding in its function (destructuring targets included) voids a dominance proof
    csharpIntegralBindingIsRewritten(symbol): boolean {
        const declaration: any = symbol.valueDeclaration?.resolve();
        const scope = (declaration === undefined) ? undefined : this.csharpEnclosingFunction(declaration);
        if (scope === undefined) {
            return true;
        }
        let written = false;
        const visit = (n: any) => {
            if (written) {
                return;
            }
            if (isIdentifier(n) && (n !== declaration.name) && this.csharpSameBinding(n, symbol)) {
                let target: any = n;
                while ((target.parent !== undefined) && (isParenthesizedExpression(target.parent) || isArrayLiteralExpression(target.parent) || isObjectLiteralExpression(target.parent))) {
                    target = target.parent;
                }
                written = this.csharpIsWriteTarget(target);
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return written;
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

    // `multiply(N, M)` over two unsigned numeric literals: two integers box the Int64 product
    // (`NL * ML`, the same value while it is a safe integer); otherwise the helper multiplies the
    // doubles and re-boxes an integral product as Int64, so only a fractional product goes native.
    csharpNativeLiteralProduct(left, right): string | undefined {
        if (!isNumericLiteral(left) || !isNumericLiteral(right)) {
            return undefined;
        }
        const leftText = left.text;
        const rightText = right.text;
        if (/^\d+$/.test(leftText) && /^\d+$/.test(rightText)) {
            const product = Number(leftText) * Number(rightText);
            return Number.isSafeInteger(product) ? `(${leftText}L * ${rightText}L)` : undefined;
        }
        const decimal = /^\d+(\.\d+)?$/;
        // IsInteger reads the product through Convert.ToDecimal, i.e. rounded to 15 significant digits
        const rounded = Number((Number(leftText) * Number(rightText)).toPrecision(15));
        if (!decimal.test(leftText) || !decimal.test(rightText) || Number.isInteger(rounded)) {
            return undefined;
        }
        return `(${leftText} * ${rightText})`;
    }

    // `a % b` prints `mod(a, b)`: the helper takes the double remainder and converts back to Int64. An
    // Int32 dividend with a nonzero integer literal divisor is exact as double, so the native Int64
    // remainder matches. Int64 dividends (rounded above 2^53) and possibly-zero divisors keep helper.
    csharpNativeModExpression(left, right, leftText) {
        if (left?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const divisor = csharpLiteralNumericValue(right);
        if ((divisor === undefined) || !Number.isSafeInteger(divisor) || (divisor === 0)) {
            return undefined;
        }
        if (this.csharpExpressionTypeOf(left) !== 'int') {
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

    // the C# type of a dictionary element read is `object`: isEqual compares the boxed
    // element, which `as` + the operator reproduce exactly (any other box reads as null,
    // where isEqual also answers false)
    csharpNativeElementLiteralEquality(left, right, leftText: string, rightText: string, isEquality: boolean): string | undefined {
        const elementIsLeft = this.csharpStringKeyedElementAccess(left);
        if (!elementIsLeft && !this.csharpStringKeyedElementAccess(right)) {
            return undefined;
        }
        const [element, literal] = elementIsLeft ? [left, right] : [right, left];
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
        const castElement = `(${elementIsLeft ? leftText : rightText} as ${cast})`;
        const otherText = elementIsLeft ? rightText : leftText;
        return elementIsLeft ? `(${castElement} ${token} ${otherText})` : `(${otherText} ${token} ${castElement})`;
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

    // `isEqual (x, null)` -> `x == null` (`!isEqual` -> `!=`) when the emitted declaration is
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

            const tempCast = (tempType && this.csharpDestructuringTempNeedsCast(right, tempExpression)) ? `(${tempType})` : '';
            let arrayBindingStatement = tempType ? `${tempType} ${syntheticName} = ${tempCast}${tempExpression};\n` : `var ${syntheticName} = ${tempExpression};\n`;
            const boolSlot = this.csharpBoolOptionSlotWriteIsTyped(left);

            parsedArrayBindingElements.forEach((e, index) => {
                const leftElement = arrayBindingPatternElements[index];
                const leftType = this.getChecker().getTypeAtLocation(leftElement);
                const parsedType = this.getTypeFromRawType(leftType);

                const castExp = parsedType ? `(${parsedType})` : "";

                // const statement = this.getIden(identation) + `${e} = (${castExp}((List<object>)${syntheticName}))[${index}]`;
                const slotCast = (boolSlot && (index === 0)) ? '(bool)' : '';
                const statement = this.getIden(identation) + (tempType ? `${e} = ${slotCast}${syntheticName}[${index}]` : `${e} = ${slotCast}((IList<object>)${syntheticName})[${index}]`);
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
                // `x += v` IS `x = add (x, v)`; on a non-null string left the same concatenation
                // prints natively (add(string, *) never answers null either)
                if (this.csharpNonNullStringOperandType(left) === 'string') {
                    return `${leftText} = (${leftText} + (${rightText}))`;
                }
                const objectStringAppend = this.csharpObjectStringConcat(left, [ right ]);
                if (objectStringAppend !== undefined) {
                    return `${leftText} = ${objectStringAppend}`;
                }
                return `${leftText} = add(${leftText}, ${rightText})`;
            }

            if (op === SyntaxKind.MinusEqualsToken) {
                return `${leftText} = subtract(${leftText}, ${rightText})`;
            }

            const isEquality = (op === SyntaxKind.EqualsEqualsToken) || (op === SyntaxKind.EqualsEqualsEqualsToken);
            const isDifference = (op === SyntaxKind.ExclamationEqualsToken) || (op === SyntaxKind.ExclamationEqualsEqualsToken);
            if (isEquality || isDifference) {
                // `isEqual (x, "lit")` / `!isEqual (x, "lit")` over a string-typed operand
                // (csharpStringLiteralEquality) first; anything the hook cannot name falls through to the
                // printed-form inlining below, byte-identically.
                const nativeEquality = this.csharpStringLiteralEquality(op, left, right, leftText, rightText);
                // `isEqual (x, null)` / `!isEqual (x, null)` over a typed-reference or nullable-scalar operand
                // (csharpNullLiteralEquality), the hook-gated null-literal twin of the rule above; anything
                // it cannot name falls through to the printed-form inlining below, byte-identically.
                const native = nativeEquality
                    ?? this.csharpNullLiteralEquality(op, left, right, leftText, rightText)
                    ?? this.printInlineEquality(left, right, leftText, rightText, isEquality)
                    ?? this.csharpNativeScalarFieldEquality(left, right, leftText, rightText, isEquality)
                    ?? this.csharpNativeModLiteralEquality(left, right, isEquality)
                    ?? this.csharpNativeArithmeticEquality(left, right, leftText, rightText, isEquality)
                    ?? this.csharpNativeElementLiteralEquality(left, right, leftText, rightText, isEquality)
                    ?? this.csharpNativeNumericCallEquality(left, right, leftText, rightText, isEquality);
                if (native !== undefined) {
                    return native;
                }
            }

            if (op === SyntaxKind.PlusToken) {
                // `add (x, y)` -> `(x + y)` when the classifier proves the LEFT operand's emitted declaration is a
                // string: the call binds add(string, string) / add(string, object), exactly this
                // concatenation. Gated on the hook, so an unnamed operand keeps the helper.
                const nativeConcat = this.csharpNativeStringConcat(left, right, leftText, rightText);
                if (nativeConcat !== undefined) {
                    return nativeConcat;
                }
                // the printer's own proof (same-class typed returns + literals): the build layer's
                // hook above answers only the declarations it retypes after printing
                const printerConcat = this.csharpPrinterStringConcat(left, right, leftText, rightText);
                if (printerConcat !== undefined) {
                    return printerConcat;
                }
                const spine = this.csharpPlusSpine(node);
                const objectStringChain = (spine === undefined) ? undefined : this.csharpObjectStringConcat(spine.base, spine.rights);
                if (objectStringChain !== undefined) {
                    return objectStringChain;
                }
            }

            if (op === SyntaxKind.AsteriskToken) {
                const nativeProduct = this.csharpNativeLiteralProduct(left, right);
                if (nativeProduct !== undefined) {
                    return nativeProduct;
                }
            }

            const [open, close] = this.binaryExpressionsWrappers[op];
            if (op === SyntaxKind.PercentToken) {
                const nativeMod = this.csharpNativeIntegralMod(node, leftText, rightText) ?? this.csharpNativeModExpression(left, right, leftText);
                if (nativeMod !== undefined) {
                    return nativeMod;
                }
            }
            return `${open}${leftText}, ${rightText}${close}`;
        }

        return undefined;
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

    // the emitted C# type of an identifier operand of a null comparison, installed by
    // build/csharp-local-types.js from the PRINTED declaration lines (retyped after printing, so the
    // printer cannot see it). Undefined by default: every null comparison keeps isEqual unchanged.
    csharpNullComparisonTypeOf(node): string | undefined {
        return undefined;
    }

    // `-x` on a local declared `double?` (a safeNumber read) inside a
    // non-null guard on x (`if (x !== undefined)`, `x !== undefined && ...`, early exit). The guard
    // proves the box is a number, so the local keeps its nullable scalar type and the negation is the
    // helper's own in-place body `(x = -x)` (lifted: x is non-null here). Unguarded reads keep `object`.
    csharpGuardedNullableNegation(node, csharpType: string): boolean {
        if (csharpType !== 'double?') {
            return false;
        }
        if (!isPrefixUnaryExpression(node) || (node.operator !== SyntaxKind.MinusToken) || !isIdentifier(node.operand)) {
            return false;
        }
        return this.csharpNullGuardAdmitsRead(node, node.operand);
    }

    // the C# type the local's printed declaration finally carries; an embedding build layer that
    // retypes `object x = ...` after printing overrides this with its own (final) answer
    csharpFinalDeclaredLocalType(declaration): string | undefined {
        return this.getCSharpLocalType(declaration);
    }

    csharpNativeNegatedNullableLocal(node, leftSide: string): string | undefined {
        const operand = node.operand;
        if (!isIdentifier(operand)) {
            return undefined;
        }
        // the prefix the declaration printed (`double? x = ...`): the printer's own decision, or the
        // embedding build layer's wrapped one; a declaration list of several bindings prints `object`
        const declaration: any = this.getChecker().getSymbolAtLocation(operand)?.valueDeclaration?.resolve();
        if (!declaration || !isVariableDeclaration(declaration) || (declaration.parent?.declarations?.length !== 1)) {
            return undefined;
        }
        const declared = this.csharpFinalDeclaredLocalType(declaration);
        if (!this.csharpGuardedNullableNegation(node, declared)) {
            return undefined;
        }
        return `(${leftSide} = -${leftSide})`;
    }

    // ==== string concatenation and string-typed returns ====

    // a `string?` local read as the LEFT of `+` where a non-null proof dominates the read and the
    // right operand prints a string: add(string, object) and add(object, object) agree there, so
    // the declaration may keep the nullable type and the chain prints natively.
    csharpGuardedStringConcatRead(node): boolean {
        let value = node;
        while (value.parent && (value.parent.kind === SyntaxKind.ParenthesizedExpression)) {
            value = value.parent;
        }
        const parent = value.parent;
        if (parent?.kind !== SyntaxKind.BinaryExpression || (parent.left !== value) || (parent.operatorToken?.kind !== SyntaxKind.PlusToken)) {
            return false;
        }
        if (!this.csharpConcatOperandPrintsString(parent.right, 0, true)) {
            return false;
        }
        return this.csharpNullGuardAdmitsRead(node, node);
    }

    printCustomDefaultValueIfNeeded(node) {
        if (isArrayLiteralExpression(node) || isObjectLiteralExpression(node) || isStringLiteral(node) || isBooleanLiteral(node)
            || isNumericLiteral(node)) {
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

        // a body with parameters prints statement by statement, so the Promise.all plan is made here
        this.csharpPromiseAllPlanBlock(node?.body);
        this.csharpPromiseAllTypedPlanFunction(node);

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
                    if (isNumericLiteral(initializer) || isStringLiteral(initializer) || isBooleanLiteral(initializer)) {
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

    // A method declared `: string` / `: Str` returns a C# `string?` instead of `object`. Only
    // non-async methods with an explicit annotation qualify; any other member of the annotation
    // (or an inferred type) keeps the upstream `object`. The nullable spelling is deliberate:
    // `string` and `string?` are one runtime type, and the nullable one keeps a caller's null test
    // meaningful (a non-nullable return turns it into CS8073 under TreatWarningsAsErrors).
    csharpStringReturnType(node): string | undefined {
        if (node?.kind !== SyntaxKind.MethodDeclaration || this.isAsyncFunction(node)) {
            return undefined;
        }
        if (this.csharpStringReturnTypes.has(node)) {
            return this.csharpStringReturnTypes.get(node);
        }
        let result: string | undefined = undefined;
        if (node.type) {
            const type = this.getChecker().getTypeFromTypeNode(node.type);
            const members = type.isUnionType() ? type.getTypes() : [ type ];
            let stringMember = false;
            let otherMember = false;
            for (const member of members) {
                if (member.flags & (TypeFlags.Undefined | TypeFlags.Null)) {
                    continue;
                } else if (this.isStringType(member.flags)) {
                    stringMember = true;
                } else {
                    otherMember = true;
                }
            }
            if (stringMember && !otherMember) {
                result = this.STRING_KEYWORD + '?';
            }
        } else {
            // an un-annotated override inherits the parent's printed return type
            // (printMethodDefinition), so its returns need the same unboxing
            result = this.csharpStringReturnType(this.getMethodOverride(node));
        }
        // netstandard2.x forbids a covariant return (CS8830): an override must print exactly the
        // type its base prints, so it is typed only when the base method is typed too
        if ((result !== undefined) && this.isOverrideMethod(node) && (this.csharpStringReturnType(this.getMethodOverride(node)) === undefined)) {
            result = undefined;
        }
        this.csharpStringReturnTypes.set(node, result);
        return result;
    }

    // the C# string box a `this.<name>(...)` call hands back: the printer's own table of the
    // hand-written base helpers first (that IS the emitted signature), then a method of the SAME
    // class whose printed return this printer typed. Anything else keeps the helper.
    csharpStringCallTyped(node): string | undefined {
        if (node?.kind !== SyntaxKind.CallExpression) {
            return undefined;
        }
        let declared;
        try {
            declared = this.csharpCallReturnType(node);
        } catch (e) {
            declared = undefined;
        }
        if ((declared === 'string') || (declared === 'string?')) {
            return declared;
        }
        const expression = node.expression;
        if (expression?.kind !== SyntaxKind.PropertyAccessExpression || expression.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        if (CSHARP_PRINTED_STRING_HELPERS.has(expression.name?.text) && this.csharpCalleeResolves(node)) {
            return this.STRING_KEYWORD + '?';
        }
        let declaration;
        try {
            declaration = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
        } catch (e) {
            return undefined;
        }
        if ((declaration === undefined) || !isMethodDeclaration(declaration)) {
            return undefined;
        }
        const owner = findAncestor(declaration, isClassLikeDeclaration);
        if ((owner === undefined) || (owner !== findAncestor(node, isClassLikeDeclaration))) {
            return undefined;
        }
        const printed = this.csharpPrintedReturnType(declaration);
        return ((printed === 'string') || (printed === 'string?')) ? printed : undefined;
    }

    // the type the composed printer writes into a method's signature (the build layer's retype
    // wins over the annotation rule), i.e. the static type of a call to it
    csharpPrintedReturnType(declaration): string | undefined {
        if (this.csharpPrintedReturnTypes.has(declaration)) {
            return this.csharpPrintedReturnTypes.get(declaration);
        }
        let printed;
        try {
            printed = this.printFunctionType(declaration);
        } catch (e) {
            printed = undefined;
        }
        this.csharpPrintedReturnTypes.set(declaration, printed);
        return printed;
    }

    // `add (x, y)` -> `(x + y)` when BOTH operands print a string, so the emitted call would bind
    // add(string, string) / add(string, object) — both compute C# concatenation, nulls included.
    // Absolute operands (a literal, an `as string` cast, a proven call, a proven concat) keep the helper.
    csharpPrinterStringConcat(left, right, leftText, rightText): string | undefined {
        // a NON-NULL string left takes any right operand: the call would bind add(string, *), which
        // is C# concatenation for every input, boxed or not (`string + object` calls ToString on a
        // non-string right exactly like add(string, object) does, and a null right reads as the left)
        if (this.csharpNonNullStringOperandType(left, undefined, true) === 'string') {
            return `(${leftText} + ${rightText})`;
        }
        if (!this.csharpConcatOperandPrintsString(left) || !this.csharpConcatOperandPrintsString(right)) {
            return undefined;
        }
        return `(${leftText} + ${rightText})`;
    }

    csharpConcatOperandPrintsString(node, depth = 0, allowLocal = false): boolean {
        if ((node === undefined) || (depth > 6)) {
            return false;
        }
        switch (node.kind) {
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
            return true;
        case SyntaxKind.Identifier: {
            // a local the classifier declares string/string? binds the same overload the concat does
            if (!allowLocal) {
                return false;
            }
            const local = this.csharpLocalTypeOf(node);
            return (local === 'string') || (local === 'string?');
        }
        case SyntaxKind.ParenthesizedExpression:
        case SyntaxKind.NonNullExpression:
            return this.csharpConcatOperandPrintsString(node.expression, depth + 1, allowLocal);
        case SyntaxKind.AsExpression: {
            const target = this.getChecker().getTypeFromTypeNode(node.type);
            const members = target.isUnionType() ? target.getTypes() : [ target ];
            return members.every((member) => (member.flags & (TypeFlags.Undefined | TypeFlags.Null)) || this.isStringType(member.flags));
        }
        case SyntaxKind.BinaryExpression:
            return (node.operatorToken?.kind === SyntaxKind.PlusToken)
                && this.csharpConcatOperandPrintsString(node.left, depth + 1, allowLocal)
                && this.csharpConcatOperandPrintsString(node.right, depth + 1, allowLocal);
        case SyntaxKind.ConditionalExpression:
            return this.csharpConcatOperandPrintsString(node.whenTrue, depth + 1, allowLocal)
                && this.csharpConcatOperandPrintsString(node.whenFalse, depth + 1, allowLocal);
        case SyntaxKind.CallExpression:
            return this.csharpStringCallTyped(node) !== undefined;
        }
        return false;
    }

    // `a + b + c` as its left spine: the base operand and the right operands in order (parentheses stay transparent)
    csharpPlusSpine(node): { base: any, rights: any[] } | undefined {
        const rights: any[] = [];
        let current = node;
        while (current?.kind === SyntaxKind.BinaryExpression && current.operatorToken?.kind === SyntaxKind.PlusToken) {
            rights.unshift(current.right);
            current = current.left;
            while (current?.kind === SyntaxKind.ParenthesizedExpression) {
                current = current.expression;
            }
        }
        return rights.length === 0 ? undefined : { base: current, rights };
    }

    // `x + r1 + r2` over a local the checker types string (or string | undefined) whose C# declaration is the
    // untyped `object` box: add(object, object) of a string left is `(string)x + (string)r`, and a null left answers
    // null, so the null test plus the concatenation is the same value. Each right is spelled as the string it
    // prints, or cast through object the way the helper casts it. A right operand is evaluated only when x is
    // non-null; one that awaits, assigns or creates a closure keeps the helper.
    csharpObjectStringConcat(base, rights: any[]): string | undefined {
        let local = base;
        while (local?.kind === SyntaxKind.ParenthesizedExpression) {
            local = local.expression;
        }
        if (!isIdentifier(local) || !this.csharpObjectStringLocal(local)) {
            return undefined;
        }
        const texts: string[] = [];
        for (const right of rights) {
            if (this.csharpEvaluationHasEffects(right)) {
                return undefined;
            }
            const printed = this.printNode(right, 0);
            texts.push(this.csharpConcatOperandPrintsString(right, 0, true) ? printed : `(string)(object)(${printed})`);
        }
        const name = this.printNode(local, 0);
        return `((object)(${name} == null ? null : ${name} + ${texts.join(' + ')}))`;
    }

    // a single-binding local whose printed declaration is the untyped box and whose initializer and every write
    // store null or a value the printed C# makes a string (a literal, a string-typed call, a string concatenation,
    // another such local): the box holds a string or null at every read, so add's string branch is the concat
    csharpObjectStringLocal(identifier, depth = 0): boolean {
        const declaration: any = this.csharpReceiverBinding(identifier);
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || (declaration.parent as any)?.declarations?.length !== 1
            || declaration.initializer === undefined || depth > 4) {
            return false;
        }
        // a declaration whose type is being decided right now (the typing scan prints its uses) is not provable;
        // the printed declaration must be the untyped box, or the build layer's own string rules own the read
        if ((this as any).csharpLocalTypeInProgress?.has(declaration) || this.getCSharpLocalType(declaration) !== this.VAR_TOKEN
            || this.csharpTypeIsStringType(this.csharpDeclaredKeyType(identifier) ?? '')) {
            return false;
        }
        let init = declaration.initializer;
        while (init?.kind === SyntaxKind.ParenthesizedExpression) {
            init = init.expression;
        }
        if (isIdentifier(init) && this.csharpReceiverBinding(init)?.kind === SyntaxKind.BindingElement) {
            return false; // a destructured slot is declared string? by the build layer's retype after printing
        }
        const scope = this.csharpEnclosingFunction(declaration);
        if (scope === undefined || !this.csharpIsStringValued(declaration.initializer, depth + 1)) {
            return false;
        }
        let ok = true;
        const symbol = this.getChecker().getSymbolAtLocation(identifier);
        const visit = (n) => {
            if (!ok) {
                return;
            }
            if (isIdentifier(n) && n.text === identifier.text && n !== declaration.name && n.parent?.kind !== SyntaxKind.PropertyAccessExpression
                && this.getChecker().getSymbolAtLocation(n) === symbol) {
                const parent: any = n.parent;
                if (parent?.kind === SyntaxKind.BinaryExpression && parent.left === n && this.csharpIsAssignmentOperator(parent.operatorToken.kind)) {
                    const op = parent.operatorToken.kind;
                    if (op === SyntaxKind.PlusEqualsToken) {
                        // the append keeps a string or null box
                    } else if (op !== SyntaxKind.EqualsToken || !this.csharpIsStringValued(parent.right, depth + 1)) {
                        ok = false;
                    }
                } else if ((parent?.kind === SyntaxKind.PrefixUnaryExpression || parent?.kind === SyntaxKind.PostfixUnaryExpression)
                    && (parent.operator === SyntaxKind.PlusPlusToken || parent.operator === SyntaxKind.MinusMinusToken)) {
                    ok = false;
                }
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return ok;
    }

    // the printed C# of this expression is null or a string
    csharpIsStringValued(node, depth = 0): boolean {
        let value = node;
        while (value?.kind === SyntaxKind.ParenthesizedExpression) {
            value = value.expression;
        }
        if (value === undefined || depth > 6) {
            return false;
        }
        if (value.kind === SyntaxKind.NullKeyword || (isIdentifier(value) && value.text === 'undefined')) {
            return true;
        }
        if (value.kind === SyntaxKind.ConditionalExpression) {
            return this.csharpIsStringValued(value.whenTrue, depth + 1) && this.csharpIsStringValued(value.whenFalse, depth + 1);
        }
        if (isIdentifier(value) && (this.csharpObjectStringLocal(value, depth + 1) || this.csharpTypeIsStringType(this.csharpDeclaredKeyType(value) ?? ''))) {
            return true;
        }
        if (value.kind === SyntaxKind.BinaryExpression && value.operatorToken?.kind === SyntaxKind.PlusToken) {
            const spine = this.csharpPlusSpine(value);
            return spine !== undefined && this.csharpIsStringValued(spine.base, depth + 1);
        }
        return this.csharpConcatOperandPrintsString(value, 0, true) || this.csharpCheckedStringOrNull(value);
    }

    // the checker types the expression string / null / undefined only (at least one string): at run time it is a
    // string or null whichever way the printer spells it
    csharpCheckedStringOrNull(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const type = checker.getTypeAtLocation(node);
        const members = ((type.flags & TypeFlags.Union) !== 0) ? ((type as UnionType).getTypes() ?? []) : [ type ];
        let strings = 0;
        for (const member of members) {
            if ((member.flags & (TypeFlags.Undefined | TypeFlags.Null)) !== 0) {
                continue;
            }
            if (!this.isStringType(member.flags)) {
                return false;
            }
            strings++;
        }
        return strings > 0;
    }

    csharpEvaluationHasEffects(node): boolean {
        let found = false;
        const visit = (n) => {
            if (found) {
                return;
            }
            if (n.kind === SyntaxKind.AwaitExpression || n.kind === SyntaxKind.FunctionExpression || n.kind === SyntaxKind.ArrowFunction
                || n.kind === SyntaxKind.NewExpression || n.kind === SyntaxKind.YieldExpression || n.kind === SyntaxKind.DeleteExpression
                || (n.kind === SyntaxKind.BinaryExpression && this.csharpIsAssignmentOperator(n.operatorToken.kind))
                || ((n.kind === SyntaxKind.PrefixUnaryExpression || n.kind === SyntaxKind.PostfixUnaryExpression)
                    && (n.operator === SyntaxKind.PlusPlusToken || n.operator === SyntaxKind.MinusMinusToken))) {
                found = true;
                return;
            }
            n.forEachChild(visit);
        };
        visit(node);
        return found;
    }

    printFunctionType(node) {
        const booleanType = this.csharpBooleanReturnType(node);
        if (booleanType !== undefined) {
            return booleanType;
        }
        const stringType = this.csharpStringReturnType(node);
        if (stringType !== undefined) {
            return stringType;
        }
        const own = super.printFunctionType(node);
        return (own === 'object') ? (this.csharpCollectionReturnType(node) ?? own) : own;
    }

    // `return x;` inside a bool/bool?/string/string? method: the printed expression is still the
    // `object` box the rest of the printer produces, so unbox it through `object`. The nullable
    // spellings accept null; the non-nullable ones need the null-forgiving `!` on the box
    // (CS8605 under TreatWarningsAsErrors otherwise) — which is exactly the runtime
    // NullReferenceException a `: boolean` method returning null deserves (a `: string` one
    // answers null, the reference-type cast the box already has)
    printReturnStatement(node, identation) {
        // nearest function-like: a `return` inside an arrow/function expression belongs to
        // that callback, never to the enclosing typed method
        const owner = findAncestor(node.parent, isFunctionLike);
        const booleanType = this.csharpBooleanReturnType(owner);
        if (booleanType === undefined) {
            const stringType = this.csharpStringReturnType(owner);
            if ((stringType === undefined) || !node.expression || this.csharpReturnValuePrintsType(node.expression, stringType)) {
                return super.printReturnStatement(node, identation);
            }
            return this.printUnboxedReturnStatement(node, identation, stringType, '');
        }
        if (!node.expression) {
            return super.printReturnStatement(node, identation);
        }
        const forgiving = booleanType.endsWith('?') ? '' : '!';
        return this.printUnboxedReturnStatement(node, identation, booleanType, forgiving);
    }

    // the value already carries the declared string type (a literal, a proven call/concat, a local
    // the classifier declares string/string?): the unbox cast would be an identity conversion
    csharpReturnValuePrintsType(expression, declared: string): boolean {
        if ((expression.kind === SyntaxKind.NullKeyword)
            || ((expression.kind === SyntaxKind.Identifier) && (expression.text === 'undefined'))) {
            return true;
        }
        if (this.csharpConcatOperandPrintsString(expression, 0, true)) {
            return true;
        }
        if (expression.kind === SyntaxKind.Identifier) {
            const local = this.csharpLocalTypeOf(expression);
            if ((local === 'string') || (local === 'string?') || (local === declared)) {
                return true;
            }
        }
        let printed;
        try {
            printed = this.csharpTypeOfInitializer(expression);
        } catch (e) {
            printed = undefined; // an initializer shape the local-type tables do not model
        }
        return (printed === 'string') || (printed === 'string?');
    }

    printUnboxedReturnStatement(node, identation, declaredType: string, forgiving: string) {
        const leadingComment = this.printLeadingComments(node, identation);
        let trailingComment = this.printTraillingComment(node, identation);
        trailingComment = trailingComment ? " " + trailingComment : trailingComment;
        const value = this.printNode(node.expression, identation).trim();
        return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + ` ((${declaredType})((object)(${value}))${forgiving})` + this.LINE_TERMINATOR + trailingComment;
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
                parsedArgs = parentArgs.map((param, index) => this.printParameteCustomName(param, this.printNode(currentArgs[index].name, 0))).join(", ");
            }
        }

        parsedArgs = parsedArgs ? parsedArgs : this.printMethodParameters(node);

        returnType = returnType ? returnType + " " : returnType;

        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
        const methodDef = this.getIden(identation) + modifiers + returnType + methodToken + name
            + "(" + parsedArgs + ")";

        return this.printNodeCommentsIfAny(node, identation, methodDef);
    }

    // a `this.<name>(...)` call whose emitted signature is already a string: the printer's own typed
    // returns, or a `string` the hand-written base declares (cs/ccxt/base, resolved callee only)
    csharpCallReturnsString(node): boolean {
        let call = node;
        while (call?.kind === SyntaxKind.ParenthesizedExpression) {
            call = call.expression;
        }
        const callee = call?.expression;
        if ((call?.kind !== SyntaxKind.CallExpression) || (callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return false;
        }
        const file = String(call.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
        if ((file.indexOf('ts/src/') < 0) || (file.indexOf('/test/') >= 0)) {
            return false;
        }
        const typed = this.csharpStringCallTyped(call);
        if ((typed === 'string') || (typed === 'string?')) {
            return true;
        }
        const declared = this.csharpDeclaredMethodReturn(call, callee.name?.text as string);
        return ((declared === 'string') || (declared === 'string?')) && this.csharpCalleeResolves(call);
    }

    // `JSON.parse (x)`: parseJson is an identity wrapper over JsonHelper.Deserialize((string)x), so a
    // read whose emitted declaration is a C# string (or string?) calls the deserializer directly;
    // every other operand keeps the helper
    printJsonParseCall(node, identation, parsedArg = undefined) {
        const arg = node?.arguments?.[0];
        if ((node?.arguments?.length === 1) && isIdentifier(arg)) {
            const declared = this.csharpArithmeticOperandType(arg);
            if ((declared === 'string') || (declared === 'string?')) {
                return `JsonHelper.Deserialize(${parsedArg})`;
            }
        }
        if ((node?.arguments?.length === 1) && this.csharpCallReturnsString(node.arguments[0])) {
            return `JsonHelper.Deserialize((string)${parsedArg})`;
        }
        return `parseJson(${parsedArg})`;
    }

    printJsonStringifyCall(node, identation, parsedArg = undefined) {
        return `json(${parsedArg})`; // make this customizable
    }

    // `add (x, y)` -> `(x + y)` when the classifier proves the LEFT operand's emitted declaration is a
    // string: add(string, string) / add(string, object) compute exactly C# concatenation, nulls
    // included. Undefined keeps the helper; parenthesised because `+` binds looser in embedded text.
    csharpNativeStringConcat(left, right, leftText: string, rightText: string): string | undefined {
        return undefined;
    }

    // ==== local declarations and their typed reads ====

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
        if (isPropertyAccessExpression(node)) {
            const member = this.csharpMemberReceiver(node);
            if (member !== undefined) {
                return { text: member.text, type: member.type };
            }
        }
        if (isPropertyAccessExpression(node) && node.expression?.kind === SyntaxKind.ThisKeyword) {
            const name = node.name?.text as string;
            if (CSHARP_OBJECT_DICT_FIELDS.indexOf(name) >= 0) {
                if (this.csharpBaseFieldDeclaredDictionary(name)) {
                    return { text: this.printNode(node, 0), type: 'IDictionary<string, object>' }; // declared, so the cast is an identity
                }
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
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration?.resolve();
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

    // the name is rewritten before this read, so the box it holds there is not the one its
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

    // `x.length` -> `x.Count`, same proof for the checker's array operands; strings keep
    // the `((string)x).Length` branch and every unproven operand keeps getArrayLength
    csharpNativeLengthExpression(expression): string | undefined {
        if (csharpListParamDeclaration(this, expression)) {
            // a parameter this printer typed as a list: keep getArrayLength's null -> 0 branch
            const declared = this.csharpDeclaredLengthExpression(expression);
            if (declared !== undefined) {
                return declared;
            }
        }
        if (this.csharpIsArrayType(this.getChecker().getTypeAtLocation(expression))) {
            // a declared list member keeps getArrayLength's `null -> 0` branch
            const member = this.csharpMemberReceiver(expression);
            if (member !== undefined && member.kind === 'list') {
                return `(${member.text}?.Count ?? 0)`;
            }
            const receiver = this.csharpNativeReceiver(expression);
            if (receiver !== undefined) {
                return `${receiver.text}.Count`;
            }
        }
        return this.csharpDeclaredLengthExpression(expression);
    }

    // the C# type the emitted declaration gives a `.length` receiver, or undefined when this
    // printer names none. Installed by build/csharp-local-types.js; undefined by default, so
    // the untyped emission is byte-identical without the override
    csharpLengthReceiverType(expression): string | undefined {
        return undefined;
    }

    // A method named in config.csharp.uniqueMethodNames (declared once tree-wide, not async, not an override)
    // whose annotation is a collection and whose every return statement prints that collection returns it;
    // the signature, the bare returns and the `this.<name>(...)` callers' locals all read this one proof.
    csharpCollectionReturnType(node): string | undefined {
        if (this.csharpUniqueMethods === undefined || node?.kind !== SyntaxKind.MethodDeclaration || !this.csharpUniqueMethods.has(node.name?.text)) {
            return undefined;
        }
        const key = this.csharpNodePositionKey(node);
        if (this.csharpCollectionReturnTypes.has(key)) {
            return this.csharpCollectionReturnTypes.get(key);
        }
        if (this.csharpCollectionReturnProofs.has(key)) {
            return undefined; // a proof chain that reaches its own declaration
        }
        this.csharpCollectionReturnProofs.add(key);
        let result: string | undefined = undefined;
        try {
            result = this.csharpProveCollectionReturn(node);
        } finally {
            this.csharpCollectionReturnProofs.delete(key);
        }
        this.csharpCollectionReturnTypes.set(key, result);
        return result;
    }

    csharpProveCollectionReturn(node): string | undefined {
        const checker: any = this.checkerOrUndefined();
        const overridden = (node.modifiers ?? []).some((m) => m.kind === SyntaxKind.OverrideKeyword);
        if (checker === undefined || node.body === undefined || node.type === undefined || overridden || this.isAsyncFunction(node) || this.getMethodOverride(node) !== undefined) {
            return undefined;
        }
        if (checker.getSymbolAtLocation(node.name)?.declarations?.length !== 1) {
            return undefined;
        }
        const box = this.csharpCollectionBoxOfType(checker, checker.getTypeFromTypeNode(node.type));
        let returns = 0;
        let proved = box !== undefined;
        const visit = (n: any) => {
            if (!proved || isFunctionLike(n)) {
                return; // a return inside a callback belongs to that callback
            }
            if (n.kind === SyntaxKind.ReturnStatement) {
                returns++;
                proved = (n.expression !== undefined) && this.csharpReturnValueProvesBox(n.expression, box as string);
                return;
            }
            n.forEachChild(visit);
        };
        node.body.forEachChild(visit);
        return (proved && returns > 0) ? box : undefined;
    }

    getCSharpLocalType(declaration): string {
        // a declaration whose initializer names a local that is itself being typed right now (a
        // `a = b + x` / `b = a + y` pair) is not provable: answer `var` instead of recursing
        const inProgress = ((this as any).csharpLocalTypeInProgress ??= new Set());
        if (inProgress.has(declaration)) {
            return this.VAR_TOKEN;
        }
        inProgress.add(declaration);
        try {
            return this.csharpResolvedLocalType(declaration);
        } finally {
            inProgress.delete(declaration);
        }
    }

    csharpResolvedLocalType(declaration): string {
        if (this.csharpInt64ForCounter(declaration)) {
            return 'Int64';
        }
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

    // a later write keeps the named type when it stores a value of that shape: the non-null twin of
    // a nullable scalar (a `Nullable<T>` boxes as `T`), the null literal, or a copy of a local the
    // printer already declares that type.
    csharpWriteKeepsLocalType(right, csharpType: string): boolean {
        // the family is the nullable scalars: every other declaration keeps the printer's
        // initializer-only rule, so list/dict locals and their null-safety spelling do not move
        if (CSHARP_NULLABLE_WIDENING[csharpType] === undefined) {
            return this.csharpTypeOfInitializer(right) === csharpType;
        }
        if ((right?.kind === SyntaxKind.NullKeyword) || ((right?.kind === SyntaxKind.Identifier) && (right.text === 'undefined'))) {
            // a null write belongs to a nullable spelling only: a non-nullable `string` declaration
            // has its own promotion retry (`string?`), and answering true here would print the local
            // as a non-null string and weaken every later `+` operand proof.
            return csharpType.endsWith('?');
        }
        let valueType = this.csharpTypeOfInitializer(right) ?? this.csharpSourceLocalType(right);
        if ((valueType === undefined) && (right?.kind === SyntaxKind.NumericLiteral)) {
            // a C# literal is `int` (or `double` when fractional): both convert implicitly into a
            // nullable scalar and box as that scalar, never as the int box `object x = 5` carries
            valueType = (right.text.indexOf('.') >= 0) ? 'double' : 'int';
        }
        if (valueType === undefined) {
            return false;
        }
        if (valueType === csharpType) {
            return true;
        }
        const widened = CSHARP_NULLABLE_WIDENING[csharpType];
        return (widened !== undefined) && (widened.indexOf(valueType) >= 0);
    }

    // the printed declaration type of the local a bare identifier reads, when the printer names it
    csharpSourceLocalType(node): string | undefined {
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const declaration = this.csharpReceiverBinding(node);
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || (declaration.parent as any)?.declarations?.length !== 1) {
            return undefined;
        }
        const type = this.getCSharpLocalType(declaration);
        return ((type === undefined) || (type === this.VAR_TOKEN)) ? undefined : type;
    }

    printVariableDeclarationList(node,identation) {
        const declaration = node.declarations[0];

        if ((declaration !== undefined) && this.csharpPromiseAllTaskDeclarations.has(declaration)) {
            // this local is an element of a native Task.WhenAll, so it has to hold the
            // concrete Task<T> its call starts: `.Result` then reads the value without a cast
            const parsedPromise = this.printNode(declaration.initializer, identation).trimStart();
            return this.getIden(identation) + 'var ' + this.printNode(declaration.name) + ' = ' + parsedPromise;
        }

        if ((declaration?.initializer !== undefined) && (declaration.name?.kind === SyntaxKind.Identifier)
            && this.csharpPromiseAllTypedAwaits.has(this.csharpPromiseAllKey(declaration.initializer))) {
            // the awaited result prints `new List<object>(await Task.WhenAll (...))`, a List<object>
            return this.getIden(identation) + 'List<object> ' + this.printNode(declaration.name) + ' = ' + this.printNode(declaration.initializer, identation).trimStart();
        }

        if ((declaration?.initializer !== undefined) && (declaration.name?.kind === SyntaxKind.Identifier)) {
            // a promise list / task local the typed Task.WhenAll plan reads is declared with the Task<T> it holds
            const listType = this.csharpPromiseAllTypedLists.get(this.csharpPromiseAllKey(declaration));
            const localType = this.csharpPromiseAllTypedLocals.get(this.csharpPromiseAllKey(declaration));
            if ((listType !== undefined) || (localType !== undefined)) {
                const taskDeclared = (listType !== undefined) ? `List<Task<${listType}>>` : `Task<${localType}>`;
                return this.getIden(identation) + taskDeclared + ' ' + this.printNode(declaration.name) + ' = ' + this.printNode(declaration.initializer, identation).trimStart();
            }
        }

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
            const tempCast = (tempType && this.csharpDestructuringTempNeedsCast(declaration.initializer, tempExpression)) ? `(${tempType})` : '';
            const tempDeclaration = tempType ? `${tempType} ${syntheticName} = ${tempCast}${tempExpression}` : `var ${syntheticName} = ${tempExpression}`;

            let arrayBindingStatement =  `${this.getIden(identation)}${tempDeclaration};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                const slotDeclaration = ((index === 0) && this.csharpBoolSlotBinding(arrayBindingPatternElements[0])) ? 'bool ' : 'var ';
                const slotCast = (slotDeclaration === 'bool ') ? '(bool)' : '';
                const statement = this.getIden(identation) + `${slotDeclaration}${e} = ${slotCast}` + (tempType ? `${syntheticName}[${index}]` : `((IList<object>) ${syntheticName})[${index}]`);
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

        // handle the let id: Str; case (default undefined initialization)
        if (!declaration.initializer) {
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
        const localType = isNew ? 'var' : this.getCSharpLocalType(declaration);
        const declaredType = (localType === this.VAR_TOKEN && node.declarations.length === 1)
            ? (this.csharpOmitMemberLocalType(declaration) ?? this.csharpMemberAliasLocalType(declaration) ?? localType) : localType;
        if (!isNew && declaredType === this.VAR_TOKEN && node.declarations.length === 1) {
            const rowType = this.csharpElementRowLocalType(declaration);
            if (rowType !== undefined) {
                this.csharpTypedLocals.set(declaration, rowType);
                return this.getIden(identation) + rowType + " " + this.printNode(declaration.name) + " = ((" + rowType + ")" + parsedValue + ")";
            }
        }
        // remember the concrete types this printer declared itself: the printed prefix is
        // final (a host wrapper only rewrites untyped `object <name> = ` declarations), so
        // the local's static type is known at every later read
        // an inferred collection return may be null: its local keeps the null-safe reads (`x?.Count ?? 0`)
        if (!isNew && node.declarations.length === 1 && this.csharpTypeIsNative(declaredType) && !this.csharpLocalHoldsInferredCollection(declaration)) {
            this.csharpTypedLocals.set(declaration, declaredType);
        }
        return this.getIden(identation) + declaredType + " " + this.printNode(declaration.name) + " = " + parsedValue;
    }

    // `const x = this.omit (this.<member>, keys)` on a hand-written member DECLARED a string-keyed
    // object dictionary (Exchange.Options.cs). Both dict-receiver overloads of Exchange.Functions.cs hand back a
    // fresh Dictionary<string, object> and an `object` receiver is the only one that may pass a list through, so
    // the call's own C# type is the dictionary. A const local is never rewritten, so the declaration may name it
    // and the write back into the member (`this.urls = x`) binds without a conversion.
    csharpOmitMemberLocalType(declaration): string | undefined {
        if (declaration?.name?.kind !== SyntaxKind.Identifier || ((declaration.parent?.flags & NodeFlags.Const) === 0)) {
            return undefined;
        }
        const call = this.csharpUnwrapAssertion(declaration.initializer);
        if (call?.kind !== SyntaxKind.CallExpression || call.arguments?.length !== 2 || !isPropertyAccessExpression(call.expression)
            || call.expression.expression?.kind !== SyntaxKind.ThisKeyword || call.expression.name?.text !== 'omit') {
            return undefined;
        }
        const member = this.csharpMemberReceiver(this.csharpUnwrapAssertion(call.arguments[0]));
        return (member !== undefined && member.kind === 'dict' && member.declared) ? 'Dictionary<string, object>' : undefined;
    }

    // `const x = this.<member>` over a member DECLARED a string-keyed dictionary (Exchange.Options.cs): the const
    // local is never rewritten, so its declaration names the member's own type and every later read is native.
    csharpMemberAliasLocalType(declaration): string | undefined {
        if (declaration?.name?.kind !== SyntaxKind.Identifier || ((declaration.parent?.flags & NodeFlags.Const) === 0)) {
            return undefined;
        }
        const init = this.csharpUnwrapAssertion(declaration.initializer);
        if (!isPropertyAccessExpression(init) || init.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const member = this.csharpMemberReceiver(init);
        return (member !== undefined && member.kind === 'dict' && member.declared && member.type === 'IDictionary<string, object>') ? member.type : undefined;
    }

    // `const row = list[i]` (non-string key): when every use of the local in its function reads the
    // box as a string-keyed dictionary, the box IS a dictionary and the declaration may name it.
    csharpElementRowLocalType(declaration): string | undefined {
        if (declaration.name?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        let init = declaration.initializer;
        while (init?.kind === SyntaxKind.ParenthesizedExpression) {
            init = init.expression;
        }
        if (init?.kind !== SyntaxKind.ElementAccessExpression || this.csharpElementRowKeyIsString(init.argumentExpression)) {
            return undefined;
        }
        // `this.<member>[k]` reads (ws caches such as this.orderbooks) belong to the host's member-cache
        // families, which name their own box; only a local list receiver is this rule's
        if (init.expression?.kind === SyntaxKind.PropertyAccessExpression) {
            return undefined;
        }
        const name = declaration.name.text;
        if (CSHARP_MARKET_RECEIVER_NAMES.indexOf(name) >= 0) {
            return undefined; // the market-row read arms own these names
        }
        const fileName = (declaration.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
        const sourceOk = (typeof this.csharpElementRowLocalSource === 'function')
            ? this.csharpElementRowLocalSource(fileName)
            : (fileName.includes('ts/src/') && !fileName.includes('ts/src/test/') && !fileName.includes('examples/'));
        if (!sourceOk) {
            return undefined;
        }
        const scope = this.csharpEnclosingFunction(declaration);
        const type = 'IDictionary<string, object>';
        if (scope === undefined || this.csharpTypeNameIsShadowed(scope, type)) {
            return undefined;
        }
        let bindings = 0;
        let reads = 0;
        let bad = false;
        const visit = (n: any) => {
            if (bad || n === undefined) {
                return;
            }
            if (n !== scope && CSHARP_FUNCTION_SCOPES.indexOf(n.kind) >= 0) {
                return;
            }
            if ((n.kind === SyntaxKind.Parameter || n.kind === SyntaxKind.VariableDeclaration) && this.csharpBindingNames(n.name).indexOf(name) >= 0) {
                bindings += 1;
            }
            const memberName = n.parent?.kind === SyntaxKind.PropertyAccessExpression && n.parent.name === n;
            if (n !== declaration.name && !memberName && n.kind === SyntaxKind.Identifier && n.text === name) {
                if (!this.csharpElementRowUseIsDictionaryShaped(n)) {
                    bad = true;
                    return;
                }
                const parent = n.parent;
                if (parent?.kind === SyntaxKind.ElementAccessExpression && parent.expression === n && this.csharpElementRowKeyIsString(parent.argumentExpression)) {
                    reads += 1;
                }
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return (bad || bindings !== 1 || reads === 0) ? undefined : type;
    }

    csharpElementRowKeyIsString(node): boolean {
        return node !== undefined && (node.kind === SyntaxKind.StringLiteral || node.kind === SyntaxKind.NoSubstitutionTemplateLiteral);
    }

    csharpBindingNames(name): string[] {
        const names: string[] = [];
        const visit = (n: any) => {
            if (n?.kind === SyntaxKind.Identifier) {
                names.push(n.text);
            } else if (n?.kind === SyntaxKind.ObjectBindingPattern || n?.kind === SyntaxKind.ArrayBindingPattern) {
                for (const element of n.elements) {
                    visit(element?.name);
                }
            }
        };
        visit(name);
        return names;
    }

    csharpElementRowUseIsDictionaryShaped(use): boolean {
        const parent = use.parent;
        if (parent === undefined) {
            return false;
        }
        if (parent.kind === SyntaxKind.ElementAccessExpression && parent.expression === use) {
            return this.csharpElementRowKeyIsString(parent.argumentExpression);
        }
        if (parent.kind === SyntaxKind.CallExpression && parent.arguments?.[0] === use) {
            const callee = parent.expression;
            return callee?.kind === SyntaxKind.PropertyAccessExpression && callee.expression?.kind === SyntaxKind.ThisKeyword
                && CSHARP_ELEMENT_ROW_READERS.indexOf(callee.name?.text) >= 0;
        }
        if (parent.kind === SyntaxKind.BinaryExpression) {
            const op = parent.operatorToken?.kind;
            return op === SyntaxKind.EqualsEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken
                || op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
        }
        return false;
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

    printArrayLiteralExpression(node) {
        const taskType = this.csharpPromiseAllTypedLists.get(this.csharpPromiseAllKey(node));
        const printed = this.csharpPromiseAllPrintList(node);
        // same list text, the element type names the tasks it holds
        return (taskType === undefined) ? printed : 'new List<Task<' + taskType + '>>' + printed.substring('new List<object>'.length);
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
        const baseView = (node?.arguments?.length === 1) ? this.csharpBaseDictionaryView(node.arguments[0]) : undefined;
        if (baseView !== undefined) {
            return `new List<object>(${baseView}.Keys)`; // the typed view of a hand-written base dictionary
        }
        // an `object` member with a declared dictionary view: the view is the box the cast would name
        const view = (node?.arguments?.length === 1) ? this.csharpMemberReceiver(node.arguments[0]) : undefined;
        if (view !== undefined && view.kind === 'dict' && view.text.startsWith('this.') && view.text !== parsedArg) {
            return `new List<object>(${view.text}.Keys)`;
        }
        return `new List<object>(((IDictionary<string,object>)${parsedArg}).Keys)`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        if ((node?.arguments?.length === 1) && this.csharpReceiverIsDeclaredDictionary(node.arguments[0])) {
            return `new List<object>(${parsedArg}.Values)`;
        }
        return `new List<object>(((IDictionary<string,object>)${parsedArg}).Values)`;
    }

    printArrayPushCall(node, identation, name = undefined, parsedArg = undefined) {
        if (this.csharpPromiseAllTypedListRead(node?.expression?.expression) !== undefined) {
            return `${name}.Add(${parsedArg})`; // the list is a List<Task<T>>, Add binds directly
        }
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

    printLengthProperty(node, identation, name = undefined) {
        const leftSide = this.printNode(node.expression, 0);
        const type = (this.getChecker() as Checker).getTypeAtLocation(node.expression); // eslint-disable-line
        this.warnIfAnyType(node, type.flags, leftSide, "length");
        return this.isStringType(type.flags) ? `${this.csharpStringMethodReceiver(node, leftSide)}.Length` : (this.csharpNativeLengthExpression(node.expression) ?? `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`);
    }

    // ==== element access, call printing and shared typed-read helpers ====

    // The C# declared type of an expression's receiver (`request` in `request["k"] = v`), as
    // the consumer's classifier knows it — ccxt's build/csharp-local-types.js overrides this
    // with its scope-aware local map. Undefined on an unpatched printer
    csharpDeclaredReceiverType(node): string | undefined {
        return undefined; // stub to override
    }

    // A receiver whose declared C# type the consumer's classifier names as a concrete dictionary:
    // the `((IDictionary<string,object>)x)` cast around element access is an identity conversion.
    // Gated entirely on the consumer's hook, so an object receiver and untyped runs keep the cast.
    csharpReceiverIsDeclaredDictionary(expression): boolean {
        const member = this.csharpMemberReceiver(expression);
        if (member !== undefined && member.kind === 'dict' && member.declared) {
            return true; // the member's own C# declaration is the dictionary: the interface cast is an identity
        }
        if (isPropertyAccessExpression(expression) && expression.expression.kind === SyntaxKind.ThisKeyword
            && CSHARP_DECLARED_DICT_FIELDS.indexOf(expression.name?.text as string) >= 0) {
            return true; // a hand-written member declared IDictionary<string, object>
        }
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
        if (!this.csharpReceiverIsDeclaredDictionary(expression)) {
            return undefined;
        }
        // the interface cast also carries the string-key proof; only a string key (or a union
        // holding one, the shape the index-signature key type reports) may stay cast-less
        const keyType = this.getChecker().getTypeAtLocation(argumentExpression);
        const members = (keyType.flags === TypeFlags.Union) ? ((keyType as any).getTypes() ?? [keyType]) : [keyType];
        const stringKey = (keyType.flags === TypeFlags.Any) || members.some((t) => this.isStringType(t.flags));
        if (!stringKey) {
            return undefined;
        }
        const cast = isStringLiteralLikeNode(argumentExpression) ? '' : '(string)';
        return this.printNode(expression, 0) + '[' + cast + this.printNode(argumentExpression, 0) + ']';
    }

    printElementAccessExpressionExceptionIfAny(node) {
        // C# never takes the base class's exception path for element access
        return undefined;
    }

    // reads print getValue(recv, key), which yields null for a missing key; a C# indexer
    // throws instead, so the native form is only emitted where the source guarantees the key
    // is there: a dominating `key in recv` guard, or a receiver local built by a literal that
    // declares the key, or a receiver the declared table proves is a dictionary (the native
    // form then keeps the helper's null-for-a-missing-key result). every other read keeps the
    // helper.
    // the single element-access override, gates strongest (declaration-type) proof first:
    // typed dict WRITE (csharpDictionaryElementWriteTarget), typed dict READ twin
    // (printTypedDictElementAccessIfAny), list-cast (csharpElementAccessReceiverIsList),
    // then the native read form proven from the printed source (#82, csharpNativeElementAccess,
    // see the note above). Every other read keeps the helper; a site no gate names keeps the
    // base printing.
    printElementAccessExpression(node, identation) {
        const declaredMember = this.csharpDeclaredDictMemberElementRead(node); // declared dictionary member read
        if (declaredMember !== undefined) {
            return declaredMember;
        }
        const viewRead = this.csharpMemberViewRead(node);
        if (viewRead !== undefined) {
            return viewRead;
        }
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
            const isUnion = ((type.flags & TypeFlags.Union) !== 0) && Array.isArray((type as any).getTypes());
            // the base printer's own key dispatch, plus the union spelling the worker
            // handles: a string (or type-less) key is a dictionary element, never a list
            // index, and keeps the IDictionary cast
            const isStringOrUnknownKey = this.isStringType(type.flags)
                || (type.flags === TypeFlags.Any)
                || (isUnion && (type as any).getTypes().some((t) => this.isStringType(t.flags)));
            if (!isStringOrUnknownKey) {
                return `${this.printNode(node.expression, 0)}[Convert.ToInt32(${this.printNode(node.argumentExpression, 0)})]`;
            }
        }
        if (this.csharpIsPlainIndexWrite(node) && (this.csharpDeclaredLocalType(node.expression) === 'ccxt.pro.ArrayCache')) {
            const type = this.getChecker().getTypeAtLocation(node.argumentExpression);
            if ((type.flags & (TypeFlags.NumberLike)) !== 0 && (type.flags & TypeFlags.Union) === 0) {
                // an ArrayCache IS an IList<object>: its index write goes through that interface
                return `((IList<object>)${this.printNode(node.expression, 0)})[Convert.ToInt32(${this.printNode(node.argumentExpression, 0)})]`;
            }
        }
        const listRead = this.csharpListIndexRead(node);
        if (listRead !== undefined) {
            return listRead;
        }
        const keyRead = (this.ELEMENT_ACCESS_WRAPPER_OPEN && !this.printElementAccessExpressionExceptionIfAny(node))
            ? this.csharpIdentifierKeyRead(node.expression, node.argumentExpression) : undefined;
        if (keyRead !== undefined) {
            return keyRead; // identifier-key read on a declared collection
        }
        const baseField = this.csharpBaseFieldElementRead(node); // after every earlier typed rule
        if (baseField !== undefined) {
            return baseField;
        }
        const baseViewRead = (this.ELEMENT_ACCESS_WRAPPER_OPEN && keyRead === undefined && this.printElementAccessExpressionExceptionIfAny(node) === undefined)
            ? this.csharpBaseDictionaryViewRead(node.expression, node.argumentExpression) : undefined;
        if (baseViewRead !== undefined) {
            return baseViewRead;
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
        const sectionRead = this.csharpMemberSectionRead(expression, argumentExpression);
        if (sectionRead !== undefined) {
            return sectionRead;
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
                ?? this.csharpDeclaredStringIndexRead(node, expression, argumentExpression, isNumberKey)
                ?? this.csharpProvenDictionaryRead(node, expression, argumentExpression, isStringKey)
                ?? this.csharpMissingKeyFieldRead(expression, argumentExpression, isStringKey)
                ?? this.csharpBaseDictionaryViewRead(expression, argumentExpression);
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
    csharpIsMarketRowKeyRead(expression, argumentExpression): boolean {
        return isIdentifier(expression) && isStringLiteralLikeNode(argumentExpression)
            && CSHARP_MARKET_RECEIVER_NAMES.indexOf(expression.text as string) >= 0;
    }

    csharpNativeDeclaredDictionaryRead(expression, argumentExpression): string | undefined {
        if (!this.csharpIsMarketRowKeyRead(expression, argumentExpression)) {
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
        const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        if (declaration === undefined) {
            return undefined;
        }
        const recorded = this.csharpDeclaredLocalTypeResolver(declaration);
        return (typeof recorded === 'string') ? recorded : undefined;
    }

    // the same read for a receiver only the build layer's declared-local resolver names (a
    // parameter the build layer retyped): its box may still be null, so the read carries the helper's
    // own `value2 == null -> null` branch as a null test
    csharpDeclaredLocalResolverRowRead(expression, argumentExpression): string | undefined {
        if (!this.csharpIsMarketRowKeyRead(expression, argumentExpression)) {
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
        if (!this.csharpDeclaredReceiverReadable(node, expression)) {
            return undefined;
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

    // A literal-index read on a local whose emitted C# declaration is a `string` / `string?` (the type
    // csharpStringReceiverType names, build-layer retypes included): the string indexer throws on a null
    // receiver and past the end where GetValue answers null, so the native form carries both tests and
    // re-boxes the char as the helper's `.ToString ()` string. Only an Identifier qualifies (read up to
    // three times) and only a plain read (never a write target, delete or ++/--).
    csharpDeclaredStringIndexRead(node, expression, argumentExpression, isNumberKey): string | undefined {
        if (!isNumberKey || !isIdentifier(expression) || !this.csharpIsPlainRead(node)) {
            return undefined;
        }
        const declared = this.csharpStringReceiverType(expression);
        if (declared !== 'string' && declared !== 'string?') {
            return undefined;
        }
        const index = Number((argumentExpression as any).text);
        if (!Number.isInteger(index) || (index < 0)) {
            return undefined; // a negative or fractional literal never binds the indexer the helper reads
        }
        const receiver = this.printNode(expression, 0);
        return `(${receiver} != null && ${index} < ${receiver}.Length ? ${receiver}[${index}].ToString () : null)`;
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
        const declaration = this.getChecker().getSymbolAtLocation(expression)?.valueDeclaration?.resolve();
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
        if (func === undefined) {
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
        return guards.some((guard) => this.csharpGuardAdmitsRead(guard, node));
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
        const declarations: any = (symbol?.declarations ?? []).map((d) => d.resolve());
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
                rewritten = (isBinaryExpression(parent) && parent.left === n)
                    || ((isPrefixUnaryExpression(parent) || isPostfixUnaryExpression(parent)) && parent.operand === n)
                    || isDeleteExpression(parent);
            }
            n.forEachChild(walk);
        };
        walk(func);
        return rewritten;
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

    // `((List<object>)x)[i] = v` needs no cast when the PRINTED declaration is
    // `List<object>` (identity conversion; not IList<object>, a checked downcast). Type comes via the
    // `csharpLocalTypeOf` hook; `x[i] += v` and reads stay on the base path (third override layer).
    csharpElementAccessReceiverIsList(node) {
        return this.csharpIndexWriteReceiverType(node) === 'List<object>';
    }

    // the printed declaration type of the identifier receiver of a plain `x[i] = v`, else undefined
    csharpIndexWriteReceiverType(node): string | undefined {
        if (!this.csharpIsPlainIndexWrite(node)) {
            return undefined;
        }
        const localTypeOf = (this as any).csharpLocalTypeOf;
        return (typeof localTypeOf === 'function') ? localTypeOf.call(this, node.expression) : undefined;
    }

    // `x[i] = v` with an identifier receiver
    csharpIsPlainIndexWrite(node): boolean {
        const parent = node?.parent;
        return (node?.kind === SyntaxKind.ElementAccessExpression) && (node.expression?.kind === SyntaxKind.Identifier)
            && (parent?.kind === SyntaxKind.BinaryExpression) && (parent.operatorToken?.kind === SyntaxKind.EqualsToken) && (parent.left === node);
    }

    // an index WRITE (`x["k"] = v`) needs no `((IDictionary<string,object>)x)` cast when the
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
        if (this.csharpIsSetOrAddTarget(node)) {
            return undefined; // a write prints the dictionary element assignment, not this read
        }
        return 'GetValue(' + this.printNode(expression, 0) + ', ' + this.printNode(argumentExpression, 0) + ')';
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

        // handle dynamic calls, this[method](A) or exchange[b] (c) using reflection
        if (node.expression.kind === SyntaxKind.ElementAccessExpression) {
            return this.printDynamicCall(node, identation);
        }

        return undefined;
    }

    // `parseInt(...)` / `parseFloat(...)` print the runtime helper call; the folds below replace
    // it with the exact box the helper returns, everything else falls through to the printer
    printCallExpression(node, identation) {
        const declaredMember = this.csharpDeclaredDictMemberCall(node); // declared dictionary member call
        if (declaredMember !== undefined) {
            return declaredMember;
        }
        const nativeParse = this.csharpNativeParseCall(node);
        if (nativeParse !== undefined) {
            return nativeParse;
        }
        // the source spelling `this.parseJson (<string call>)` is the same wrapper as `JSON.parse`
        const callee = node?.expression;
        if ((callee?.kind === SyntaxKind.PropertyAccessExpression) && (callee.expression?.kind === SyntaxKind.ThisKeyword)
            && (callee.name?.text === 'parseJson') && (node.arguments?.length === 1)
            && this.csharpCallReturnsString(node.arguments[0]) && this.csharpCalleeResolves(node)) {
            return `JsonHelper.Deserialize((string)${this.printNode(node.arguments[0], 0).trim()})`;
        }
        const printed = super.printCallExpression(node, identation);
        const pascal = this.csharpInt64TaskCallName(node);
        if (pascal !== undefined) {
            const camel = `this.${callee.name.text}(`;
            const at = printed.indexOf(camel);
            if (at !== -1 && printed.slice(0, at).trim() === '') {
                return printed.slice(0, at) + `this.${pascal}(` + printed.slice(at + camel.length);
            }
        }
        return printed;
    }

    // `this.<name> (...)` resolving to an async method whose checker return type is `Promise<int>` /
    // `Promise<Int>`: its C# signature is the typed core `Task<Int64> <Name>(...)` (the declaration is
    // renamed to the PascalCase public name), so the awaited value is a bare Int64 and the call binds the
    // PascalCase method. Answers that PascalCase name, or undefined for every other call.
    csharpInt64TaskCallName(node): string | undefined {
        const callee = node?.expression;
        if (!this.csharpPascalInt64TaskCalls || (callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.expression?.kind !== SyntaxKind.ThisKeyword)
            || (node.parent?.kind !== SyntaxKind.AwaitExpression)) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        try {
            const signature = checker.getResolvedSignature(node);
            const declaration = signature?.declaration?.resolve();
            if (!isMethodDeclaration(declaration) || !this.isAsyncFunction(declaration) || (declaration.name as any)?.text !== callee.name.text) {
                return undefined;
            }
            const returned = checker.getReturnTypeOfSignature(signature);
            if (this.getTypeFromRawType(returned) !== this.PROMISE_TYPE_KEYWORD) {
                return undefined;
            }
            const inner = checker.getTypeArguments(returned)?.[0];
            // `type int = number` keeps no alias symbol on the checker type: read the annotation's name
            const annotated = (declaration.type as any)?.typeArguments?.[0];
            const alias = (annotated?.kind === SyntaxKind.TypeReference) ? annotated.typeName?.text : inner?.getAliasSymbol?.()?.escapedName;
            const numeric = (inner !== undefined) && (((inner.flags & TypeFlags.Number) !== 0)
                || (((inner.flags & TypeFlags.Union) !== 0) && (inner as UnionType).getTypes().some((t) => (t.flags & TypeFlags.Number) !== 0)));
            if (!numeric || ((alias !== 'Int') && (alias !== 'int'))) {
                return undefined;
            }
        } catch (e) {
            return undefined;
        }
        const name = callee.name.text as string;
        return name.charAt(0).toUpperCase() + name.slice(1);
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
        return type?.getSymbol()?.escapedName === 'Array';
    }

    // a union of dictionary members and nullish ones (what a `Dict | undefined` signature
    // widens to): a C# reference that happens to be null is a nullish arm, not a scalar one.
    // Any other member (arrays, classes, scalars) keeps the helper
    csharpNullableDictionaryType(type): boolean {
        if (type === undefined || ((type.flags & TypeFlags.Union) === 0)) {
            return false;
        }
        let dictionaries = 0;
        for (const member of (type as UnionType).getTypes() ?? []) {
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
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        const initializer = (declaration?.kind === SyntaxKind.Parameter) ? (declaration as ParameterDeclaration).initializer : undefined;
        return initializer?.kind === SyntaxKind.ObjectLiteralExpression;
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
            const member = this.csharpMemberReceiver(obj);
            if (member !== undefined && member.nullTest !== undefined) {
                return { text: receiver.text, nullTest: member.nullTest };
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
        // printer cannot tell), and only while nothing has rewritten it
        if (!isIdentifier(obj) || (this.csharpTypedLocalType(obj) !== undefined)) {
            return undefined;
        }
        const name = obj.text as string;
        if (this.csharpNameWrittenBefore(obj, name)) {
            return undefined;
        }
        const declaration = checker.getSymbolAtLocation(obj)?.valueDeclaration?.resolve();
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
        if ((!this.csharpIsDictionaryType(type) && !nullable) || !this.csharpIsAnyValuedDictionaryType(type)) {
            return undefined;
        }
        return { text, nullTest: printed };
    }

    // `key in obj` -> `obj.ContainsKey(key)`, only when both the printed key and the printed
    // operand are already C# string / dictionary values. Every other shape keeps the inOp helper
    csharpNativeInExpression(key, obj): string | undefined {
        const baseFieldIn = this.csharpBaseFieldInExpression(key, obj); // a declared base field keeps the helper's key null test
        if (baseFieldIn !== undefined) {
            return baseFieldIn;
        }
        const viewIn = this.csharpBaseDictionaryViewIn(key, obj);
        if (viewIn !== undefined) {
            return viewIn; // the typed view of a hand-written base dictionary carries the helper's null tests
        }
        const printedKey = this.csharpNativeStringKey(key);
        if (printedKey === undefined) {
            return this.csharpDeclaredDictInExpression(key, obj) ?? this.csharpMemberInExpression(key, obj);
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

    // `key in this.<member>` / `key in client.<member>` where the member's declared C# type is a string-keyed
    // dictionary that may hold null (an interface-typed or initializer-less declaration): the helper's null
    // receiver branch is the `!= null` test, and its non-string key branch (false) is the type test. The key
    // is an identifier whose printed declaration is a C# string (nullable: tested) or `object` (type-tested),
    // or a string literal; every other key shape keeps the helper
    csharpMemberInExpression(key, obj): string | undefined {
        const member = this.csharpMemberReceiver(obj);
        if (member === undefined || member.kind !== 'dict' || member.nullTest === undefined) {
            return undefined;
        }
        if (!isIdentifier(key)) {
            return undefined;
        }
        const keyKind = this.csharpMemberKeyKind(key);
        const printedKey = this.printNode(key, 0);
        if (keyKind === 'string' || keyKind === 'string?') {
            return `(${member.nullTest} != null && ${printedKey} != null && ${member.text}.ContainsKey(${printedKey}))`;
        }
        if (keyKind === 'object' || keyKind === 'param') {
            const bound = this.csharpMemberKeyVariable(key);
            return `(${member.nullTest} != null && ${printedKey} is string ${bound} && ${member.text}.ContainsKey(${bound}))`;
        }
        return undefined;
    }

    // how an identifier key reaches a dictionary member: 'string' when its printed C# declaration is a
    // string; 'object' when the declaration is `object` (inOp answers false for a non-string box, GetValue
    // casts the key to string); 'param' for a default-less parameter the checker proves a string (its C#
    // type is the signature's `object` or `string`, and both a `key is string k` test and a `(string)key`
    // cast are valid for both). A local not declared yet keeps the helper: the build layer retypes it
    // after printing, and a hard cast here would block that retype
    csharpMemberKeyKind(key): 'string' | 'string?' | 'object' | 'param' | undefined {
        const keyType = this.csharpDeclaredKeyType(key) ?? this.csharpDeclaredLocalResolverType(key);
        if (keyType === 'string' || keyType === 'string?') {
            return keyType; // both are tested: a `string` local may still hold null at run time, and ContainsKey(null) throws
        }
        if (keyType === 'object') {
            return 'object';
        }
        if (keyType !== undefined) {
            return undefined;
        }
        const binding: any = this.csharpReceiverBinding(key);
        if (binding?.kind !== SyntaxKind.Parameter || binding.initializer !== undefined) {
            return undefined;
        }
        const type = this.getChecker().getTypeAtLocation(key);
        const members = ((type.flags & TypeFlags.Union) !== 0) ? ((type as UnionType).getTypes() ?? []) : [ type ];
        let strings = 0;
        for (const member of members) {
            if ((member.flags & (TypeFlags.Undefined | TypeFlags.Null)) !== 0) {
                continue;
            }
            if (!this.isStringType(member.flags)) {
                return undefined;
            }
            strings++;
        }
        return strings > 0 ? 'param' : undefined;
    }

    // the pattern variable that binds an `object` key proven a string by its type test: the file's next
    // `inOpKey<N>` (the numbering the host's own membership rules continue from)
    csharpMemberKeyVariable(key): string {
        const file: any = key.getSourceFile?.();
        const next = (this.csharpMemberKeyCounters.get(file) ?? 0);
        this.csharpMemberKeyCounters.set(file, next + 1);
        return `inOpKey${next}`;
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
            const members = ((type.flags & TypeFlags.Union) !== 0) ? ((type as any).getTypes() ?? []) : [ type ];
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

    // `null` and the `undefined` identifier both print as the C# null literal
    csharpOperandIsNullLiteral(node): boolean {
        return (node?.kind === SyntaxKind.NullKeyword)
            || ((node?.kind === SyntaxKind.Identifier) && (node.text === 'undefined'));
    }

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
            // `this.omit(this.<member declared a dictionary>, key)` binds a dictionary-receiver overload of the
            // hand-written base, which answers a fresh Dictionary<string, object> on every path
            if ((methodName === 'omit') && (initializer.arguments?.length === 2) && this.csharpBaseFieldIsDeclaredDictionary(initializer.arguments[0])) {
                return 'Dictionary<string, object>';
            }
            return CSHARP_THIS_RETURN_TYPES[methodName] ?? this.csharpInferredCallReturnType(initializer);
        }
        if (target?.kind === SyntaxKind.Identifier) {
            return CSHARP_STATIC_RETURN_TYPES[(target.text as string) + '.' + methodName] ?? CSHARP_METHOD_RETURN_TYPES[methodName];
        }
        return CSHARP_METHOD_RETURN_TYPES[methodName];
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
        case SyntaxKind.PropertyAccessExpression: {
            const copied = (initializer.expression?.kind === SyntaxKind.ThisKeyword) && CSHARP_DECLARED_DICT_COPY_FIELDS.indexOf(initializer.name?.text as string) >= 0
                ? this.csharpMemberReceiver(initializer) : undefined;
            if (copied !== undefined && copied.kind === 'dict' && copied.declared && copied.type === 'IDictionary<string, object>') {
                return copied.type;
            }
            break;
        }
        case SyntaxKind.ConditionalExpression: {
            // `cond ? 'a' : 'b'` prints the same C# conditional, whose static type is the type both
            // arms share: a non-null string when neither arm can answer null
            const arms = [ initializer.whenTrue, initializer.whenFalse ];
            return arms.every((arm) => this.csharpNonNullStringOperandType(arm) === 'string') ? 'string' : undefined;
        }
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
            if (op === SyntaxKind.PlusToken) {
                return this.csharpPlusChainNonNullStringType(initializer);
            }
            return undefined;
        }
        }
        return this.csharpCallReturnType(initializer) ?? (this.csharpBoolCallTyped(initializer) ? 'bool' : undefined);
    }

    // the class `cls` is `owner` or inherits from it: an inherited member prints the one C# signature
    // the owner declares, so a method declared once tree-wide answers the same type to every subclass
    csharpClassIsOrExtends(cls, owner): boolean {
        const wanted = this.csharpNodePositionKey(owner);
        let current = cls;
        for (let depth = 0; (current !== undefined) && (depth < 16); depth++) {
            if (this.csharpNodePositionKey(current) === wanted) {
                return true;
            }
            const parent = getAllSuperTypeNodes(current)[0];
            current = (parent === undefined) ? undefined : this.getChecker().getTypeAtLocation(parent)?.getSymbol()?.valueDeclaration?.resolve();
        }
        return false;
    }

    // arrays / tuples / numeric-index types are lists, structure and Dict types dictionaries; else undefined
    csharpCollectionBoxOfType(checker, type): string | undefined {
        if (type === undefined || (type.flags & (TypeFlags.Any | TypeFlags.Unknown | TypeFlags.Never)) !== 0) {
            return undefined;
        }
        if (type.isUnionType()) {
            const arms = type.getTypes().filter((arm) => (arm.flags & (TypeFlags.Undefined | TypeFlags.Null)) === 0);
            const boxes = new Set<string | undefined>(arms.map((arm) => this.csharpCollectionBoxOfType(checker, arm)));
            return (arms.length > 0 && boxes.size === 1) ? [ ...boxes ][0] : undefined;
        }
        if ((type.flags & TypeFlags.Object) === 0) {
            return undefined;
        }
        if (checker.isArrayType(type) || checker.isTupleType(type) || type.getNumberIndexType?.() !== undefined) {
            return 'List<object>';
        }
        return 'IDictionary<string, object>';
    }

    // the printed return value already has the static type `box`: array literal, `box` local, `box` call
    csharpReturnValueProvesBox(expression, box: string): boolean {
        let node = expression;
        while ((node.kind === SyntaxKind.ParenthesizedExpression) || (node.kind === SyntaxKind.NonNullExpression)
            || ((node.kind === SyntaxKind.AsExpression) && (node.type.kind === SyntaxKind.TypeReference
                || (node.type.kind === SyntaxKind.ArrayType && ![ SyntaxKind.AnyKeyword, SyntaxKind.StringKeyword ].includes(node.type.elementType.kind))))) {
            node = node.expression;
        }
        switch (node.kind) {
        case SyntaxKind.ArrayLiteralExpression:
            return box === 'List<object>';
        case SyntaxKind.ConditionalExpression:
            return this.csharpReturnValueProvesBox(node.whenTrue, box) && this.csharpReturnValueProvesBox(node.whenFalse, box);
        case SyntaxKind.Identifier:
            return (this.csharpResolvedReadType(node) ?? this.csharpDeclaredLocalValueType(node)) === box;
        case SyntaxKind.CallExpression:
            return this.csharpTypeOfInitializer(node) === box;
        }
        return false;
    }

    csharpIsInferredCollectionCall(value): boolean {
        const call = this.csharpUnwrapAssertion(value);
        return (call?.kind === SyntaxKind.CallExpression) && (call.expression?.kind === SyntaxKind.PropertyAccessExpression)
            && (call.expression.expression?.kind === SyntaxKind.ThisKeyword) && (this.csharpInferredCallReturnType(call) !== undefined);
    }

    // the local is initialised or reassigned from an inferred collection call
    csharpLocalHoldsInferredCollection(declaration): boolean {
        if (this.csharpUniqueMethods === undefined) {
            return false;
        }
        return this.csharpIsInferredCollectionCall(declaration.initializer) || this.hasNodeWhere(this.csharpEnclosingFunction(declaration), (n: any) =>
            (n.kind === SyntaxKind.BinaryExpression) && (n.operatorToken.kind === SyntaxKind.EqualsToken) && (n.left.kind === SyntaxKind.Identifier)
            && (n.left.text === declaration.name?.text) && this.csharpIsInferredCollectionCall(n.right));
    }

    // `this.<name>(...)` binding a csharpCollectionReturnType method of this class or an ancestor
    csharpInferredCallReturnType(call): string | undefined {
        const name = call.expression.name?.text;
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined || this.csharpUniqueMethods?.has(name) !== true) {
            return undefined;
        }
        let declaration;
        try {
            declaration = checker.getResolvedSignature(call)?.declaration?.resolve();
        } catch (e) {
            return undefined;
        }
        const owner = isMethodDeclaration(declaration) ? findAncestor(declaration, isClassLikeDeclaration) : undefined;
        if (owner === undefined || declaration.name?.text !== name || !this.csharpClassIsOrExtends(findAncestor(call, isClassLikeDeclaration), owner)) {
            return undefined;
        }
        return this.csharpCollectionReturnType(declaration);
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
        return !this.hasNodeWhere(scope, (n: any) => {
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
                    if (safeAccessor && (op !== SyntaxKind.ExclamationToken) && (csharpType !== 'int') && (csharpType !== 'Int64') && (csharpType !== 'double')
                        && !this.csharpGuardedNullableNegation(parent, csharpType)) {
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
                && ((csharpType !== 'bool') || (this.csharpBoolOptionSlotTarget(parent) !== n))) {
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
                    // cast, which only compiles from `object` or a string; `delete obj[x]` prints
                    // `.Remove((string)x)`, the same hard cast
                    if (!this.csharpTypeIsStringType(csharpType) && (this.csharpIsClassThrowArgument(n) || this.csharpIsDeleteKey(n))) {
                        return true;
                    }
                }
                if (parent?.kind === SyntaxKind.BinaryExpression && parent.left === n) {
                    const op = parent.operatorToken.kind;
                    if (op === SyntaxKind.EqualsToken) {
                        // a non-null string local written by its own `+` chain keeps that string
                        // (`add(string, *)` is concatenation and never answers null)
                        const chainIsString = (csharpType === 'string') && (this.csharpPlusChainNonNullStringType(parent.right, declaration) === 'string');
                        if (!chainIsString && !this.csharpWriteKeepsLocalType(parent.right, csharpType)) {
                            return true;
                        }
                    } else if ((op >= SyntaxKind.FirstCompoundAssignment) && (op <= SyntaxKind.LastCompoundAssignment)) {
                        // `x += v` prints `x = add (x, v)`: on a non-null string local that is the
                        // same concatenation; every other type would rebind a boxed `add`
                        if (!((csharpType === 'string') && (op === SyntaxKind.PlusEqualsToken))) {
                            return true;
                        }
                    }
                }
                // a `string?` local as the LEFT operand of `+` prints add(<x>, ...) and the
                // nullable-to-`string` conversion rebinds the overload, so a null left would stop
                // answering null. Only a non-null-proven read with a printed-string right operand
                // (both overloads agree there) may keep the type.
                if (safeAccessor && (csharpType === 'string?') && this.csharpIsLeftPlusOperand(n) && !this.csharpGuardedStringConcatRead(n)) {
                    return true;
                }
            }
            return false;
        });
    }

    // a `((string)x)` wrapper is redundant as soon as the receiver's static C# type is
    // already string: the cast names the box the value is in, it never changes the value

    // `limit: Int = 100` on a method whose `limit` position the build layer narrows to `Int64?`: the body
    // prints a `limit ??= 100;` prologue, so the build layer's post-print pass keeps the parameter in a
    // shadow local (`limitVar`) and types that local `Int64?` when every use is an identity read. This is
    // the same decision made on the AST: every use of the parameter is a null test, an argument of an
    // allowlisted `this.<callee>` call, or an operand of Math.min/max against an integer literal. The
    // build layer's pass accepts the printed form of each of those, so the local is `Int64?` and a
    // null-proven read can unbox with `.Value`. Anything else answers undefined (the shadow stays object).
    csharpShadowedNumericParamType(node): string | undefined {
        if (!isIdentifier(node) || (node.text !== 'limit')) {
            return undefined;
        }
        const declaration: any = this.csharpParameterDeclaration(node);
        if (declaration === undefined) {
            return undefined;
        }
        const cached = this.csharpShadowedParamTypes.get(declaration);
        if (cached !== undefined) {
            return (cached === '') ? undefined : cached;
        }
        const type = this.csharpShadowedNumericParamProof(declaration) ?? '';
        this.csharpShadowedParamTypes.set(declaration, type);
        return (type === '') ? undefined : type;
    }

    csharpShadowedNumericParamProof(declaration): string | undefined {
        const owner: any = declaration.parent;
        const init: any = declaration.initializer;
        if (!isMethodDeclaration(owner) || (owner.body === undefined) || (init?.kind !== SyntaxKind.NumericLiteral) || !/^\d{1,9}$/.test(init.text)) {
            return undefined;
        }
        const position = owner.parameters.indexOf(declaration);
        const ownerName: string = (owner.name as any)?.text;
        const table = Object.prototype.hasOwnProperty.call(this.csharpNumericArgTypes, ownerName) ? this.csharpNumericArgTypes[ownerName] : undefined;
        if ((position < 0) || (table?.[position] !== 'Int64?')) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        let ok = true;
        const visit = (n: any) => {
            if (!ok) {
                return;
            }
            if (isIdentifier(n) && (n.text === declaration.name.text) && (n !== declaration.name)
                && (checker.getSymbolAtLocation(n)?.valueDeclaration?.resolve() === declaration) && !this.csharpShadowedParamUseIsIdentity(n)) {
                ok = false;
                return;
            }
            n.forEachChild(visit);
        };
        visit(owner.body);
        return ok ? 'Int64?' : undefined;
    }

    csharpShadowedParamUseIsIdentity(read): boolean {
        let current: any = read;
        while (current.parent?.kind === SyntaxKind.ParenthesizedExpression) {
            current = current.parent;
        }
        const parent: any = current.parent;
        if (parent?.kind === SyntaxKind.BinaryExpression) {
            const op = parent.operatorToken.kind;
            if (CSHARP_EQUALITY_TOKENS.indexOf(op) < 0) {
                return false;
            }
            // `limit == null)` is the printed shape the shadow pass reads; a null on the left prints another one
            const other: any = parent.right;
            return (parent.left === current) && ((other?.kind === SyntaxKind.NullKeyword) || ((other?.kind === SyntaxKind.Identifier) && ((other as any).text === 'undefined')));
        }
        if (parent?.kind !== SyntaxKind.CallExpression || (parent.arguments?.indexOf(current) ?? -1) < 0) {
            return false;
        }
        const callee: any = parent.expression;
        if (!isPropertyAccessExpression(callee)) {
            return false;
        }
        if ((callee.expression?.kind === SyntaxKind.Identifier) && ((callee.expression as any).text === 'Math') && ((callee.name?.text === 'min') || (callee.name?.text === 'max'))) {
            const other: any = (parent.arguments.length === 2) ? parent.arguments[(parent.arguments[0] === current) ? 1 : 0] : undefined;
            return (other?.kind === SyntaxKind.NumericLiteral) && /^\d{1,9}$/.test(other.text);
        }
        return (callee.expression?.kind === SyntaxKind.ThisKeyword) && this.csharpShadowCallees.has(callee.name?.text as string);
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

    // slot 0 of `this.handleOptionAndParams (params, method, '<bool option>', <bool default>)` is a
    // non-null bool: the helper hands back the params value or the default. `target` is the
    // destructuring assignment's own local, whose bool initializer may stand as the default.
    csharpBoolOptionSlotCall(call, target?): boolean {
        const callee = call?.expression;
        if ((call?.kind !== SyntaxKind.CallExpression) || (call.questionDotToken !== undefined)
            || (callee?.kind !== SyntaxKind.PropertyAccessExpression) || (callee.expression?.kind !== SyntaxKind.ThisKeyword)) {
            return false;
        }
        const optionNames = (callee.name?.text === 'handleOptionAndParams') ? 1 : ((callee.name?.text === 'handleOptionAndParams2') ? 2 : 0);
        const args = call.arguments;
        if ((optionNames === 0) || (args?.length !== optionNames + 3) || !this.csharpCalleeResolves(call)) {
            return false;
        }
        for (let i = 0; i < optionNames; i++) {
            if (!isStringLiteral(args[2 + i]) || (CSHARP_BOOL_OPTION_KEYS.indexOf(args[2 + i].text) < 0)) {
                return false;
            }
        }
        return this.csharpBoolOptionDefault(args[args.length - 1], target);
    }

    // a bool literal, a method parameter defaulted to one (non-null after its `??=` prologue) that is
    // never rewritten, or the destructuring target's own local declared with a bool literal
    csharpBoolOptionDefault(node, target): boolean {
        const value = this.csharpUnparenthesized(node);
        const isBoolLiteral = (n) => (n?.kind === SyntaxKind.TrueKeyword) || (n?.kind === SyntaxKind.FalseKeyword);
        if (isBoolLiteral(value)) {
            return true;
        }
        const binding: any = this.csharpReceiverBinding(value);
        if (binding?.kind === SyntaxKind.Parameter) {
            return (binding.parent?.kind === SyntaxKind.MethodDeclaration) && (binding.name?.kind === SyntaxKind.Identifier)
                && (binding.dotDotDotToken === undefined) && isBoolLiteral(binding.initializer) && !this.csharpParameterWrittenAnywhere(value);
        }
        return (target !== undefined) && (binding?.kind === SyntaxKind.VariableDeclaration)
            && (binding === this.csharpReceiverBinding(target)) && isBoolLiteral(binding.initializer);
    }

    // `[ x, p ] = this.handleOptionAndParams (...)`: the slot-0 identifier when that call is a bool
    // option read and `x` is a local declared with a bool literal, else undefined
    csharpBoolOptionSlotTarget(pattern) {
        const assignment = pattern?.parent;
        if ((pattern?.kind !== SyntaxKind.ArrayLiteralExpression) || (assignment?.kind !== SyntaxKind.BinaryExpression)
            || (assignment.left !== pattern) || (assignment.operatorToken.kind !== SyntaxKind.EqualsToken)) {
            return undefined;
        }
        const target = pattern.elements?.[0];
        const declaration: any = this.csharpReceiverBinding(target);
        if ((declaration?.kind !== SyntaxKind.VariableDeclaration) || (declaration.name?.kind !== SyntaxKind.Identifier)
            || ((declaration.parent as any)?.declarations?.length !== 1)
            || ((declaration.initializer?.kind !== SyntaxKind.TrueKeyword) && (declaration.initializer?.kind !== SyntaxKind.FalseKeyword))) {
            return undefined;
        }
        return this.csharpBoolOptionSlotCall(this.csharpUnparenthesized(assignment.right), target) ? target : undefined;
    }

    // the assignment destructuring writes a bool slot into a local this printer declares `bool`
    csharpBoolOptionSlotWriteIsTyped(pattern): boolean {
        const target = this.csharpBoolOptionSlotTarget(pattern);
        return (target !== undefined) && (this.getCSharpLocalType(this.csharpReceiverBinding(target)) === 'bool');
    }

    // the binding a bare identifier resolves to (a local, a parameter, ...) or undefined
    // for every other receiver shape (`this.x`, a call result, a destructured target)
    csharpReceiverBinding(receiver) {
        if (receiver?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const symbol = (this.getChecker() as Checker).getSymbolAtLocation(receiver);
        return symbol?.valueDeclaration?.resolve();
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
                    const declarations = (this.getChecker().getDeclaredTypeOfSymbol(symbol).getSymbol()?.declarations ?? []).map((d) => d.resolve());
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
        // const newExpression = node.expression?.expression?.text;
        // // newExpression = newExpression ? newExpression : this.printNode(node.expression.expression, 0); // new Exception or new exact[string] check this out
        // // const args = node.expression?.arguments.map(n => this.printNode(n, 0)).join(",");
        // // const throwExpression = ` ${newToken}${newExpression}${this.LEFT_PARENTHESIS}((string)${args})${this.RIGHT_PARENTHESIS}`;
        // return this.getIden(identation) + this.THROW_TOKEN + throwExpression + this.LINE_TERMINATOR;
    }

    csharpDeclaredReceiverReadable(node, expression): boolean {
        return this.csharpEnclosingFunction(node) !== undefined && isIdentifier(expression);
    }

    // `x[i]` / `m[k]` with an identifier key on a declared collection or a base dict field.
    // The emission carries GetValue's own null/missing-key/past-the-end tests; a negative index
    // throws in both. Key must be declared `int` (list) or `string`/`string?` (dictionary).
    csharpIdentifierKeyRead(expression, argumentExpression): string | undefined {
        if (!isIdentifier(argumentExpression) || !this.csharpIsPlainRead(argumentExpression.parent)) {
            return undefined;
        }
        let receiver: string | undefined;
        let csharpType: string | undefined;
        const member = this.csharpMemberReceiver(expression);
        if (member !== undefined && member.routed === true && member.kind === 'dict' && (expression as any).name?.text !== 'orderbooks') {
            // an owner-routed ws cache: its property is the IDictionary the accessors hand out, so the helper's
            // own tests read it natively (orderbooks stays: the ws transpile maps its reads to getOrderBook)
            const routedKey = this.csharpMemberKeyKind(argumentExpression);
            if (routedKey === undefined) {
                return undefined;
            }
            const routedPrinted = this.printNode(argumentExpression, 0);
            const routedSpelling = (routedKey === 'string' || routedKey === 'string?') ? routedPrinted : `(string)${routedPrinted}`;
            return `(${member.text} != null && ${routedPrinted} != null && ${member.text}.ContainsKey(${routedSpelling}) ? ${member.text}[${routedSpelling}] : null)`;
        }
        if (member !== undefined && member.routed !== true) {
            const keyType = this.csharpDeclaredKeyType(argumentExpression);
            const keyKind = (member.kind === 'dict') ? this.csharpMemberKeyKind(argumentExpression) : undefined;
            const printedKey = this.printNode(argumentExpression, 0);
            const test = `${member.nullTest ?? member.text} != null && `;
            if (member.kind === 'list') {
                if (keyType !== 'int') {
                    return undefined; // Int64/object indices do not bind the List indexer
                }
                return `(${test}${printedKey} < ${member.text}.Count ? ${member.text}[${printedKey}] : null)`;
            }
            if (keyKind === 'string' || keyKind === 'string?') {
                return `(${test}${printedKey} != null && ${member.text}.ContainsKey(${printedKey}) ? ${member.text}[${printedKey}] : null)`;
            }
            // GetValue casts the key to string: a non-string box throws there too
            if (keyKind === 'object' || keyKind === 'param') {
                return `(${test}${printedKey} != null && ${member.text}.ContainsKey((string)${printedKey}) ? ${member.text}[(string)${printedKey}] : null)`;
            }
            return undefined;
        }
        if (!isIdentifier(expression) || CSHARP_MARKET_RECEIVER_NAMES.indexOf(expression.text as string) >= 0) {
            return undefined;
        }
        csharpType = this.csharpDeclaredCollectionType(expression);
        if (csharpType === undefined) {
            const printed = (typeof (this as any).csharpPrintedLocalType === 'function') ? (this as any).csharpPrintedLocalType(expression) : undefined;
            csharpType = (CSHARP_NATIVE_COLLECTION_TYPES.indexOf(printed) >= 0) ? printed : undefined;
        }
        if (csharpType === undefined || this.csharpEnclosingFunction(expression) === undefined) {
            return undefined;
        }
        // eslint-disable-next-line prefer-const
        receiver = this.printNode(expression, 0);
        const printedKey = this.printNode(argumentExpression, 0);
        const keyType = this.csharpDeclaredKeyType(argumentExpression);
        if (csharpType.indexOf('Dictionary<') >= 0) {
            if (keyType === 'object' && this.csharpObjectKeyCastable(argumentExpression)) {
                // an `object` key takes the helper's own `(string)key` cast
                return `(${receiver} != null && ${printedKey} != null && ${receiver}.ContainsKey((string)${printedKey}) ? ${receiver}[(string)${printedKey}] : null)`;
            }
            if (keyType !== 'string' && keyType !== 'string?') {
                return undefined;
            }
            return `(${receiver} != null && ${printedKey} != null && ${receiver}.ContainsKey(${printedKey}) ? ${receiver}[${printedKey}] : null)`;
        }
        if (keyType !== 'int') {
            return undefined; // Int64/object indices do not bind the List indexer
        }
        return `(${receiver} != null && ${printedKey} < ${receiver}.Count ? ${receiver}[${printedKey}] : null)`;
    }

    // an `object` key identifier whose `(string)` cast cannot hide a later retype: a parameter the body
    // writes (or defaults) gets a shadow local the embedding build layer retypes after printing
    csharpObjectKeyCastable(key): boolean {
        const binding: any = this.csharpReceiverBinding(key);
        return !((binding?.kind === SyntaxKind.Parameter) && ((binding.initializer !== undefined) || this.csharpParameterWrittenAnywhere(key)));
    }

    // a read that is no write target: not the left of any assignment, not ++/--, not delete
    csharpIsPlainRead(node): boolean {
        const parent: any = node?.parent;
        if (parent?.kind === SyntaxKind.BinaryExpression && parent.left === node && this.csharpIsAssignmentOperator(parent.operatorToken.kind)) {
            return false;
        }
        return !isDeleteExpression(parent) && !isPrefixUnaryExpression(parent) && !isPostfixUnaryExpression(parent);
    }

    // the C# type the key identifier's emitted declaration carries: the printer's own table, then
    // the build layer's declared-local hook (which retypes for-counters and string locals)
    csharpDeclaredKeyType(key): string | undefined {
        const typed = this.csharpTypedLocalType(key);
        if (typed !== undefined) {
            return typed;
        }
        const printed = (typeof (this as any).csharpPrintedLocalType === 'function') ? (this as any).csharpPrintedLocalType(key) : undefined;
        if (printed !== undefined) {
            return printed;
        }
        return (typeof this.csharpLocalTypeOf === 'function') ? this.csharpLocalTypeOf(key) : undefined;
    }

}
