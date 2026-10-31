import { BaseTranspiler } from "./baseTranspiler.js";
import { NodeFlags, SyntaxKind, type Expression, type Node } from "typescript/unstable/ast";
import { isArrayLiteralExpression, isArrayTypeNode, isTupleTypeNode, isArrowFunction, isAsExpression, isBinaryExpression, isBlock, isBooleanLiteral, isCallExpression, isBreakStatement, isClassDeclaration, isConditionalExpression, isContinueStatement, isElementAccessExpression, isExpressionStatement, isForInStatement, isForOfStatement, isFunctionDeclaration, isFunctionExpression, isIdentifier, isIfStatement, isMethodDeclaration, isNonNullExpression, isNumericLiteral, isObjectLiteralExpression, isParameterDeclaration, isParenthesizedExpression, isPostfixUnaryExpression, isPrefixUnaryExpression, isPropertyAccessExpression, isPropertyAssignment, isReturnStatement, isShorthandPropertyAssignment, isSourceFile, isSpreadAssignment, isSpreadElement, isStringLiteral, isStringLiteralLikeNode, isThrowStatement, isTypeAssertion, isTypeOfExpression, isTypeReferenceNode, isVariableDeclaration, isVariableDeclarationList } from "typescript/unstable/ast/is";
import { createIdentifier } from "typescript/unstable/ast/factory";
import { API, ElementFlags, IndexKind, SymbolFlags, TypeFlags, type Checker } from "typescript/unstable/sync";
import { Logger } from "./logger.js";
import { getAllSuperTypeNodes, getCombinedNodeFlags, isFunctionLike } from "./tsUtils.js";

const parserConfig = {
    EXTENDS_TOKEN: "extends",
    PROMISE_TYPE_KEYWORD: "java.util.concurrent.CompletableFuture",
    ARRAY_KEYWORD: "java.util.List<Object>",
    OBJECT_KEYWORD: "java.util.Map<String, Object>",
    STRING_KEYWORD: "String",
    BOOLEAN_KEYWORD: "boolean",
    DEFAULT_PARAMETER_TYPE: "Object",
    DEFAULT_RETURN_TYPE: "Object",
    DEFAULT_TYPE: "Object",
    ELSEIF_TOKEN: "else if",
    // Objects in Java: we'll use double-brace initialization so property puts work
    OBJECT_OPENING: "new java.util.HashMap<String, Object>() {{",
    OBJECT_CLOSING: "}}",
    // Arrays in Java: emit Arrays.asList(...) wrapped by ArrayList
    ARRAY_OPENING_TOKEN: "new java.util.ArrayList<Object>(java.util.Arrays.asList(",
    ARRAY_CLOSING_TOKEN: "))",
    // For object literal properties we'll emit: put(key, value);
    PROPERTY_ASSIGNMENT_TOKEN: ",",
    VAR_TOKEN: "Object", // Java 10+ local var
    METHOD_TOKEN: "",
    PROPERTY_ASSIGNMENT_OPEN: "put(",
    PROPERTY_ASSIGNMENT_CLOSE: ");",
    SUPER_TOKEN: "super",
    SUPER_CALL_TOKEN: "super",
    FALSY_WRAPPER_OPEN: "Helpers.isTrue(",
    FALSY_WRAPPER_CLOSE: ")",
    COMPARISON_WRAPPER_OPEN: "Helpers.isEqual(",
    COMPARISON_WRAPPER_CLOSE: ")",
    UKNOWN_PROP_WRAPPER_OPEN: "this.call(",
    UNKOWN_PROP_WRAPPER_CLOSE: ")",
    UKNOWN_PROP_ASYNC_WRAPPER_OPEN: "this.callAsync(",
    UNKOWN_PROP_ASYNC_WRAPPER_CLOSE: ")",
    DYNAMIC_CALL_OPEN: "Helpers.callDynamically(",
    EQUALS_EQUALS_WRAPPER_OPEN: "Helpers.isEqual(",
    EQUALS_EQUALS_WRAPPER_CLOSE: ")",
    DIFFERENT_WRAPPER_OPEN: "!Helpers.isEqual(",
    DIFFERENT_WRAPPER_CLOSE: ")",
    GREATER_THAN_WRAPPER_OPEN: "Helpers.isGreaterThan(",
    GREATER_THAN_WRAPPER_CLOSE: ")",
    GREATER_THAN_EQUALS_WRAPPER_OPEN: "Helpers.isGreaterThanOrEqual(",
    GREATER_THAN_EQUALS_WRAPPER_CLOSE: ")",
    LESS_THAN_WRAPPER_OPEN: "Helpers.isLessThan(",
    LESS_THAN_WRAPPER_CLOSE: ")",
    LESS_THAN_EQUALS_WRAPPER_OPEN: "Helpers.isLessThanOrEqual(",
    LESS_THAN_EQUALS_WRAPPER_CLOSE: ")",
    PLUS_WRAPPER_OPEN: "Helpers.add(",
    PLUS_WRAPPER_CLOSE: ")",
    MINUS_WRAPPER_OPEN: "Helpers.subtract(",
    MINUS_WRAPPER_CLOSE: ")",
    ARRAY_LENGTH_WRAPPER_OPEN: "Helpers.getArrayLength(",
    ARRAY_LENGTH_WRAPPER_CLOSE: ")",
    DIVIDE_WRAPPER_OPEN: "Helpers.divide(",
    DIVIDE_WRAPPER_CLOSE: ")",
    MULTIPLY_WRAPPER_OPEN: "Helpers.multiply(",
    MULTIPLY_WRAPPER_CLOSE: ")",
    INDEXOF_WRAPPER_OPEN: "Helpers.getIndexOf(",
    INDEXOF_WRAPPER_CLOSE: ")",
    MOD_WRAPPER_OPEN: "Helpers.mod(",
    MOD_WRAPPER_CLOSE: ")",
    FUNCTION_TOKEN: "",
    ELEMENT_ACCESS_WRAPPER_OPEN: 'Helpers.GetValue(',
    ELEMENT_ACCESS_WRAPPER_CLOSE: ')',
    INFER_VAR_TYPE: false,
    INFER_ARG_TYPE: false,
};

// hand-written base methods whose Java declaration carries a concrete numeric return type
// (BaseExchange.java: `public Long milliseconds()`), so a `this.<name>()` call holds that box on
// every path. Generated methods print `Object`; only this closed table is an arithmetic anchor.
const JAVA_THIS_RETURN_TYPES: { [name: string]: string } = {
    'milliseconds': 'long',
};

// source files the table was audited against: the declaration on the base class, or
// its overload-stripped temp copy (build/stripOverloads.ts). A call resolving anywhere
// else is a venue override that prints its own signature - not provable.
// `extend = extend` / `deepExtend = deepExtend` resolve to the base-tier generic helpers
const JAVA_FRESH_EXTEND_FILE = /(^|[\\/])ts[\\/]src[\\/]base[\\/](functions[\\/]generic|Exchange(\.nooverloads\.\d+)?)\.ts$/;
const JAVA_THIS_RETURN_TYPES_BASE_FILE = /(^|[\\/])ts[\\/]src[\\/]base[\\/]Exchange(\.nooverloads\.\d+)?\.ts$/;
// `milliseconds = milliseconds` (Exchange.ts) mixes in the functions/time.ts helper, so
// the same call may resolve to the Date.now signature in a typescript lib.d.ts instead.
const JAVA_THIS_RETURN_TYPES_LIB_FILE = /(^|[\\/])node_modules[\\/](?:[^\\/]+[\\/]node_modules[\\/])?typescript6?[\\/]lib[\\/]lib\.[^\\/]*\.d\.ts$/;

// every assignment operator (`=`, `+=`, `??=`, ...) but no comparison (`===`, `!==`, `<=`, `>=`):
// an element access on the left of one of these is a write site and keeps the base emission
const JAVA_ASSIGNMENT_OPERATOR_KINDS: Set<number> = (() => {
    const kinds: any = SyntaxKind;
    const names = Object.keys(kinds).filter((name) => name.endsWith('EqualsToken')
        && !/^Equals|^Exclamation|^LessThan|^GreaterThan/.test(name));
    return new Set<number>(([ 'EqualsToken' ].concat(names)).map((name) => kinds[name]).filter((kind) => kind !== undefined));
})();

// TS type flags whose Java print is a scalar final class or a primitive: `instanceof
// java.util.List` is not convertible on those operands, so they keep the helper
const JAVA_SCALAR_TYPE_FLAGS: number = TypeFlags.String | TypeFlags.StringLiteral
    | TypeFlags.Number | TypeFlags.NumberLiteral
    | TypeFlags.Boolean | TypeFlags.BooleanLiteral
    | TypeFlags.BigInt | TypeFlags.BigIntLiteral
    | TypeFlags.Enum | TypeFlags.EnumLiteral
    | TypeFlags.ESSymbol | TypeFlags.UniqueESSymbol;

// TS type flags that are never an array (JS `Array.isArray(null)` / `(undefined)` is false)
const JAVA_NULLISH_TYPE_FLAGS: number = TypeFlags.Undefined | TypeFlags.Null
    | TypeFlags.Void | TypeFlags.Never;

// hand-written `boolean` fields in the class body of BaseExchange.java / PredictionExchange.java
// (the half hand-written base files the generated exchanges inherit): a read of one prints a
// primitive Java boolean, so `this.<field>` IS the wrapper's result.
const JAVA_BOOLEAN_BASE_FIELDS = new Set([
    'this.alias',
    'this.verbose',
    'this.validateServerSsl',
    'this.enableRateLimit',
    'this.pro',
    'this.certified',
    'this.reloadingMarkets',
    'this.marketsLoaded',
    'this.reduceFees',
    'this.substituteCommonCurrencyCodes',
    'this.isSandboxModeEnabled',
    'this.returnResponseHeaders',
    'this.newUpdates',
    'this.syncSleep',
    // PredictionExchange.java
    'this.reloadingEvents',
]);

// hand-written map fields of BaseExchange.java: each value is a java.util.Map, so `this.<field>[k]`
// is the helper's Map branch. `nullable` marks a field set to null or written from an Object-typed
// call, so the read keeps the null answer behind a receiver guard.
const JAVA_FIELD_TYPES: { [name: string]: { map: boolean, nullable: boolean } } = {
    'ohlcvs':     { map: true, nullable: false },
    'orderbooks': { map: true, nullable: false },
    'balance':    { map: true, nullable: true },
    'options':    { map: true, nullable: true },
    'markets':    { map: true, nullable: true },
};

// hand-written fields of BaseExchange.java declared `Map<String, Object>` (field declarations
// only, no method returns). A write of a non-null value into one is the helper's Map branch
// `m.put(k, v)` verbatim, so the field's own declaration carries the type the put binds on.
const JAVA_MAP_WRITE_FIELDS: Set<string> = new Set([
    'api',
    'balance',
    'baseCurrencies',
    'bidsasks',
    'commonCurrencies',
    'exceptions',
    'features',
    'fundingRates',
    'has',
    'headers',
    'markets',
    'markets_by_id',
    'ohlcvs',
    'options',
    'orderbooks',
    'quoteCurrencies',
    'tickers',
    'trades',
    'transformedApi',
    'urls',
    'userAgents',
]);

// public map fields of the hand-written WsClient.java (ts/src/base/ws/Client.ts): OwnerMap
// hand-off views over owner-thread LinkedHashMaps, so a read is the plain map get and a null
// receiver or key answers null in both spellings
// value = the Java value type the field declares (a local bound to one of its reads prints it)
const JAVA_WS_CLIENT_MAP_FIELDS: { [field: string]: string } = {
    'futures': 'io.github.ccxt.ws.Future',
    'subscriptions': 'Object',
    'rejections': 'Object',
};
const JAVA_WS_CLIENT_FILE = /(^|[\\/])ts[\\/]src[\\/]base[\\/]ws[\\/]Client\.ts$/;

// hand-written BaseExchange.java fields declared `Map<String, Object>` over a fresh plain HashMap that
// nothing in the port ever sets to null or to a concurrent map: a put on one (null value included) is
// the helper's Map branch verbatim. The ws handlers that write them run on the exchange's owner executor.
const JAVA_PLAIN_MAP_FIELDS: Set<string> = new Set([
    'balance',
    'bidsasks',
    'fundingRates',
    'headers',
    'ohlcvs',
    'orderbooks',
    'tickers',
    'timeframes',
    'trades',
    'transformedApi',
]);

// printed operand text holding a Java box cast such as `(String) x` or `(Map<String, Object>) x`
const JAVA_BOX_CAST = /\((?:final\s+)?(?:[A-Z][\w.]*|(?:java|io|com)\.[\w.]+)(?:<[^()]*>)?\)/;

// class members that run on the owner executor (ws handlers); watch*/load*/setSandboxMode can write
// the same map from another thread, so a site inside them keeps the helper's monitor
const JAVA_OWNER_MEMBER_NAME = /^(?:handle[A-Z]\w*|parseWSBalances)$/;

// hand-written base fields (BaseExchange.java) whose Java declaration is exactly
// `Map<String, Object>`: a local bound to one prints that type, so its element reads bind the
// accessor with no cast. Fields the base declares `Object` (currencies, fees, timeframes) are
// deliberately absent: assigning them to a Map needs a cast javaBaseMapFieldLocalType forbids.
const JAVA_DECLARED_MAP_FIELD_NAMES: Set<string> = new Set<string>([
    'markets', 'markets_by_id', 'has', 'features', 'options', 'balance',
    'tickers', 'fundingRates', 'bidsasks', 'trades', 'orderbooks', 'ohlcvs',
    'commonCurrencies', 'networkAliases',
]);

// hand-written base methods declared `public boolean` (BaseExchange.java): a call prints a
// primitive Java boolean, so a local fed by one holds a Boolean box or null.
const JAVA_BOOLEAN_BASE_CALLS = new Set([
    'valueIsDefined',
    'inArray',
    'isEmpty',
    'isJsonEncodedObject',
    'isBinaryMessage',
]);

// hand-written base methods (ts/src/base/Exchange.ts, spliced into BaseExchange.java) declared
// `public Map<String, Object>` that build a new plain HashMap on every call: a local fed by one
// owns that map, so its element writes are the helper's map branch
const JAVA_FRESH_MAP_BASE_CALLS = new Set([
    'account',
]);

// operators whose printed Java form is a primitive boolean on every path: the logical ones and
// every comparison / `in` / `instanceof`-style test the printer lowers to Helpers.isEqual /
// isGreaterThan / inOp (all declared `public static boolean`) or to a native Java boolean
const JAVA_BOOLEAN_OPERATOR_KINDS: Set<number> = (() => {
    const k: any = SyntaxKind;
    return new Set<number>([
        k.AmpersandAmpersandToken,
        k.BarBarToken,
        k.EqualsEqualsToken,
        k.EqualsEqualsEqualsToken,
        k.ExclamationEqualsToken,
        k.ExclamationEqualsEqualsToken,
        k.LessThanToken,
        k.LessThanEqualsToken,
        k.GreaterThanToken,
        k.GreaterThanEqualsToken,
        k.InKeyword,
        k.InstanceOfKeyword,
    ]);
})();

// the relational `Precise.string*` statics are declared `public static boolean` in the
// hand-written java/lib/src/main/java/io/github/ccxt/base/Precise.java, so their printed call is
// already a Java primitive boolean (the String-returning statics are NOT listed here)
const JAVA_PRECISE_BOOLEAN_STATICS: Set<string> = new Set([
    'stringEq', 'stringEquals', 'stringGt', 'stringGe', 'stringLt', 'stringLe',
]);

// The printer erases TS return annotations to `Object`, so Helpers.isTrue would re-test a value the
// hand-written Java base (BaseExchange.java, above the transpiled delimiter) already returns as a
// boolean. Java overrides are covariant, so no generated venue method can widen these returns.
const JAVA_THIS_BOOLEAN_METHODS = new Set<string>([
    'inArray',              // public boolean inArray (Object elem, Object list2)
    'isArray',              // public boolean isArray (Object a)
    'isEmpty',              // public boolean isEmpty (Object a)
    'valueIsDefined',       // public boolean valueIsDefined (Object value)
    'isJsonEncodedObject',  // public boolean isJsonEncodedObject (Object str)
    'isBinaryMessage',      // public boolean isBinaryMessage (Object message)
]);

// The GENERATED boolean accessors (`Object safeBool (...)`) hand the caller's `defaultValue` back
// untouched when the found value is not a Boolean, so the box is Boolean-or-null only when the
// default argument is absent or a boolean literal. Value = index of that argument in the call.
const JAVA_THIS_BOOLEAN_BOX_METHODS: { [name: string]: number } = {
    'safeBool': 2,
    'safeBool2': 3,
    'safeBoolN': 2,
};

// the Java spellings a consumer declares a dict local with (import-shortened forms
// included); every other declared type keeps Helpers.GetValue
// the base class that owns the options counters (BaseExchange.nextCounter / nextCounterAbove)
const JAVA_OWNER_CLASS = 'BaseExchange';
const JAVA_DECLARED_MAP_TYPES = /^(java\.util\.)?(Map|HashMap)\s*<\s*String\s*,\s*Object\s*>$/;
// the declaration token a local the printer feeds a fresh plain map prints with: fully qualified,
// because the generated test tier imports only java.util.HashMap (JAVA_DECLARED_MAP_TYPES accepts it)
const JAVA_ELEMENT_WRITE_MAP_TYPE = 'java.util.Map<String, Object>';

// the Java spellings a consumer declares an element-read receiver with when it is a List:
// the read prints `x.get(i)` / `x.size()` with no cast, because the declaration is the List
const JAVA_DECLARED_LIST_TYPES = /^(java\.util\.)?(List|ArrayList)\s*<[^;\n=]+>$/;

// the Java primitive spellings a declaration can publish: an operand that prints as one
// cannot take the `instanceof` test a native map read guards with
const JAVA_PRIMITIVE_DECLARED_TYPES = new Set(['boolean', 'byte', 'char', 'short', 'int', 'long', 'float', 'double']);

// the numeric declaration types the ccxt-side pass publishes; the boxed ones can hold
// null, so a native compare guards them first
const JAVA_DECLARED_NUMERIC_TYPES: Set<string> =
    new Set<string>(['Integer', 'Long', 'Double', 'int', 'long', 'double']);

const JAVA_BOXED_NUMERIC_TYPES: Set<string> =
    new Set<string>(['Integer', 'Long', 'Double']);

// the typed table a `method.call (this, client, message)` dispatches through: the runtime
// functional interface it holds, and the map type the table declares
const JAVA_HANDLER_INTERFACE = 'io.github.ccxt.Handler';
const JAVA_HANDLER_TABLE_TYPE = 'java.util.Map<String, io.github.ccxt.Handler>';

// receiver node kinds whose printed Java is a primary expression, so the `(String)`
// checkcast in front of them binds the whole receiver (a native `+` prints its own parens)
const JAVA_SPLIT_RECEIVER_KINDS: Set<number> = new Set<number>([
    SyntaxKind.Identifier,
    SyntaxKind.PropertyAccessExpression,
    SyntaxKind.ElementAccessExpression,
    SyntaxKind.CallExpression,
    SyntaxKind.ParenthesizedExpression,
    SyntaxKind.StringLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
]);

// TS classes/interfaces whose hand-written java counterpart extends java.util.ArrayList<Object>
// (java/lib/.../ws/ArrayCache.java and ws/OrderBookSide.java, plus the IndexedOrderBookSide and
// Asks/Bids subclasses); every runtime value of these types answers `.length` with the list size
const JAVA_LIST_BACKED_TS_CLASSES: Set<string> = new Set([
    'ArrayCache',
    'ArrayCacheByTimestamp',
    'ArrayCacheBySymbolById',
    'ArrayCacheByOutcomeById',
    'ArrayCacheBySymbolBySide',
    'OrderBookSide',
    'IndexedOrderBookSide',
    'Asks',
    'Bids',
    'IndexedAsks',
    'IndexedBids',
    'IOrderBookSide',
]);

// the Java spelling that lets the printed key go straight to containsKey: the helper only
// looks a key up when it is a String, and a String-typed operand is one on every path
const JAVA_DECLARED_STRING_TYPE = /^(java\.util\.)?String$/;

// the Java spellings a declaration publishes for the ws order book class (import-shortened included)
const THIS_WS_ORDERBOOK_TYPE = /^(?:io\.github\.ccxt\.ws\.)?WsOrderBook$/;

// TS parameter annotations (`Dict`, `Market`, `Currency`, `Str`, `OrderType`/`OrderSide`, `Bool`) print the native Java
// type on the declaring method. `Int`/`Num` stay `Object`: a TS `number` is an Integer, Long or
// Double box in generated code, so neither a `Long`/`Double` parameter nor a cast site is provable.
const JAVA_NATIVE_PARAMETER_TYPES: { [name: string]: string } = {
    'Dict': 'java.util.Map<String, Object>',
    'Market': 'java.util.Map<String, Object>',
    'Currency': 'java.util.Map<String, Object>',
    'Str': 'String',
    'OrderType': 'String',
    'OrderSide': 'String',
    'Bool': 'Boolean',
};

// Java types of default-valued parameters; separate from the fixed-parameter table.
// `Num`/`Bool`/`Strings` stay Object: widening them changes payload strings or varargs spreading.
const JAVA_NATIVE_PARAMETER_TYPES_OPTIONAL: { [name: string]: string } = {
    'Dict': 'java.util.Map<String, Object>',
    'Market': 'java.util.Map<String, Object>',
    'Currency': 'java.util.Map<String, Object>',
    'Str': 'String',
    'OrderType': 'String',
    'OrderSide': 'String',
    'Int': 'Long',
    'Strings': 'java.util.List<String>',
};

// TS classes with a hand-written Java class carrying the same members. A parameter annotated with
// one of these names prints that Java type: there is no box to keep, the annotation names the class
// itself. Only the ws order book qualifies so far - its Java twin is a real class, and the members
// the generated bodies read off it (get/put on its own keys) are the helper's own map branch.
// ts/src/base/ws/OrderBook.ts exports the class both as `OrderBook` and as `WsOrderBook`, and the
// checker keeps the CLASS name on the symbol, so both spellings map here; the class-declaration
// file below is what separates it from the unrelated `types.OrderBook` map.
const JAVA_NATIVE_PARAMETER_CLASS_TYPES: { [name: string]: string } = {
    'OrderBook': 'io.github.ccxt.ws.WsOrderBook',
    'WsOrderBook': 'io.github.ccxt.ws.WsOrderBook',
};

// a class-type annotation proves the printed class only when it resolves to that class declaration
const JAVA_NATIVE_PARAMETER_CLASS_FILES = /(^|\/)ts\/src\/base\/ws\/OrderBook\.ts$/;

// the keys WsOrderBook answers with its own `get` (its containsKey holds every one of them), so a
// native read is exactly Helpers.GetValue's map branch - which answers null for a null receiver
const JAVA_WS_ORDERBOOK_READ_KEYS: Set<string> = new Set([
    'asks', 'bids', 'timestamp', 'datetime', 'nonce', 'cache',
]);

// `Strings` (and a `string[]` spelling of the same slot) is typed only on parameters named `symbols`
const JAVA_STRINGS_OPTIONAL_PARAMETER_NAMES = new Set<string>(['symbols']);
const JAVA_STRING_LIST_TYPE = 'java.util.List<String>';
// base symbol-list helpers keep their Object slot (hand-written java callers pass Object)
const JAVA_STRINGS_EXCLUDED_METHODS = new Set<string>(['marketSymbols', 'marketIds', 'marketsForSymbols', 'getMarketFromSymbols']);

// the aliases above have to come from the shared ts/src/base/types.ts declaration
const JAVA_NATIVE_PARAMETER_SOURCE_FILES = /(^|\/)ts\/src\/base\/types\.ts$/;

// the Java spelling of a dict slot: the annotation tables above and the inheritance arm below
const JAVA_NATIVE_DICT_PARAMETER_TYPE = 'java.util.Map<String, Object>';

// Parameter positions whose Java signature cannot move to the annotated type even though
// the base declaration carries it. Java overrides are invariant, so one excluded position
// boxes every declaration of the name at once.
const JAVA_NATIVE_PARAMETER_EXCLUDED_POSITIONS: { [name: string]: number[] } = {
    // implicit endpoints pass fetch2/request/sign params through untyped (arrays for batch orders)
    'fetch2': [ 3 ],
    // the Exchange tier keeps fetchOrderBook's symbol Object; PredictionExchange overrides must erase alike
    'fetchOrderBook': [ 0 ],
    'request': [ 3 ],
    'sign': [ 3 ],
    'handleErrors': [ 4 ],
    'parseOrder': [ 0 ],
    'parseTrade': [ 0 ],
    'amountToPrecision': [ 0 ],
    'client': [ 0 ],
    'costToPrecision': [ 0 ],
    'handleOptionAndParams': [ 1 ],
    'market': [ 0 ],
    'marketSymbols': [ 1 ],
    'parseAccount': [ 0 ],
    'parseMarket': [ 0 ],
    'parseOrderBook': [ 1 ],
    'priceToPrecision': [ 0 ],
    'safeBalance': [ 0 ],
    'safeOpenInterest': [ 0 ],
    'safeSymbol': [ 0 ],
    // java/tests/src/main/java/tests/base/TestSafeTicker.java is generated by the
    // --baseTests stage, which the farm's java target never reruns: it calls
    // `exchange.safeTicker(<Object local>)` and cannot be regenerated with a checkcast
    'safeTicker': [ 0 ],
    'symbol': [ 0 ],
    'watch': [ 0, 1 ],
};

// only the generated tiers carry the annotation: a method declared in ts/src/base/** has a
// hand-written java counterpart (BaseExchange/Exchange/Helpers/Precise) that keeps `Object`
const JAVA_NATIVE_PARAMETER_GENERATED_FILES = /(^|\/)ts\/src\/(?:pro\/|prediction\/)?[a-z0-9_]+\.ts$/;

// The generated test tier (java/tests/**): free functions and classes with no hand-written java
// counterpart and no venue overrides, so a parameter's annotation prints its Java type there.
const JAVA_TEST_TIER_FILES = /(?:^|[\\/])ts[\\/]src[\\/](?:pro[\\/])?test[\\/].*\.ts$/;

// the base tier is generated too: the transpiled `BaseExchange` body of
// ts/src/base/Exchange.ts is spliced into java/lib/.../BaseExchange.java (the hand-written
// java surface around it is not a class of its own), so its declarations print the
// the base tiers print only the methods below this line of ts/src/base/(Prediction)Exchange.ts
const JAVA_TRANSPILE_DELIMITER = 'METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT';
// hand-written base methods whose Java runtime declares exactly the TS parameters (no varargs)
const JAVA_HANDWRITTEN_FULL_ARITY = new Set(['loadMarkets', 'fetchMarkets', 'fetchCurrencies', 'exceptionMessage']);
const JAVA_HANDWRITTEN_TIER_FILES = /(^|\/)ts\/src\/(?:base|static_dependencies)\//;
const JAVA_NATIVE_PARAMETER_BASE_FILES = /(^|[\\/])ts[\\/]src[\\/]base[\\/](Prediction)?Exchange(\.nooverloads[^/]*)?\.ts$/;

// ===== native RETURN types (D-09) =====
//
// The printer declares every generated method `Object` (BaseTranspiler.printFunctionType
const JAVA_NATIVE_RETURN_MAP_TYPE = 'java.util.Map<String, Object>';
// list target: a generated method whose TS return annotation is an array (every element type
// but `string`, whose slots print List<String>) declares `java.util.List<Object>` when every
// return site already prints a List<Object>.
const JAVA_NATIVE_RETURN_LIST_TYPE = 'java.util.List<Object>';
// the native Map/List return spellings a generated callee prints, in either import spelling
function javaVenueCalleeNativeType(printed: unknown): string | undefined {
    if (typeof printed !== 'string') {
        return undefined;
    }
    const type = printed.replace(/\s+/g, '').replace(/^java\.util\./, '');
    if (type === 'Map<String,Object>') {
        return JAVA_NATIVE_RETURN_MAP_TYPE;
    }
    return type === 'List<Object>' ? JAVA_NATIVE_RETURN_LIST_TYPE : undefined;
}
// `this.<name> (...)` returns whose printed Java call already answers a List<Object>: the
// hand-written `toArray` (BaseExchange.java) and Object.keys/values (Helpers.objectKeys/Values).
const JAVA_LIST_RETURN_BASE_METHODS: Set<string> = new Set<string>(['toArray']);
const JAVA_OBJECT_LIST_CALL_NAMES: Set<string> = new Set<string>(['keys', 'values']);
// `this.<name> (...)` calls that print a java.util.List the hand-written runtime declares (toArray/aggregate:
// `List<Object>`; sortBy/sortBy2/filterBy: `<T> List<T>`, inferred Object in a List<Object> slot), resolved to
// the base Exchange tier or base/functions/generic.ts. Argument position only: a return site keeps its own set.
const JAVA_LIST_ARGUMENT_BASE_METHODS: Set<string> = new Set<string>(['toArray', 'aggregate', 'sortBy', 'sortBy2', 'filterBy']);
// the Exchange tier only: PredictionExchange.ts keeps its own boxed slots
const JAVA_BASE_LIST_PARAMETER_FILES = /(^|[\\/])ts[\\/]src[\\/]base[\\/]Exchange(\.nooverloads[^/]*)?\.ts$/;
const JAVA_LIST_ARGUMENT_BASE_FILES = /(^|[\\/])ts[\\/]src[\\/]base[\\/](?:functions[\\/]generic\.ts|Exchange(\.nooverloads[^/]*)?\.ts)$/;

// the hand-written `public String` producers of the base tier a `this.<name> (...)` return
// may print: the safeString* family, decimalToPrecision / numberToString (BaseExchange.java)
// and the string helpers of base/functions/type.ts. Guarded by the resolved signature still
const JAVA_STRING_RETURN_BASE_METHODS: Set<string> = new Set<string>([
    'safeString', 'safeString2', 'safeStringN',
    'safeStringUpper', 'safeStringUpper2', 'safeStringUpperN',
    'safeStringLower', 'safeStringLower2', 'safeStringLowerN',
    'decimalToPrecision', 'numberToString', 'formatNumber', 'implodeParams', 'implodeHostname',
]);
const JAVA_STRING_RETURN_BASE_FILES = /(^|[\\/])ts[\\/]src[\\/]base[\\/](?:functions[\\/](?:type|time)\.ts|Exchange(\.nooverloads[^/]*)?\.ts)$/;

// prediction venues (ts/src/prediction/<id>.ts) live in their own package: their Java base,
// PredictionExchange.java, carries the injected Exchange-tier body (javaTranspiler.ts
// getExchangeTierBody), and the venue chain (abstract/prediction/<id> -> PredictionExchange ->
const JAVA_NATIVE_PARAMETER_PREDICTION_FILES = /(^|\/)ts\/src\/prediction\/[a-z0-9_]+\.ts$/;

const JAVA_BOOLEAN_EXCLUDED_TYPE_FLAGS: number =
    TypeFlags.Any | TypeFlags.Unknown | TypeFlags.Undefined | TypeFlags.Null
    | TypeFlags.Void | TypeFlags.Never | TypeFlags.TypeParameter | TypeFlags.Conditional
    | TypeFlags.Enum | TypeFlags.EnumLiteral;

// the union members a nullable boolean box may hold: `Bool` (`boolean | undefined`) and the
// `boolean | null` spellings. A member of any other family (`Int`, `Str`, `any`) is a box the
// isTrue helper tests with its runtime truthiness, so the helper must stay.
const JAVA_NULLABLE_BOOLEAN_MEMBER_FLAGS: number =
    TypeFlags.Boolean | TypeFlags.BooleanLiteral | TypeFlags.Undefined | TypeFlags.Null
    | TypeFlags.Void;

// the `handle*Bool` accessors route through safeBool, which returns the caller's default untouched
// when the found value is not a Boolean, so element 0 of their `[Bool, Dict]` tuple is a
// Boolean-or-null box. The handleOptionAndParams family returns the raw member and is absent.
const JAVA_BOOLEAN_BOX_TUPLE_METHODS = new Set<string>([
    'handleParamBool',
    'handleParamBool2',
    'handleOptionBoolAndParams',  // element 0 is checkOptionBool's Boolean-or-null (throws otherwise)
    'handleOptionBoolAndParams2',
]);

// the Java printer and its build hooks re-ask the same checker questions about one node,
// type, symbol or signature; answers are fixed per snapshot, so each is one round trip
const JAVA_MEMO_UNDEFINED = Symbol("javaMemoUndefined");
const JAVA_MEMOIZED_METHODS = ["getSignatureFromDeclaration", "isArrayType", "isTupleType", "getAliasedSymbol", "getTypeArguments", "getDeclaredTypeOfSymbol", "getReturnTypeOfSignature", "getSymbolOfType", "getTypeOfSymbolAtLocation", "getSignaturesOfType", "typeToString", "getTypesOfType"];
const JAVA_TYPE_PREFETCH_KINDS = new Set<number>([SyntaxKind.Identifier, SyntaxKind.BinaryExpression, SyntaxKind.Parameter, SyntaxKind.VariableDeclaration, SyntaxKind.StringLiteral, SyntaxKind.MethodDeclaration, SyntaxKind.PropertyAccessExpression, SyntaxKind.ParenthesizedExpression, SyntaxKind.ElementAccessExpression]);
const JAVA_SYMBOL_PREFETCH_KINDS = new Set<number>([SyntaxKind.Identifier]);
// the first lookup in a source file answers every node of the hot kinds in that file in one
// array request, skipping nodes the core prefetch already cached; other kinds go one by one
function prefetchByFile(checker: Checker, name: "getTypeAtLocation" | "getSymbolAtLocation", kinds: Set<number>): void {
    const original = (checker as any)[name] as ((nodes: any) => any) & { has?: (node: Node) => boolean };
    const cache = new WeakMap<Node, unknown>();
    const done = new WeakSet<object>();
    Object.defineProperty(checker, name, { configurable: true, value: (node: any) => {
        if (Array.isArray(node)) {
            return original(node);
        }
        if (cache.has(node)) {
            return cache.get(node);
        }
        const sf = node.getSourceFile?.();
        if (sf !== undefined && !done.has(sf)) {
            done.add(sf);
            const nodes: Node[] = [];
            const visit = (n: Node) => {
                if (kinds.has(n.kind) && !original.has?.(n)) {
                    nodes.push(n);
                }
                n.forEachChild(visit);
            };
            sf.forEachChild(visit);
            if (nodes.length > 0) {
                const results = original(nodes);
                for (let i = 0; i < nodes.length; i++) {
                    cache.set(nodes[i], results[i]);
                }
            }
            if (cache.has(node)) {
                return cache.get(node);
            }
        }
        const result = original(node);
        cache.set(node, result);
        return result;
    } });
}

// getResolvedSignature has no array form: the first lookup in a file pipelines every call
// expression of that file through one batched request (API#batch over the checker's client)
function prefetchResolvedSignatures(checker: Checker): void {
    const original = checker.getResolvedSignature;
    const client = (checker as any).client;
    if (client === undefined) {
        return;
    }
    const cache = new WeakMap<Node, unknown>();
    const done = new WeakSet<object>();
    Object.defineProperty(checker, "getResolvedSignature", { configurable: true, value: (node: any) => {
        if (cache.has(node)) {
            return cache.get(node);
        }
        const sf = node?.getSourceFile?.();
        if (sf !== undefined && !done.has(sf)) {
            done.add(sf);
            const calls: Node[] = [];
            const visit = (n: Node) => {
                if (n.kind === SyntaxKind.CallExpression && !(original as any).has?.(n)) {
                    calls.push(n);
                }
                n.forEachChild(visit);
            };
            sf.forEachChild(visit);
            if (calls.length > 0) {
                const results = API.prototype.batch.call({ client }, ...calls.map((c) => original.gen(c))) as unknown[];
                for (let i = 0; i < calls.length; i++) {
                    cache.set(calls[i], results[i]);
                }
            }
            if (cache.has(node)) {
                return cache.get(node);
            }
        }
        const result = original(node);
        cache.set(node, result);
        return result;
    } });
}

function memoizeJavaCheckerCalls(checker: Checker): Checker {
    if ((checker as any).__javaMemoized) {
        return checker;
    }
    Object.defineProperty(checker, "__javaMemoized", { value: true });
    prefetchByFile(checker, "getTypeAtLocation", JAVA_TYPE_PREFETCH_KINDS);
    prefetchByFile(checker, "getSymbolAtLocation", JAVA_SYMBOL_PREFETCH_KINDS);
    prefetchResolvedSignatures(checker);
    for (const name of JAVA_MEMOIZED_METHODS) {
        const original = (checker as any)[name];
        if (typeof original !== "function") {
            continue;
        }
        const byFirst = new WeakMap<object, Map<string, unknown>>();
        Object.defineProperty(checker, name, { configurable: true, value: (first: any, ...rest: any[]) => {
            if (first === null || (typeof first !== "object" && typeof first !== "function") || rest.some((a) => a !== undefined && typeof a === "object")) {
                return original(first, ...rest);
            }
            let byRest = byFirst.get(first);
            if (byRest === undefined) {
                byRest = new Map();
                byFirst.set(first, byRest);
            }
            const key = rest.length === 0 ? "" : JSON.stringify(rest);
            const cached = byRest.get(key);
            if (cached !== undefined) {
                return cached === JAVA_MEMO_UNDEFINED ? undefined : cached;
            }
            const result = original(first, ...rest);
            byRest.set(key, result === undefined ? JAVA_MEMO_UNDEFINED : result);
            return result;
        } });
    }
    return checker;
}

export class JavaTranspiler extends BaseTranspiler {

    getChecker(): Checker {
        return memoizeJavaCheckerCalls(super.getChecker());
    }

    // override lookups repeat per method on every printed call and hook; the answer is fixed per node
    private methodOverrideCache = new WeakMap<Node, Node | typeof JAVA_MEMO_UNDEFINED>();
    getMethodOverride(node: Node): Node {
        if (node === undefined || node === null) {
            return super.getMethodOverride(node);
        }
        const cached = this.methodOverrideCache.get(node);
        if (cached !== undefined) {
            return cached === JAVA_MEMO_UNDEFINED ? undefined : cached;
        }
        const result = this.javaMethodOverrideFromIndex(node);
        this.methodOverrideCache.set(node, result === undefined ? JAVA_MEMO_UNDEFINED : result);
        return result;
    }

    // BaseTranspiler.getMethodOverride answered from a per-class ancestor chain of
    // name -> last method maps (the furthest ancestor declaring the name wins, as there)
    private overrideChainCache = new WeakMap<Node, Map<string, Node>[] | null>();
    private javaFieldAssignmentKindsCache = new WeakMap<object, Map<string, string[]>>();
    private javaMethodOverrideFromIndex(node: Node): Node {
        const classDeclaration = node.parent;
        if (!isClassDeclaration(classDeclaration) || !(classDeclaration as any).heritageClauses) {
            return undefined;
        }
        let chain = this.overrideChainCache.get(classDeclaration);
        if (chain === undefined) {
            chain = [];
            let parentClass = getAllSuperTypeNodes(classDeclaration)[0];
            while (parentClass !== undefined) {
                const parentClassDecl = this.getChecker().getTypeAtLocation(parentClass)?.getSymbol()?.valueDeclaration?.resolve();
                if (parentClassDecl === undefined) {
                    chain = null; // the base path warns and answers undefined
                    break;
                }
                const byName = new Map<string, Node>();
                for (const elem of (parentClassDecl as any).members ?? []) {
                    if (isMethodDeclaration(elem)) {
                        byName.set(elem.name.getText().trim(), elem);
                    }
                }
                chain.push(byName);
                parentClass = getAllSuperTypeNodes(parentClassDecl)[0] ?? undefined;
            }
            this.overrideChainCache.set(classDeclaration, chain);
        }
        if (chain === null) {
            return super.getMethodOverride(node);
        }
        const name = (node as any).name.text;
        let method = undefined;
        for (const byName of chain) {
            method = byName.get(name) ?? method;
        }
        return method;
    }

    checkerOrUndefined(): Checker | undefined {
        const checker = super.checkerOrUndefined();
        return checker === undefined ? undefined : memoizeJavaCheckerCalls(checker);
    }

    // optional proof of the concrete printed Java type of an expression, installed by the embedding
    // build layer for the locals it retypes (ccxt: build/java-local-types.js); it must match the
    // declared type or the operator will not compile. Only `String` is consumed (native `+` anchor).
    javaExpressionTypeResolver?: (node) => string | undefined;

    // optional proof, installed by the embedding build layer, that a local's final printed declaration
    // is the nullable box `Long <name> = `; consumed only by the `x + <int literal>` null-propagating add.
    javaBoxedLongResolver?: (node) => boolean;

    // the embedding build layer (build/java-local-types.js) installs this: it names the
    // Java type of a local whose printed declaration line it rewrote (`Long`/`Double`).
    // The arithmetic rule reads it for identifier operands only.

    countRequiredParameters(declaration) {
        // parameters with no default, no question token and no rest are required positionally
        return (declaration?.parameters ?? [])
            .filter((p) => p.initializer === undefined && p.questionToken === undefined && p.dotDotDotToken === undefined).length;
    }

    printArgsForCallExpression(node, identation) {
        const fullArity = this.javaFullArityCallArguments(node.arguments ?? [], node, identation);
        if (fullArity !== undefined) {
            return fullArity;
        }
        let args: readonly any[] = node.arguments ?? [];
        const callee = node.expression;
        const isThisCall = callee?.kind === SyntaxKind.PropertyAccessExpression
            && callee.expression?.kind === SyntaxKind.ThisKeyword;
        if (isThisCall && args.length > 0) {
            const last = args[args.length - 1];
            const isNullish = last.kind === SyntaxKind.NullKeyword
                || (last.kind === SyntaxKind.Identifier && last.text === 'undefined');
            // the trailing nullish may only be dropped when it sits in the OPTIONAL tail
            // of the resolved signature - a required positional parameter passed as an
            // explicit undefined (e.g. dydx signDydxTx) must be kept, otherwise the
            // emitted call breaks arity, see https://github.com/ccxt/ccxt/actions/runs/31321542066
            let inOptionalTail = false;
            if (isNullish) {
                const signature = this.getChecker().getResolvedSignature(node);
                const declaration = signature?.declaration?.resolve();
                if (declaration !== undefined) {
                    inOptionalTail = args.length > this.countRequiredParameters(declaration);
                }
            }
            if (isNullish && inOptionalTail) {
                // drop exactly one trailing null/undefined argument: the generated java
                // surface is uniformly (required..., Object... optionals), and a bare
                // trailing null is ambiguous to javac ("non-varargs call of varargs
                // method with inexact argument type for last parameter"). Omission is
                // behaviorally identical - both Helpers.getArg and SafeMethods.opt
                // treat a null varargs array and an empty one the same, see
                // https://github.com/ccxt/ccxt/pull/29617 for the warning inventory
                args = args.slice(0, -1);
            }
        }
        return this.javaPrintCallArguments(args, node, identation);
    }

    // a call into a method whose fixed parameter prints a native type: generated locals are `Object`,
    // so the argument carries the same checkcast as native map/string reads. The checker proved the
    // argument assignable to the parameter, so the declared type describes the value received.
    javaPrintCallArguments(args, node, identation) {
        const superCore = this.javaSuperCoreCallArguments(args, node, identation);
        if (superCore !== undefined) {
            return superCore;
        }
        const scheduled = this.javaScheduledCallArguments(args, node, identation);
        if (scheduled !== undefined) {
            return scheduled;
        }
        const spawnTypes = this.javaSpawnCallParameterTypes(node);
        const parameterTypes = spawnTypes !== undefined ? spawnTypes : this.javaNativeCallParameterTypes(node);
        return args.map((a, i) => {
            const parsedArg = this.printNode(a, identation).trim();
            const type = parameterTypes[i];
            if (type === undefined || this.javaNativeArgumentAlreadyTyped(a, type)) {
                return parsedArg;
            }
            // the checkcast carries its own parentheses: a bare `(T) cond ? a : b` binds the
            // condition, not the whole argument
            return `(${type}) (${parsedArg})`;
        }).join(", ");
    }

    // the implementation declaration of a resolved method (an overload signature has no body)
    javaMethodImplementation(declaration) {
        if (declaration === undefined || !isMethodDeclaration(declaration)) {
            return undefined;
        }
        if (declaration.body !== undefined) {
            return declaration;
        }
        try {
            const symbol = this.getChecker().getSymbolAtLocation(declaration.name);
            return symbol?.declarations?.map((d) => d.resolve()).find((d) => isMethodDeclaration(d) && d.body !== undefined);
        } catch (e) {
            return undefined;
        }
    }

    // a method this printer emits with its single typed signature: hand-written Java declares
    // ts/src/base/** except the base tiers below their transpile delimiter
    javaIsPrintedMethod(method): boolean {
        if (method === undefined || !isMethodDeclaration(method) || method.body === undefined
            || !isClassDeclaration(method.parent)) {
            return false;
        }
        const file = method.getSourceFile();
        const fileName = file.fileName.replace(/\\/g, '/');
        if (!/(^|\/)ts\/src\//.test(fileName)) {
            return true;
        }
        if (JAVA_NATIVE_PARAMETER_BASE_FILES.test(fileName)) {
            const delimiter = file.text.indexOf(JAVA_TRANSPILE_DELIMITER);
            return (delimiter >= 0 && method.pos > delimiter)
                || JAVA_HANDWRITTEN_FULL_ARITY.has((method.name as any)?.text);
        }
        // every class outside the hand-written tiers is printed (exchanges, tests, ...)
        return !JAVA_HANDWRITTEN_TIER_FILES.test(fileName);
    }

    javaHasOptionalParameter(method): boolean {
        return (method?.parameters ?? []).some((p) => p.initializer !== undefined || p.questionToken !== undefined);
    }

    // a call into a printed method with optional parameters passes every parameter: omitted or
    // `undefined` slots take the TS default, fixed slots keep the native checkcast
    javaFullArityCallArguments(args, node, identation): string | undefined {
        const callee = node.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression
            || callee.expression?.kind === SyntaxKind.SuperKeyword) {
            return undefined;
        }
        let method;
        try {
            method = this.javaMethodImplementation(this.getChecker().getResolvedSignature(node)?.declaration?.resolve())
                ?? this.javaAnyReceiverBaseMethod(callee);
        } catch (e) {
            return undefined;
        }
        return this.javaFullArityArguments(method, args, identation);
    }

    // an `any` receiver (the tests' `exchange: any`) compiles against the Java Exchange class:
    // bind the base Exchange method of that name when it is implemented exactly once
    javaAnyReceiverBaseMethod(callee) {
        const type = this.getChecker().getTypeAtLocation(callee.expression);
        if ((type.flags & TypeFlags.Any) === 0) {
            return undefined;
        }
        const methods = this.baseExchangeMethodsByName().get(callee.name?.text as string);
        return methods?.length === 1 ? methods[0] : undefined;
    }

    private _baseExchangeMethodsByName = new WeakMap<object, Map<string, any[]>>();
    baseExchangeMethodsByName(): Map<string, any[]> {
        const program = this.getProgram();
        const cached = this._baseExchangeMethodsByName.get(program);
        if (cached !== undefined) {
            return cached;
        }
        const names = new Map<string, any[]>();
        const fileName = program.getSourceFileNames()
            .find((f) => /(^|[\\/])ts[\\/]src[\\/]base[\\/]Exchange\.ts$/.test(f));
        const file = fileName !== undefined ? program.getSourceFile(fileName) : undefined;
        // the implementations live on BaseExchange; Exchange only adds its own tier, and a name
        // the base class implements binds there (the receiver compiles against BaseExchange)
        for (const className of ['BaseExchange', 'Exchange']) {
            const cls = file?.statements.find((s) => isClassDeclaration(s) && s.name?.text === className) as any;
            const own = new Map<string, any[]>();
            for (const member of cls?.members ?? []) {
                if (isMethodDeclaration(member) && member.body !== undefined && isIdentifier(member.name)) {
                    own.set(member.name.text, (own.get(member.name.text) ?? []).concat([member]));
                }
            }
            own.forEach((methods, key) => names.has(key) || names.set(key, methods));
        }
        this._baseExchangeMethodsByName.set(program, names);
        return names;
    }

    javaFullArityArguments(method, args, identation): string | undefined {
        if (!this.javaIsPrintedMethod(method) || !this.javaHasOptionalParameter(method)) {
            return undefined;
        }
        const params = method.parameters;
        if (args.length > params.length || params.some((p) => p.dotDotDotToken !== undefined)
            || args.some((a) => a.kind === SyntaxKind.SpreadElement)) {
            return undefined;
        }
        const types = this.javaCoreParameterTypes(method);
        return params.map((p, i) => {
            const arg = args[i];
            if (arg === undefined || (p.initializer !== undefined && this.javaIsUndefinedLiteral(arg))) {
                return this.javaCoreDefaultArgument(p, types[i]);
            }
            const printed = this.printNode(arg, identation).trim();
            if (p.initializer !== undefined) {
                return this.javaArgumentHasType(arg, types[i]) || types[i] === 'Object'
                    ? (this.javaIsUndefinedLiteral(arg) ? 'null' : printed)
                    : this.javaConvertToCoreType(types[i], printed, arg);
            }
            const native = this.javaNativeParameterType(p);
            if (native === undefined || this.javaNativeArgumentAlreadyTyped(arg, native)) {
                return printed;
            }
            return `(${native}) (${printed})`;
        }).join(', ');
    }

    javaIsUndefinedLiteral(node): boolean {
        return node?.kind === SyntaxKind.Identifier && node.text === 'undefined';
    }

    // `this.spawn(this.m, a..)` / `this.delay(ms, this.m, a..)`: the ccxt post-pass turns the
    // reference into a lambda calling `this.m(a..)`, so those arguments take m's full arity
    javaScheduledCallArguments(args, node, identation): string | undefined {
        const callee = node.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression
            || callee.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const at = callee.name?.text === 'spawn' ? 0 : (callee.name?.text === 'delay' ? 1 : -1);
        const reference = at >= 0 ? args[at] : undefined;
        if (reference?.kind !== SyntaxKind.PropertyAccessExpression
            || reference.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        let method;
        try {
            const symbol = this.getChecker().getSymbolAtLocation(reference.name);
            method = this.javaMethodImplementation(symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve());
        } catch (e) {
            return undefined;
        }
        const forwarded = this.javaFullArityArguments(method, args.slice(at + 1), identation);
        if (forwarded === undefined) {
            return undefined;
        }
        const head = args.slice(0, at + 1).map((a) => this.printNode(a, identation).trim());
        return head.concat(forwarded.length > 0 ? [forwarded] : []).join(', ');
    }

    // `super.x(..)` into a split method must bind the typed core: an ancestor bridge re-dispatches
    // through `this`, which lands back in the overriding core (infinite recursion)
    javaSuperCoreCallArguments(args, node, identation): string | undefined {
        const callee = node.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression
            || callee.expression?.kind !== SyntaxKind.SuperKeyword) {
            return undefined;
        }
        let declaration;
        try {
            declaration = this.javaMethodImplementation(this.getChecker().getResolvedSignature(node)?.declaration?.resolve());
        } catch (e) {
            return undefined;
        }
        if (declaration === undefined || !this.hasDefaultedTail(declaration)) {
            return undefined;
        }
        const params = (declaration as any).parameters;
        if (params.some((p) => p.dotDotDotToken !== undefined)) {
            return undefined;
        }
        if (args.length > params.length) {
            return undefined;
        }
        const types = this.javaCoreParameterTypes(declaration);
        return params.map((p, i) => (i < args.length
            ? (this.javaArgumentHasType(args[i], types[i]) ? this.printNode(args[i], identation).trim()
                : this.javaConvertToCoreType(types[i], this.printNode(args[i], identation).trim(), args[i]))
            : this.javaCoreDefaultArgument(p, types[i]))).join(', ');
    }

    // an argument that is a parameter of the enclosing method already printed with this type
    javaArgumentHasType(arg, type: string): boolean {
        if (arg?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        let declaration;
        try {
            declaration = this.getChecker().getSymbolAtLocation(arg)?.valueDeclaration?.resolve();
        } catch (e) {
            return false;
        }
        if (declaration === undefined || !isParameterDeclaration(declaration)) {
            return false;
        }
        const method = declaration.parent;
        if (!isMethodDeclaration(method) && this.ReassignedVars[this.getVarKey(declaration)] && this.isAsyncFunction(method)) {
            return false; // an async function body reads an `Object` copy
        }
        const printed = declaration.initializer !== undefined
            ? (this.hasDefaultedTail(method) ? this.javaOptionalParameterJavaType(declaration) : 'Object')
            : (this.printParameterType(declaration) || 'Object').trim();
        return this.javaErasure(printed) === this.javaErasure(type);
    }

    // the printed Java type of every parameter of a split method's typed core
    javaCoreParameterTypes(method): string[] {
        return method.parameters.map((p) => (p.initializer !== undefined
            ? this.javaOptionalParameterJavaType(p)
            : (this.printParameterType(p) || 'Object').trim()));
    }

    // an omitted parameter of a typed-core call: its TS default, typed like the front's reader
    javaCoreDefaultArgument(param, type: string): string {
        const initializer = param.initializer;
        // a default that reads other parameters or has effects is applied by the callee
        const value = initializer === undefined || !this.isPureInitializer(initializer) ? 'null' : this.printNode(initializer, 0);
        if (value === 'null') {
            return `(${type}) null`;
        }
        if (type === 'Long' && /^-?\d+$/.test(value)) {
            return value + 'L';
        }
        if (type === JAVA_STRING_LIST_TYPE && isArrayLiteralExpression(initializer) && initializer.elements.length === 0) {
            return 'new java.util.ArrayList<String>()';
        }
        if (type === 'Object' || (type === 'String' && isStringLiteralLikeNode(initializer))
            || (type === 'java.util.Map<String, Object>' && isObjectLiteralExpression(initializer))) {
            return value;
        }
        return this.javaConvertToCoreType(type, value, initializer);
    }

    // a value of any static type converted to a typed-core parameter, with the fronts' semantics
    javaConvertToCoreType(type: string, printed: string, node): string {
        if (node?.kind === SyntaxKind.NullKeyword
            || (node?.kind === SyntaxKind.Identifier && node.text === 'undefined')) {
            return `(${type}) null`;
        }
        if (type === 'Object') {
            return `(Object) (${printed})`;
        }
        if (this.javaLocalDeclaredAs(node, printed, type)) {
            return printed;
        }
        if (type === 'Long') {
            if (/^-?\d+$/.test(printed) && isNumericLiteral(isPrefixUnaryExpression(node) ? node.operand : node)) {
                return printed + 'L';
            }
            return /^-?\d+L$/.test(printed) ? printed : `Helpers.toLongOrNull(${printed})`;
        }
        if (type === 'String') {
            return this.javaNativeArgumentAlreadyTyped(node, type) ? printed : `Helpers.toStringArg(${printed})`;
        }
        if (type === 'java.util.Map<String, Object>') {
            return `Helpers.toMapArg(${printed})`;
        }
        if (type === JAVA_STRING_LIST_TYPE) {
            const literal = this.javaStringListLiteral(node);
            return literal !== undefined ? literal : `Helpers.toStringListArg(${printed})`;
        }
        return `(${type}) (${printed})`;
    }

    // `[ 'a', 'b' ]` over proven String elements prints the `List<String>` the core parameter
    // takes; the helper's unchecked cast has nothing left to convert. Any other element (a bare
    // null makes `asList` ambiguous and throws) keeps the helper.
    javaStringListLiteral(node): string | undefined {
        if (!isArrayLiteralExpression(node) || node.elements.some((e) => e.kind === SyntaxKind.SpreadElement)) {
            return undefined;
        }
        const elements = [];
        for (const element of node.elements) {
            if (!this.javaStringListElementIsProven(element)) {
                return undefined;
            }
            elements.push(this.printNode(element, 0));
        }
        return `new java.util.ArrayList<String>(java.util.Arrays.asList(${elements.join(', ')}))`;
    }

    javaStringListElementIsProven(node): boolean {
        if (node === undefined || node.kind === SyntaxKind.NullKeyword
            || (node.kind === SyntaxKind.Identifier && node.text === 'undefined')) {
            return false;
        }
        if (this.javaArgumentHasType(node, 'String')) {
            return true;
        }
        const declared = this.javaDeclaredTypeOf(node);
        if (declared !== undefined && JAVA_DECLARED_STRING_TYPE.test(declared)) {
            return true;
        }
        return this.javaProvableString(node);
    }

    // an identifier whose final Java declaration (the build layer's table, or a natively typed
    // parameter) is exactly the core type and which prints under its own name: no conversion
    javaLocalDeclaredAs(node, printed: string, type: string): boolean {
        if (node === undefined || !isIdentifier(node) || printed !== node.text) {
            return false;
        }
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration)) {
            return this.javaArgumentHasType(node, type)
                && (type !== JAVA_STRING_LIST_TYPE || this.javaDeclaredTypeOf(node) === JAVA_STRING_LIST_TYPE);
        }
        const declared = this.javaDeclaredTypeOf(node);
        return declared !== undefined && declared.replace(/\s+/g, '').replace(/^java\.util\./, '')
            === type.replace(/\s+/g, '').replace(/^java\.util\./, '');
    }

    // Java erasure of a printed type, for override/bridge comparisons
    javaErasure(type: string): string {
        return type.replace(/<.*>/, '').replace(/^java\.util\./, '').trim();
    }

    // An override whose typed core differs from an ancestor's (another parameter count, another
    // default position or type) no longer overrides it in Java: a bridge with the ancestor's
    // signature forwards to this method, so base code calling the ancestor core reaches it.
    printOverrideBridges(node, identation): string {
        const ownTypes = this.javaCoreParameterTypes(node);
        const ownKey = ownTypes.map((t) => this.javaErasure(t)).join(',');
        const seen = new Set<string>();
        let out = '';
        let ancestor;
        try {
            ancestor = this.getMethodOverride(node);
        } catch (e) {
            return '';
        }
        while (ancestor !== undefined) {
            if (this.hasDefaultedTail(ancestor)) {
                const ancestorTypes = this.javaCoreParameterTypes(ancestor);
                const key = ancestorTypes.map((t) => this.javaErasure(t)).join(',');
                if (key !== ownKey && !seen.has(key)) {
                    seen.add(key);
                    out += this.printOverrideBridge(node, ancestor, ancestorTypes, ownTypes, identation);
                }
            }
            try {
                ancestor = this.getMethodOverride(ancestor);
            } catch (e) {
                ancestor = undefined;
            }
        }
        return out;
    }

    printOverrideBridge(node, ancestor, ancestorTypes: string[], ownTypes: string[], identation): string {
        const name = this.transformMethodNameIfNeeded(node.name.text);
        const ancestorNames = ancestor.parameters.map((p) => this.printNode(p.name, 0));
        const ancestorDef = this.printMethodDefinition(ancestor, identation,
            () => ancestorTypes.map((t, i) => `${t} ${ancestorNames[i]}`).join(', '));
        const forwarded = node.parameters.map((p, i) => (i < ancestorNames.length
            ? (this.javaErasure(ownTypes[i]) === this.javaErasure(ancestorTypes[i]) ? ancestorNames[i]
                : this.javaConvertToCoreType(ownTypes[i], ancestorNames[i], undefined))
            : this.javaCoreDefaultArgument(p, ownTypes[i]))).join(', ');
        const call = `this.${name}(${forwarded})`;
        const returnOf = (def: string) => def.match(/(?:public|protected|private)\s+(?:static\s+)?(.+?)\s+\w+\s*\(/)?.[1]?.trim() ?? 'Object';
        const returnType = returnOf(ancestorDef);
        const ownReturn = returnOf(this.printMethodDefinition(node, identation, () => ''));
        const body = returnType === 'void' ? `${call};`
            : returnType === ownReturn ? `return ${call};` : `return (${returnType}) (Object) ${call};`;
        return "\n" + ancestorDef + this.getBlockOpen(identation)
            + this.getIden(identation + 1) + body
            + this.getBlockClose(identation);
    }

    // `this.spawn(this.someMethod, args...)`: the spawned work executes `this.someMethod(args)`
    // (the ccxt post-pass rewrites the reference into a lambda), so the arguments belong to the
    // referenced method's signature, not to spawn's `...args` - each one carries the checkcast
    javaSpawnCallParameterTypes(node): (string | undefined)[] | undefined {
        const callee = node.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression
            || callee.expression?.kind !== SyntaxKind.ThisKeyword
            || callee.name?.text !== 'spawn') {
            return undefined;
        }
        const reference = (node.arguments ?? [])[0];
        if (reference?.kind !== SyntaxKind.PropertyAccessExpression
            || reference.expression?.kind !== SyntaxKind.ThisKeyword
            || reference.name?.text === undefined) {
            return undefined;
        }
        let declaration;
        try {
            const symbol = this.getChecker().getSymbolAtLocation(reference.name);
            declaration = symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve();
        } catch (e) {
            return undefined;
        }
        const parameters = (declaration as any)?.parameters;
        if (parameters === undefined) {
            return undefined;
        }
        return (node.arguments ?? []).map((a, i) => {
            if (i === 0) {
                return undefined;
            }
            const param = parameters[i - 1];
            if (param === undefined || !isParameterDeclaration(param)) {
                return undefined;
            }
            return this.javaNativeParameterType(param);
        });
    }

    // the argument is a literal (or a String the embedding build layer's resolver proves)
    // and the parameter declares exactly that type, so no cast is needed. Every other
    // argument prints from a local the printer declares `Object`, and needs the checkcast.
    javaNativeArgumentAlreadyTyped(arg, type: string) {
        if (arg.kind === SyntaxKind.NullKeyword) {
            return true;
        }
        // an object literal prints a `HashMap<String, Object>` instance, already a Map
        if (type === JAVA_NATIVE_RETURN_MAP_TYPE && isObjectLiteralExpression(arg)) {
            return true;
        }
        // a parameter the printer itself declares as this very class needs no checkcast; a local
        // keeps it: its declaration text is rewritten after printing, so what prints here as
        // `Object` would not accept the argument
        if (THIS_WS_ORDERBOOK_TYPE.test(type) && arg.kind === SyntaxKind.Identifier) {
            const declaration = this.javaDeclarationOfIdentifier(arg);
            if (declaration !== undefined && isParameterDeclaration(declaration)
                && this.javaNativeParameterType(declaration) === type) {
                return true;
            }
        }
        if (type === JAVA_NATIVE_RETURN_LIST_TYPE && this.javaPrintsListArgument(arg)) {
            return true;
        }
        if (type !== 'String') {
            return false;
        }
        if (isStringLiteralLikeNode(arg)) {
            return true;
        }
        return this.javaProvableString(arg);
    }

    // the native printed type of each argument position of a call, when the resolved
    // signature declares that parameter natively
    javaNativeCallParameterTypes(node): (string | undefined)[] {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return [];
        }
        const declaration = checker.getResolvedSignature(node)?.declaration?.resolve();
        const parameters = (declaration as any)?.parameters;
        if (parameters === undefined) {
            return [];
        }
        return (node.arguments ?? []).map((a, i) => {
            const param = parameters[i];
            if (param === undefined || !isParameterDeclaration(param)) {
                return undefined;
            }
            return this.javaNativeParameterType(param);
        });
    }

    binaryExpressionsWrappers;

    varListFromObjectLiterals = {};
    // binary operators whose printed Java is a primitive boolean: Helpers.isEqual (and the
    // negated `!Helpers.isEqual` / `<` / `>` / `<=` / `>=` family), Helpers.inOp,
    // Helpers.isInstance and the native `&&` / `||`
    javaBooleanOperators = Array.from(JAVA_BOOLEAN_OPERATOR_KINDS);
    // Per-function analysis results. Populated by analyzeFinalVars at the start of
    // printFunctionBody and consumed during printing of the same function body.
    usageToFinalName: WeakMap<Node, string> = new WeakMap();
    // Stack of emitted-finalName sets, one entry per enclosing block. Pushed on block
    // entry, popped on exit. Used by buildFinalVarDeclarations to dedup: skip if the
    // finalName is already in scope via any ancestor.
    finalVarScopeStack: Array<Set<string>> = [];
    // Identifiers rewritten in place to their finalXxx name during the current emit.
    // The parsed ts.SourceFile is cached and reused across transpile calls, so the
    // rewrite has to be undone when the emit ends — otherwise a second emit of the
    // same file reads `finalX` where the first read `x`, the symbol no longer
    // resolves, and the hoisted `final Object finalX = x;` declaration is dropped
    // while its usages remain.
    finalVarMutations: Array<{ node: any; text: any; ownGetFullText: boolean; getFullText: any }> = [];
    // Java expression passed as the second supplyAsync argument for async methods.
    // Empty (the default) emits the single-argument, common-pool supplyAsync form.
    asyncExecutor = '';
    // Static method emitted in place of java.util.concurrent.CompletableFuture.supplyAsync
    // for async methods. The callee owns the executor choice, so no second argument is emitted.
    asyncSupplier = '';

    constructor(config = {}) {
        config["parser"] = Object.assign({}, parserConfig, config["parser"] ?? {});
        super(config);

        this.requiresParameterType = true;
        this.requiresReturnType = true;
        this.asyncTranspiling = true;
        this.implicitAsyncTranspiling = true;
        this.supportsFalsyOrTruthyValues = false;
        this.requiresCallExpressionCast = true;
        this.id = "Java";

        this.initConfig();
        this.applyUserOverrides(config);
        this.asyncExecutor = config['asyncExecutor'] ?? '';
        this.asyncSupplier = config['asyncSupplier'] ?? '';
    }

    initConfig() {
        this.LeftPropertyAccessReplacements = {
            // 'this': '$this',
        };

        this.RightPropertyAccessReplacements = {
            // Java list/string methods (lowerCamelCase)
            push: "add",
            indexOf: "indexOf",
            toUpperCase: "toUpperCase",
            toLowerCase: "toLowerCase",
            toString: "toString",
        };

        this.FullPropertyAccessReplacements = {
            "JSON.parse": "parseJson",
            "console.log": "System.out.println",
            "Number.MAX_SAFE_INTEGER": "Long.MAX_VALUE",
            "Math.min": "Math.min",
            "Math.max": "Math.max",
            "Math.log": "Math.log",
            "Math.abs": "Math.abs",
            "Math.floor": "Math.floor",
            "Math.pow": "Math.pow",
            // 'Promise.all' handled via promiseAll wrapper
        };

        this.CallExpressionReplacements = {
            'parseInt': "Helpers.parseInt",
            "parseFloat": "Helpers.parseFloat",
            // Add ad-hoc function call rewrites here if you need them
        };


        this.ReservedKeywordsReplacements = {
            string: "str",
            object: "obj",
            params: "parameters",
            // base: "bs",
            internal: "intern",
            event: "eventVar",
            fixed: "fixedVar",
            final: "finalVar",
            native: "nativeVar",
            // add Java keywords if you need to avoid collisions (e.g., enum, assert)
        };

        this.VariableTypeReplacements = {
            string: "String",
            Str: "String",
            number: "double",
            Int: "long",
            Num: "double",
            Dict: "java.util.Map<String, Object>",
            Strings: "java.util.List<String>",
            List: "java.util.List<Object>",
            boolean: "boolean",
            object: "Object",
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

    getBlockOpen(identation) {
        return "\n" + this.getIden(identation) + this.BLOCK_OPENING_TOKEN + "\n";
    }


    getCustomClassName(node) {
        return this.capitalize(node.name.text);
    }

    getClassModifier(node) {
        return "public ";
    }

    printSuperCallInsideConstructor(_node, _identation) {
        // Java allows "super(...)" as the first line; we already inject it when needed.
        return "";
    }

    printNumericLiteral(node) {
        const javaMax = 2147483647;
        const nodeText = node.text;
        if (Number(nodeText) > javaMax && Number.isInteger(Number(nodeText)) && node.text.indexOf('e') === -1) {
            return `${nodeText}L`;
        }
        return node.text;
    }

    printIdentifier(node) {
        let idValue = node.text ?? node.text;

        if (this.ReservedKeywordsReplacements[idValue]) {
            idValue = this.ReservedKeywordsReplacements[idValue];
        }

        if (idValue === "undefined") {
            return this.UNDEFINED_TOKEN;
        }

        const defaulted = this.javaDefaultedLocalName(node);
        if (defaulted !== undefined) {
            return defaulted;
        }

        // keep the same class-reference typeof-guarding logic as your original file,
        // but run the syntactic (parent-position) checks first: they exclude the vast
        // majority of identifiers without paying for a type-checker lookup
        const isInsideNewExpression =
            node?.parent?.kind === SyntaxKind.NewExpression;
        const isInsideCatch =
            node?.parent?.kind === SyntaxKind.ThrowStatement;
        const isLeftSide =
            node?.parent?.name === node || node?.parent?.left === node;
        const isCallOrPropertyAccess =
            node?.parent?.kind === SyntaxKind.PropertyAccessExpression ||
            node?.parent?.kind === SyntaxKind.ElementAccessExpression;
        if (!isLeftSide && !isCallOrPropertyAccess && !isInsideCatch && !isInsideNewExpression) {
            const type = this.getChecker().getTypeAtLocation(node);
            const typeSymbol = type?.getSymbol?.();
            if (typeSymbol !== undefined) {
                const decl = (typeSymbol?.declarations ?? []).map((d) => d.resolve());
                if (decl.length > 0 && decl[0].getSourceFile().fileName.indexOf("typescript") === -1) {
                    const symbol = this.getChecker().getSymbolAtLocation(node);
                    const first = symbol?.declarations[0]?.resolve();
                    const isClassDeclaration = !!symbol && (first.kind === SyntaxKind.ClassDeclaration
                        || (first.kind === SyntaxKind.ImportSpecifier
                            && this.getChecker().getAliasedSymbol(symbol)?.declarations[0]?.resolve()?.kind === SyntaxKind.ClassDeclaration));
                    if (isClassDeclaration) {
                        return `${idValue}.class`;
                    }
                }
            }
        }

        return this.transformIdentifier(node, idValue);
    }

    // ── typed ws handler tables (hx10w5-J06) ────────────────────────────────────
    // `const methods = { 'ticker': this.handleTicker }; const method = this.safeValue (methods, topic);
    //  method.call (this, client, message)`: the table and its single read are proven together, so the
    // literal prints method references and the call prints a virtual call instead of reflection.
    javaHandlerTables: Map<any, any> = new Map();
    javaHandlerCalls: Map<any, any> = new Map();
    javaHandlerReads: Set<string> = new Set();
    javaHandlerScannedFile: any = undefined;

    // a node key that survives `symbol.valueDeclaration.resolve()` (which may hand back a copy)
    javaHandlerKey(node) {
        return `${node.getSourceFile()?.fileName}:${node.getStart()}:${node.getEnd()}`;
    }

    // `this.<name>` naming a 2-arg (Client, message) handler, as the java method name, else undefined
    javaHandlerMethod(reference) {
        if (!isPropertyAccessExpression(reference) || reference.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        let symbol;
        try {
            symbol = checker.getSymbolAtLocation(reference.name);
        } catch (e) {
            return undefined;
        }
        const declaration: any = symbol?.valueDeclaration?.resolve();
        if (declaration === undefined || !isMethodDeclaration(declaration) || declaration.body === undefined) {
            return undefined;
        }
        if ((declaration.modifiers ?? []).some((modifier) => modifier.kind === SyntaxKind.StaticKeyword)) {
            return undefined;
        }
        const parameters: any = declaration.parameters ?? [];
        if (parameters.length !== 2) {
            return undefined;
        }
        const types = parameters.map((parameter, index) => this.javaHandlerSlotType(parameter, index === 0 ? 'client' : 'message'));
        if (types[0] !== 'Client' || types[1] !== 'Map<String, Object>') {
            return undefined;
        }
        const name = this.printNode(reference.name, 0).trim();
        return name === reference.name.text ? name : undefined;
    }

    // the Java type a handler-slot parameter prints, or undefined when a box would reach the interface.
    // The ws post-pass retypes a `client` parameter (`(Object client,` -> `(Client client,`); the
    // message slot must already print the dict, since nothing rewrites it later.
    javaHandlerSlotType(parameter, position) {
        if (parameter === undefined || !isParameterDeclaration(parameter) || parameter.initializer !== undefined) {
            return undefined;
        }
        const printed = (this.printParameterType(parameter) || 'Object').trim();
        if (position === 'client') {
            if (printed === 'Client') {
                return 'Client';
            }
            const name = parameter.name !== undefined && (parameter.name as any).text;
            return printed === 'Object' && name === 'client' ? 'Client' : undefined;
        }
        return this.javaErasure(printed) === this.javaErasure('java.util.Map<String, Object>')
            ? 'Map<String, Object>' : undefined;
    }

    // every value of the literal is a `this.<handler>` reference, so it can hold method references
    javaHandlerTableEntries(literal) {
        const entries: any[] = [];
        for (const property of literal.properties) {
            if (!isPropertyAssignment(property) || !isStringLiteralLikeNode(property.name)) {
                return undefined;
            }
            const handler = this.javaHandlerMethod(property.initializer);
            if (handler === undefined) {
                return undefined;
            }
            entries.push({ key: property.name.text, name: handler });
        }
        return entries;
    }

    // the enclosing method body (or the file) a table and its reads live in
    javaHandlerScopeOf(node) {
        let current = node.parent;
        while (current !== undefined) {
            if (isMethodDeclaration(current) || current.kind === SyntaxKind.FunctionDeclaration
                || current.kind === SyntaxKind.FunctionExpression || current.kind === SyntaxKind.ArrowFunction) {
                return current.body ?? current;
            }
            current = current.parent;
        }
        return node.getSourceFile();
    }

    // every read of the declaration in that scope; undefined if the checker cannot place one
    javaHandlerReferences(scope, name) {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        let symbol;
        try {
            symbol = checker.getSymbolAtLocation(name);
        } catch (e) {
            return undefined;
        }
        if (symbol === undefined) {
            return undefined;
        }
        const references: any[] = [];
        let failed = false;
        const visit = (current) => {
            if (current === undefined || failed) {
                return;
            }
            if (isIdentifier(current) && current !== name && current.text === name.text) {
                let other;
                try {
                    other = checker.getSymbolAtLocation(current);
                } catch (e) {
                    other = undefined;
                }
                if (other === undefined) {
                    failed = true;
                    return;
                }
                if (other === symbol) {
                    references.push(current);
                }
            }
            current.forEachChild(visit);
        };
        visit(scope);
        return failed ? undefined : references;
    }

    // the table is read only as the first argument of `this.safeValue (methods, key)`
    javaIsHandlerTableRead(call, read) {
        return call !== undefined && isCallExpression(call) && call.arguments?.[0] === read
            && isPropertyAccessExpression(call.expression)
            && call.expression.name?.text === 'safeValue'
            && call.expression.expression?.kind === SyntaxKind.ThisKeyword;
    }

    // the local a table read is bound to: its declaration, or the plain write that reassigns it
    javaHandlerBoundName(call) {
        let node = call;
        let parent = call.parent;
        while (parent !== undefined && (parent.kind === SyntaxKind.ParenthesizedExpression
            || parent.kind === SyntaxKind.ConditionalExpression)) {
            if (parent.kind === SyntaxKind.ConditionalExpression) {
                const other = parent.whenTrue === node ? parent.whenFalse : parent.whenTrue;
                if (parent.whenTrue !== node && parent.whenFalse !== node) {
                    return undefined;
                }
                if (other === undefined || other.kind !== SyntaxKind.Identifier || other.text !== 'undefined') {
                    return undefined;
                }
            }
            node = parent;
            parent = parent.parent;
        }
        if (parent === undefined) {
            return undefined;
        }
        if (isVariableDeclaration(parent) && parent.initializer === node && isIdentifier(parent.name)) {
            return parent.name;
        }
        if (parent.kind === SyntaxKind.BinaryExpression && parent.operatorToken.kind === SyntaxKind.EqualsToken
            && parent.right === node && isIdentifier(parent.left)) {
            return parent.left;
        }
        return undefined;
    }

    // the table name a `.call` argument or a write reads: a plain `this.safeValue (methods, key)` on that table
    javaIsHandlerReadOf(node, tableName) {
        let current = node;
        while (current !== undefined && (current.kind === SyntaxKind.ParenthesizedExpression
            || current.kind === SyntaxKind.ConditionalExpression)) {
            current = current.kind === SyntaxKind.ConditionalExpression
                ? (current.whenTrue === undefined ? current.whenFalse : current.whenTrue)
                : current.expression;
        }
        const read = current?.kind === SyntaxKind.CallExpression ? current.arguments?.[0] : undefined;
        if (current === undefined || read === undefined || read.kind !== SyntaxKind.Identifier
            || read.text !== tableName.text) {
            return false;
        }
        return this.javaIsHandlerTableRead(current, read);
    }

    // the safeValue result is only bound from that table, `method.call (this, a, b)`-ed and null-tested
    javaIsHandlerCallUse(use, tableName) {
        if (isVariableDeclaration(use.parent) && use.parent.name === use) {
            return true;
        }
        const write = use.parent;
        if (write !== undefined && write.kind === SyntaxKind.BinaryExpression
            && write.operatorToken.kind === SyntaxKind.EqualsToken && write.left === use) {
            return this.javaIsHandlerReadOf(write.right, tableName);
        }
        const access = use.parent;
        if (isPropertyAccessExpression(access) && access.expression === use && access.name?.text === 'call'
            && isCallExpression(access.parent) && access.parent.expression === access) {
            const callArguments: any = access.parent.arguments ?? [];
            return callArguments.length === 3 && callArguments[0].kind === SyntaxKind.ThisKeyword
                && isIdentifier(callArguments[1]) && isIdentifier(callArguments[2])
                && this.javaHandlerArgumentType(callArguments[1], 'client') !== undefined
                && this.javaHandlerArgumentType(callArguments[2], 'message') !== undefined;
        }
        const comparison = use.parent;
        if (comparison === undefined || comparison.kind !== SyntaxKind.BinaryExpression
            || (comparison.left !== use && comparison.right !== use)) {
            return false;
        }
        const other = comparison.left === use ? comparison.right : comparison.left;
        return other !== undefined && other.kind === SyntaxKind.Identifier && other.text === 'undefined';
    }

    // one walk per file: record the tables whose every read is that idiom, keyed by the literal
    // node and by the local that holds the safeValue result
    javaScanHandlerTables(node) {
        const file = node.getSourceFile();
        if (file === undefined || this.javaHandlerScannedFile === file) {
            return;
        }
        this.javaHandlerScannedFile = file;
        if (this.checkerOrUndefined() === undefined) {
            return;
        }
        const declarations: any[] = [];
        const collect = (current) => {
            if (current === undefined) {
                return;
            }
            if (isVariableDeclaration(current)) {
                declarations.push(current);
            }
            current.forEachChild(collect);
        };
        collect(file);
        for (const declaration of declarations) {
            const literal = declaration.initializer;
            if (literal === undefined || !isObjectLiteralExpression(literal) || literal.properties.length === 0
                || !isIdentifier(declaration.name)) {
                continue;
            }
            const entries = this.javaHandlerTableEntries(literal);
            if (entries === undefined) {
                continue;
            }
            const scope = this.javaHandlerScopeOf(declaration);
            if (scope === undefined) {
                continue;
            }
            const reads = this.javaHandlerReferences(scope, declaration.name);
            if (reads === undefined || reads.length === 0) {
                continue;
            }
            const results: Map<string, any> = new Map();
            const readCalls: any[] = [];
            let proven = true;
            for (const read of reads) {
                const call = read.parent;
                if (!this.javaIsHandlerTableRead(call, read)) {
                    proven = false;
                    break;
                }
                readCalls.push(call);
                const bound = this.javaHandlerBoundName(call);
                if (bound === undefined) {
                    proven = false;
                    break;
                }
                results.set(this.javaHandlerKey(bound), bound);
            }
            for (const bound of Array.from(results.values())) {
                if (!proven) {
                    break;
                }
                const uses = this.javaHandlerReferences(scope, bound);
                if (uses === undefined
                    || !uses.every((use) => this.javaIsHandlerCallUse(use, declaration.name))) {
                    proven = false;
                }
            }
            if (!proven) {
                continue;
            }
            this.javaHandlerTables.set(this.javaHandlerKey(literal), entries);
            for (const call of readCalls) {
                this.javaHandlerReads.add(this.javaHandlerKey(call));
            }
            for (const bound of Array.from(results.values())) {
                this.javaHandlerCalls.set(this.javaHandlerKey(bound), entries);
            }
        }
    }

    // the table literal, as a typed map of method references
    printJavaHandlerTable(node, identation) {
        this.javaScanHandlerTables(node);
        const entries = this.javaHandlerTables.get(this.javaHandlerKey(node));
        if (entries === undefined) {
            return undefined;
        }
        const byKey: Map<string, string> = new Map();
        for (const entry of entries) {
            byKey.set(entry.key, entry.name); // the last duplicate key wins, as in the object literal
        }
        const keys = Array.from(byKey.keys());
        const entryIndent = this.getIden(identation + 1);
        const className = this.capitalize(this.currentClassName);
        const parts: string[] = [];
        for (const key of keys) {
            // a qualified this: the map body is an anonymous subclass, where `this` is the map
            parts.push(`${entryIndent}put(${JSON.stringify(key)}, ${className}.this::${byKey.get(key)});`);
        }
        // a HashMap (not Map.ofEntries): the helper's null key answers null, an immutable map's throws
        return `new java.util.HashMap<String, ${JAVA_HANDLER_INTERFACE}>() {{\n${parts.join('\n')}\n${this.getIden(identation)}}}`;
    }

    // the Java type a safeValue read of a proven table prints: the handler interface
    printJavaHandlerRead(node) {
        if (!isCallExpression(node) || !this.javaHandlerReads.has(this.javaHandlerKey(node))) {
            return undefined;
        }
        const table = this.printNode(node.arguments[0], 0).trim();
        const key = this.printNode(node.arguments[1], 0).trim();
        // safeValue's map branch with a null key answers null; HashMap.get does the same
        return `${table}.get(${key})`;
    }

    // the declared Java type of the table local or of the local bound to one of its reads
    javaHandlerDeclarationType(declaration) {
        const initializer = declaration?.initializer;
        if (initializer === undefined || !isIdentifier(declaration.name)) {
            return undefined;
        }
        this.javaScanHandlerTables(initializer);
        if (this.javaHandlerTables.has(this.javaHandlerKey(initializer))) {
            return JAVA_HANDLER_TABLE_TYPE;
        }
        if (this.javaHandlerReads.has(this.javaHandlerKey(initializer))) {
            return JAVA_HANDLER_INTERFACE;
        }
        return undefined;
    }

    // the java type the interface takes for a `.call` argument, or undefined when the box cannot hold it
    javaHandlerArgumentType(node, position) {
        if (node === undefined || !isIdentifier(node)) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        let declaration;
        try {
            declaration = checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        } catch (e) {
            return undefined;
        }
        if (declaration === undefined || !isParameterDeclaration(declaration)) {
            return undefined;
        }
        // the slot this argument fills in the emitted signature: no cast, the printer only passes
        // operands whose declared type already is the interface's
        return this.javaHandlerSlotType(declaration, position);
    }

    // the `.call` argument, already the interface slot's type
    javaHandlerCallArgument(node, position) {
        if (this.javaHandlerArgumentType(node, position) === undefined) {
            return undefined;
        }
        return this.printNode(node, 0).trim();
    }

    printJavaHandlerDispatch(node) {
        if (!isCallExpression(node)) {
            return undefined;
        }
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee) || callee.name?.text !== 'call' || !isIdentifier(callee.expression)) {
            return undefined;
        }
        const receiver = callee.expression;
        const callArguments: any = node.arguments ?? [];
        if (callArguments.length !== 3 || callArguments[0].kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        this.javaScanHandlerTables(node);
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        let symbol;
        try {
            symbol = checker.getSymbolAtLocation(receiver);
        } catch (e) {
            return undefined;
        }
        const declaration: any = symbol?.valueDeclaration?.resolve();
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name === undefined
            || !this.javaHandlerCalls.has(this.javaHandlerKey(declaration.name))) {
            return undefined;
        }
        const client = this.javaHandlerCallArgument(callArguments[1], 'client');
        const message = this.javaHandlerCallArgument(callArguments[2], 'message');
        if (client === undefined || message === undefined) {
            return undefined;
        }
        const receiverText = this.printNode(receiver, 0).trim();
        // the local is declared as the interface type (javaHandlerDeclarationType), so no checkcast
        return `${receiverText}.handle(${client}, ${message})`;
    }

    printConstructorDeclaration(node, identation) {
        const classNode = node.parent;
        const className = this.printNode(classNode.name, 0);
        const args = this.printMethodParameters(node);
        const constructorBody = this.printFunctionBody(node, identation);

        // find super call inside constructor and extract params
        let superCallParams = "";
        let hasSuperCall = false;
        node.body?.statements.forEach((statement) => {
            const expression = isExpressionStatement(statement) ? statement.expression : undefined;
            if (expression && isCallExpression(expression) && expression.expression.getText().trim() === "super") {
                hasSuperCall = true;
                superCallParams = expression.arguments.map((a) => this.printNode(a, identation).trim()).join(", ");
            }
        });

        const header = this.getIden(identation) + className + "(" + args + ")";
        // In Java, super(...) must be the first statement inside the body.
        return header + (hasSuperCall ? this.injectLeadingInBody(constructorBody, `super(${superCallParams});`) : constructorBody);
    }

    injectLeadingInBody(body, firstLine) {
        // body is "{\n  ...\n}"
        const lines = body.split("\n");
        if (lines.length >= 2) {
            lines.splice(1, 0, this.getIden(1) + firstLine);
        }
        return lines.join("\n");
    }

    printDynamicCall(node, identation) {
        // Use reflection helper exactly like before; Java runtime should provide callDynamically(Object, String, Object[])
        const elementAccess = node.expression;
        if (elementAccess?.kind === SyntaxKind.ElementAccessExpression) {
            const parsedArg = node.arguments?.map((n) => this.printNode(n, identation).trimStart()).join(", ") ?? "";
            const target = this.printNode(elementAccess.expression, 0);
            const propName = this.printNode(elementAccess.argumentExpression, 0);
            return `${this.DYNAMIC_CALL_OPEN}${target}, ${propName}, new Object[] { ${parsedArg} })`;
        }
        return undefined;
    }

    // printElementAccessExpressionExceptionIfAny(node) {
    //     const tsKind = ts.SyntaxKind;
    //     if (node.expression.kind === tsKind.CallExpression) {
    //         const callExp = node.expression;
    //         const calleeText = callExp.expression.getText();
    //         if (calleeText.endsWith('.split') || calleeText.toLowerCase().includes('split')) {
    //             // print Split call normally (should already close with ))
    //             let splitCall = this.printNode(callExp, 0).trim();
    //             if (!splitCall.endsWith(')')) {
    //                 splitCall += ')';
    //             }
    //             const idxArg = this.printNode(node.argumentExpression, 0);
    //             return `GetValue(${splitCall}, ${idxArg})`;
    //         }
    //     }
    //     // default: no exception
    //     return undefined;
    // }

    printWrappedUnknownThisProperty(node) {
        const type = this.getChecker().getResolvedSignature(node);
        if (type?.declaration === undefined) {
            const parsedArguments = node.arguments?.map((a) => this.printNode(a, 0)).join(", ") || "";
            const propName = node.expression?.name.text;
            return `${this.DYNAMIC_CALL_OPEN}this, "${propName}", new Object[] { ${parsedArguments} })`;
        }
        return undefined;
    }

    printOutOfOrderCallExpressionIfAny(node, identation) {
        const handlerRead = this.printJavaHandlerRead(node);
        if (handlerRead !== undefined) {
            return handlerRead;
        }
        const handlerDispatch = this.printJavaHandlerDispatch(node);
        if (handlerDispatch !== undefined) {
            return handlerDispatch;
        }
        if (node.expression.kind === SyntaxKind.Identifier) {
            const callee = node.expression.text;
            if (callee === 'parseInt' || callee === 'parseFloat') {
                const nativeParse = this.printNativeScalarParse(node, callee);
                if (nativeParse !== undefined) {
                    return nativeParse;
                }
                const typedParse = this.printStringTypedParse(node, callee);
                if (typedParse !== undefined) {
                    return typedParse;
                }
            }
        }
        if (node.expression.kind === SyntaxKind.PropertyAccessExpression) {
            const handoff = this.printOptionsHandoffRead(node);
            if (handoff !== undefined) {
                return handoff;
            }
            const expressionText = node.expression.getText().trim();
            const args = node.arguments;
            if (args.length === 1) {
                const parsedArg = this.printNode(args[0], 0);
                switch (expressionText) {
                case "Math.abs":
                    return `Helpers.mathAbs(Double.parseDouble(${this.javaStringBoxText(args[0], parsedArg)}))`;
                }
            } else if (args.length === 2) {
                const parsedArg1 = this.printNode(args[0], 0);
                const parsedArg2 = this.printNode(args[1], 0);
                switch (expressionText) {
                case "Math.min":
                case "Math.max": {
                    const native = this.printNativeMathMinMax(
                        node, args[0], args[1], parsedArg1, parsedArg2, expressionText === "Math.min" ? "min" : "max");
                    if (native !== undefined) {
                        return native;
                    }
                    const wrapper = expressionText === "Math.min" ? "Helpers.mathMin(" : "Helpers.mathMax(";
                    return `${wrapper}${parsedArg1}, ${parsedArg2})`;
                }
                case "Math.pow":
                    // both arguments are Double.parseDouble results, so Helpers.mathPow always
                    // takes its Number branch and returns the same double java.lang.Math.pow does
                    return `Math.pow(Double.parseDouble(${this.javaStringBoxText(args[0], parsedArg1)}), Double.parseDouble(${this.javaStringBoxText(args[1], parsedArg2)}))`;
                }
            }
            const leftSide = node.expression?.expression;
            const leftSideText = leftSide ? this.printNode(leftSide, 0) : undefined;

            // wrap unknown property this.X calls
            if (
                leftSideText === this.THIS_TOKEN ||
                leftSide.getFullText().indexOf("(this as any)") > -1
            ) {
                const res = this.printWrappedUnknownThisProperty(node);
                if (res) return res;
            }
        }

        // dynamic call: obj[prop](...)
        if (node.expression.kind === SyntaxKind.ElementAccessExpression) {
            return this.printDynamicCall(node, identation);
        }

        return undefined;
    }

    handleTypeOfInsideBinaryExpression(node, _identation) {
        const left = node.left;
        const right = node.right.text;
        const op = node.operatorToken.kind;
        const expression = left.expression;

        const isDifferentOperator =
            op === SyntaxKind.ExclamationEqualsEqualsToken ||
            op === SyntaxKind.ExclamationEqualsToken;
        const notOperator = isDifferentOperator ? this.NOT_TOKEN : "";

        const target = this.printNode(expression, 0);
        switch (right) {
        case "string":
            return `${notOperator}(${target} instanceof String)`;
        case "number":
            return `${notOperator}(${target} instanceof Long || ${target} instanceof Integer || ${target} instanceof Float || ${target} instanceof Double)`;
        case "boolean":
            return `${notOperator}(${target} instanceof Boolean)`;
        case "object":
            return `${notOperator}(${target} instanceof java.util.Map)`;
        case "function":
            // no universal Function type in Java; treat as any Method/Callable
            return `${notOperator}(${target} instanceof java.util.concurrent.Callable)`;
        }
        return undefined;
    }

    getVarMethodIfAny(node) {
        // should return the name of the method this node belongs to, if any;
        // the raw AST name is enough here — the result is only used as a scoping
        // key, and printNode on an identifier consults the type checker
        let current = node?.parent;
        while (current) {
            if (isMethodDeclaration(current) || isFunctionDeclaration(current)) {
                return String((current.name as any)?.text ?? '');
            }
            current = current.parent;
        }
        return 'outsideAnyMethod';
    }

    getVarClassIfAny(node) {
        // should return the name of the class this node belongs to, if any;
        // raw AST name for the same reason as getVarMethodIfAny
        let current = node?.parent;
        while (current) {
            if (isClassDeclaration(current)) {
                return String((current.name as any)?.text ?? '');
            }
            current = current.parent;
        }
        return '';
    }

    getVarKey(node) {
        const varName = node?.text ?? node?.name?.text;
        if (!varName) {
            return '';
        }
        return `${this.getVarClassIfAny(node)}-${this.getVarMethodIfAny(node)}-${varName}`;
    }

    // Static operand family of one side of an equality, undefined when the checker proves
    // nothing usable. Null/undefined union members are folded away: Objects.equals handles
    // those exactly like the helper, so `string | undefined` still counts as string.
    equalityOperandFamily(type: any): string | undefined {
        if (type === undefined || type === null) {
            return undefined;
        }
        const flags = type.flags;
        if (flags & TypeFlags.Intersection) {
            return undefined;
        }
        if (flags & TypeFlags.Union) {
            // `boolean` is itself the union true|false and carries the Boolean bit
            if (flags & TypeFlags.Boolean) {
                return 'boolean';
            }
            const families = new Set<string>((type.getTypes?.() ?? []).map((t) => this.equalityOperandFamily(t)));
            families.delete(undefined as any);
            families.delete('null');
            return families.size === 1 ? families.values().next().value : undefined;
        }
        if (flags & (TypeFlags.String | TypeFlags.StringLiteral)) {
            return 'string';
        }
        if (flags & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) {
            return 'boolean';
        }
        if (flags & (TypeFlags.Null | TypeFlags.Undefined | TypeFlags.Void)) {
            return 'null';
        }
        return undefined;
    }

    // The null/undefined literal: its Java text is `null`, so Objects.equals(x, null)
    // is literally the identity test Helpers.isEqual performs on that operand.
    isNullishLiteral(node): boolean {
        return node?.kind === SyntaxKind.NullKeyword
            || (node?.kind === SyntaxKind.Identifier && node.text === 'undefined');
    }

    // ---- numeric operand kinds (java-15) ----
    // Helpers.isEqual compares numeric operands by value (integers via toLong, Double/Float via
    // toDouble, class mismatch false), so two operands of the SAME kind compare natively.

    // the Java kind a decimal numeric literal prints with: integer literal as `N` (int) or `NL` (long),
    // a '.'/exponent literal as a Java double. TypeScript normalizes the literal text (`1e3` -> `1000`,
    // `0x10` -> `16`, `100.0` -> `100`), so node.text is exactly what prints.
    javaEqualityLiteralKind(node) {
        if (!node) {
            return undefined;
        }
        // `-1`: the printer prints the sign in front of the literal, so the value is a Java
        // primitive of the operand's own kind — only an int-range operand keeps it (a long
        // literal would print with its own `L` suffix and the sign would not widen)
        if (node.kind === SyntaxKind.PrefixUnaryExpression && node.operator === SyntaxKind.MinusToken) {
            return this.javaIntegerLiteralKind(node.operand) === 'int' ? 'int' : undefined;
        }
        if (!isNumericLiteral(node)) {
            return undefined;
        }
        return /[.eE]/.test(node.text) ? 'double' : this.javaIntegerLiteralKind(node);
    }

    // `x.length` on a checker-proven String/List receiver prints a native int
    // (((String)x).length() / ((List<?>)x).size(), see javaLengthKind). Every other
    // receiver prints Helpers.getArrayLength, whose value is not an int.
    javaNativeLengthKind(node) {
        if (node?.kind !== SyntaxKind.PropertyAccessExpression || node.name.text !== 'length') {
            return undefined;
        }
        return this.javaLengthKind(node.expression) !== undefined ? 'int' : undefined;
    }

    // `for (var i = <int literal>; ...; i++)`: javac infers a primitive int counter, so
    // every read of it — not only the loop condition the comparison rule sees — is a
    // native int. ++/-- keep it int and the counter cannot hold another box.
    isJavaPrimitiveCounterReference(node) {
        if (!node || node.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const checker = this.getChecker();
        const symbol = checker.getSymbolAtLocation(node);
        const declaration: any = symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve();
        if (!declaration || declaration.kind !== SyntaxKind.VariableDeclaration || !isIdentifier(declaration.name)) {
            return false;
        }
        const list = declaration.parent;
        const forStatement: any = list?.parent;
        if (!list || !forStatement || forStatement.kind !== SyntaxKind.ForStatement || forStatement.initializer !== list) {
            return false;
        }
        if (list.declarations?.length !== 1 || this.javaIntegerLiteralKind(declaration.initializer) === undefined) {
            return false;
        }
        const incrementor = forStatement.incrementor;
        if (!incrementor
            || (incrementor.kind !== SyntaxKind.PostfixUnaryExpression && incrementor.kind !== SyntaxKind.PrefixUnaryExpression)
            || (incrementor.operator !== SyntaxKind.PlusPlusToken && incrementor.operator !== SyntaxKind.MinusMinusToken)
            || incrementor.operand?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const incrementorSymbol = checker.getSymbolAtLocation(incrementor.operand);
        return incrementorSymbol === undefined || symbol === undefined || incrementorSymbol === symbol;
    }

    // the box a printed local carries: the kind of its declaration's initializer, kept
    // only while every write in the declaring function writes the same kind (D2 scan).
    // A `const` declaration has no write to scan.
    javaLocalNumberKind(node, depth) {
        if (!node || node.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const symbol = this.getChecker().getSymbolAtLocation(node);
        const declaration: any = symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve();
        if (!declaration || declaration.kind !== SyntaxKind.VariableDeclaration || !isIdentifier(declaration.name)) {
            return undefined;
        }
        const kind = this.javaPrintedNumberKind(declaration.initializer, depth + 1);
        if (kind === undefined) {
            return undefined;
        }
        const isConst = (declaration.parent?.flags & NodeFlags.Const) !== 0;
        if (!isConst && !this.javaWritesKeepNumberKind(declaration, symbol, kind)) {
            return undefined;
        }
        return kind;
    }

    // true when every assignment to the symbol inside its function writes the same
    // numeric kind; a compound assignment (`x += 1` prints Helpers.add) changes the box.
    javaWritesKeepNumberKind(declaration, symbol, kind) {
        const owner = this.enclosingFunctionLike(declaration);
        if (owner === undefined) {
            return false;
        }
        let safe = true;
        const visit = (node) => {
            if (!safe) {
                return;
            }
            if (isBinaryExpression(node)) {
                const op = node.operatorToken.kind;
                if (this.isAssignmentOperator(op) && this.expressionReferencesSymbol(node.left, symbol)) {
                    if (op !== SyntaxKind.EqualsToken || this.javaPrintedNumberKind(node.right, 0) !== kind) {
                        safe = false;
                        return;
                    }
                }
            } else if ((node.kind === SyntaxKind.ForOfStatement || node.kind === SyntaxKind.ForInStatement)
                && this.expressionReferencesSymbol(node.initializer, symbol)) {
                safe = false;
                return;
            } else if ((isPrefixUnaryExpression(node) || isPostfixUnaryExpression(node))
                && (node.operator === SyntaxKind.PlusPlusToken || node.operator === SyntaxKind.MinusMinusToken)
                && kind !== 'int' && this.expressionReferencesSymbol(node.operand, symbol)) {
                safe = false;
                return;
            }
            node.forEachChild(visit);
        };
        owner.forEachChild(visit);
        return safe;
    }

    expressionReferencesSymbol(node, symbol): boolean {
        if (node === undefined || symbol === undefined) {
            return false;
        }
        let found = false;
        const visit = (child) => {
            if (found) {
                return;
            }
            if (child.kind === SyntaxKind.Identifier && this.getChecker().getSymbolAtLocation(child) === symbol) {
                found = true;
                return;
            }
            child.forEachChild(visit);
        };
        visit(node);
        return found;
    }

    enclosingFunctionLike(node) {
        let current = node?.parent;
        while (current) {
            if (isFunctionLike(current)) {
                return current;
            }
            current = current.parent;
        }
        return undefined;
    }

    // box/primitive kind of an operand the printer prints as a native number, or undefined
    // when the printed value could be any box (a call, a parameter, an `any` local)
    javaPrintedNumberKind(node, depth = 0) {
        const literalKind = this.javaEqualityLiteralKind(node);
        if (literalKind !== undefined) {
            return literalKind;
        }
        const lengthKind = this.javaNativeLengthKind(node);
        if (lengthKind !== undefined) {
            return lengthKind;
        }
        if (this.isJavaPrimitiveCounterReference(node)) {
            return 'int';
        }
        const arithmeticKind = this.javaNativeArithmeticKind(node);
        if (arithmeticKind !== undefined) {
            return arithmeticKind;
        }
        return depth < 2 ? this.javaLocalNumberKind(node, depth) : undefined;
    }

    // numeric equality operand: the checker proves a plain number and the printed Java
    // value carries a known kind. Aliases (Int/Num), unions and `any` stay with the
    // helper, like in the arithmetic rule.
    javaEqualityNumberKind(node) {
        if (this.javaScalarFamily(node) !== 'number') {
            return undefined;
        }
        return this.javaPrintedNumberKind(node);
    }

    // ==/===/!=/!== become java.util.Objects.equals once the checker proves one operand is
    // a string, a boolean or the null/undefined literal: for those Helpers.isEqual reduces
    // to Objects.equals (value compare, class-strict, no numeric promotion). Two operands
    // the checker types as plain numbers compare natively when their printed Java kinds
    // match (java-15): the helper's numeric paths are the same value compare.
    printNativeEqualityIfProvable(node, leftText: string, rightText: string): string | undefined {
        const op = node.operatorToken.kind;
        const negated = op === SyntaxKind.ExclamationEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken;
        if (!negated && op !== SyntaxKind.EqualsEqualsToken && op !== SyntaxKind.EqualsEqualsEqualsToken) {
            return undefined;
        }
        const checker = this.getChecker();
        const leftFamily = this.equalityOperandFamily(checker?.getTypeAtLocation(node.left));
        const rightFamily = this.equalityOperandFamily(checker?.getTypeAtLocation(node.right));
        const leftProved = leftFamily !== undefined && (leftFamily !== 'null' || this.isNullishLiteral(node.left));
        const rightProved = rightFamily !== undefined && (rightFamily !== 'null' || this.isNullishLiteral(node.right));
        const equalCall = `${negated ? '!' : ''}java.util.Objects.equals(${leftText}, ${rightText})`;
        // a declared Java String on either side: a String never equals a non-String, and
        // Objects.equals carries the same null answer, so the class-strict compare is the
        // helper's own String branch for every other operand.
        if (leftProved || rightProved || this.javaDeclaredStringType(node.left) || this.javaDeclaredStringType(node.right)) {
            return equalCall;
        }
        // both operands print a Java numeric primitive (literals, `.length`, index/search results, for
        // counters, native arithmetic): neither can be null, so the operator is the helper's value compare
        // on the two boxes (never a boxed Double, whose equals would separate -0.0).
        if (this.javaOperandPrintsPrimitiveNumber(node.left) && this.javaOperandPrintsPrimitiveNumber(node.right)) {
            return `(${leftText} ${negated ? '!=' : '=='} ${rightText})`;
        }
        // java-15: two checker-typed plain numbers whose printed Java values carry the same
        // kind (two primitives returned above); a box compares with
        // Objects.equals, whose class the kind pins to the box the helper would compare.
        const leftKind = this.javaEqualityNumberKind(node.left);
        const rightKind = this.javaEqualityNumberKind(node.right);
        if (leftKind !== undefined && leftKind === rightKind) {
            // a boxed double compares through Double.equals, which separates -0.0 from 0.0
            // where the helper's toDouble compare does not: doubles stay native only as
            // primitives (there the native operator is the same value compare)
            if (leftKind !== 'double') {
                return equalCall;
            }
        }
        // a numeric operand the pass declared Long/Double/Integer/int/long/double: the box
        // is unboxed by the operator (numeric compare, exactly the helper's toLong/toDouble
        // path) and a boxed declaration is null-tested first, which the helper answers false.
        const leftDeclared = this.javaDeclaredNumericFamily(node.left);
        const rightDeclared = this.javaDeclaredNumericFamily(node.right);
        if (leftDeclared !== undefined || rightDeclared !== undefined) {
            const leftOk = leftDeclared !== undefined || this.javaOperandPrintsPrimitiveNumber(node.left);
            const rightOk = rightDeclared !== undefined || this.javaOperandPrintsPrimitiveNumber(node.right);
            if (leftOk && rightOk) {
                const boxes: string[] = [];
                if (leftDeclared !== undefined && JAVA_BOXED_NUMERIC_TYPES.has(leftDeclared)) {
                    boxes.push(leftText);
                }
                if (rightDeclared !== undefined && JAVA_BOXED_NUMERIC_TYPES.has(rightDeclared)) {
                    boxes.push(rightText);
                }
                const compare = `${leftText} ${negated ? '!=' : '=='} ${rightText}`;
                if (boxes.length === 0) {
                    return `(${compare})`;
                }
                // a boxed declaration can hold null, which the helper answers false for; the
                // negated comparison therefore has to accept the null arm instead of testing it
                return negated
                    ? `(${boxes.map((box) => `${box} == null`).join(' || ')} || ${compare})`
                    : `(${boxes.map((box) => `${box} != null`).join(' && ')} && ${compare})`;
            }
        }
        return undefined;
    }

    // true when the printer prints the operand as a Java primitive (a decimal literal, a
    // native .length/.size(), a for counter or a nested native arithmetic node) rather
    // than as the Object-declared box every other local gets
    javaOperandPrintsPrimitiveNumber(node): boolean {
        return this.javaEqualityLiteralKind(node) !== undefined
            || this.javaNativeLengthKind(node) !== undefined
            || this.isJavaPrimitiveCounterReference(node)
            || this.javaNativeArithmeticKind(node) !== undefined
            // `.length` on a receiver whose Java text the printer does not prove is still
            // the int-returning Helpers.getArrayLength; indexOf/search print int helpers
            || this.javaPrimitiveOperandKind(node) !== undefined;
    }

    // the numeric family the pass declared for a local (`Long`/`Double`/`Integer` boxed,
    // `int`/`long`/`double` primitive), undefined when nothing was declared or the declared
    // type is not numeric
    javaDeclaredNumericFamily(expression): string | undefined {
        const type = this.javaDeclaredTypeOf(expression)?.trim();
        return type !== undefined && JAVA_DECLARED_NUMERIC_TYPES.has(type) ? type : undefined;
    }

    // `x[k] = v` prints the runtime helper by default. Helpers.addElementToObject
    // exists for receivers the printer cannot type (Lists, arbitrary objects via
    // reflection) and for ConcurrentHashMap null-removal, so the native Map.put is
    // printed only when the checker excludes all of those.
    elementWriteTargetsMap(container, base, keys, value): boolean {
        const lastKey = keys[keys.length - 1];
        if (!isStringLiteral(lastKey) && !this.isJavaStringType(this.getChecker().getTypeAtLocation(lastKey))) {
            return false; // Map.put takes the String key; every other key prints as Object
        }
        if (isPropertyAccessExpression(base) && base.expression.kind === SyntaxKind.ThisKeyword) {
            return false; // field maps are ConcurrentHashMaps (a null value must remove, not put) and other threads read them
        }
        if (this.isPlainHashMapReceiver(container, keys)) {
            return true; // a HashMap the code created holds a null value like the helper does
        }
        // any other Map may be a ConcurrentHashMap, which rejects a null value the helper removes
        return this.isDictionaryType(container) && !this.elementWriteValueMayBeNull(value);
    }

    // true unless the checker proves the written value is never null/undefined
    elementWriteValueMayBeNull(value): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined || value === undefined) {
            return true;
        }
        if (this.javaFreshMapLocalValue(value)) {
            return false;
        }
        const type = checker.getTypeAtLocation(value);
        const parts: any[] = (type.flags & TypeFlags.Union) ? (type.getTypes?.() ?? []) : [type];
        const nullable = TypeFlags.Any | TypeFlags.Unknown | JAVA_NULLISH_TYPE_FLAGS | TypeFlags.TypeParameter;
        return parts.length === 0 || parts.some((t) => (t.flags & nullable) !== 0);
    }

    // an identifier bound once to a fresh map (object literal, two-argument extend, this.account()) and
    // never reassigned: it holds that map on every path, so the written value is never null
    javaFreshMapLocalValue(value): boolean {
        const node = this.unwrapPrintTransparentExpression(value);
        if (node === undefined || !isIdentifier(node)) {
            return false;
        }
        const declaration: any = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined || declaration.kind !== SyntaxKind.VariableDeclaration || !declaration.initializer
            || !this.javaElementWriteMapSource(declaration.initializer)) {
            return false;
        }
        return !this.javaLocalIsReassigned(node, (rhs) => this.javaElementWriteMapSource(rhs));
    }

    // a key proven by the checker to be a string prints as a java String: the read is
    // the same expression, only the key needs the (String) cast the typed put demands
    elementWriteKeyText(key, keyText: string): string {
        return isStringLiteral(key) ? keyText : `(String)${keyText}`;
    }

    // Receivers that are a plain java.util.HashMap at runtime, where ".put" and the helper's map branch
    // are the same write: a local initialized with an object literal or a call whose every return is
    // such a literal (this.account()). Lists, class instances and ConcurrentHashMaps stay helpers.
    isPlainHashMapReceiver(container, keys: any[]): boolean {
        if (keys.length !== 1 || container === undefined || container.kind !== SyntaxKind.Identifier) {
            return false; // only a direct write on the proven local, no read in between
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(container);
        const declaration: any = symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve();
        if (!declaration || declaration.kind !== SyntaxKind.VariableDeclaration || !declaration.initializer) {
            return false; // parameters and receivers without an initializer stay the helper
        }
        if (!this.javaFreshHashMapValue(container, declaration.initializer)) {
            return false;
        }
        // every later `x = rhs` must hand the local another fresh map too (D2)
        return !this.javaLocalIsReassigned(container, (rhs) => this.javaFreshHashMapValue(container, rhs));
    }

    // a value that is a freshly built HashMap/LinkedHashMap on the Java side
    javaFreshHashMapValue(container, value): boolean {
        const initializer = this.unwrapPrintTransparentExpression(value);
        return initializer !== undefined && (isObjectLiteralExpression(initializer)
            || (isCallExpression(initializer) && this.callAlwaysReturnsPlainHashMap(initializer, 0))
            || (this.javaDeclaredMapReceiver(container)
                && (this.javaFreshExtendMap(initializer) || this.javaFreshMapBaseCall(initializer))));
    }

    // `this.account()` on the hand-written base builds a new HashMap per call, so the result is a
    // plain map no other owner holds. A venue override prints its own signature and is not provable.
    javaFreshMapBaseCall(node): boolean {
        if (node === undefined || !isCallExpression(node) || node.arguments.length !== 0
            || !isPropertyAccessExpression(node.expression)
            || node.expression.expression.kind !== SyntaxKind.ThisKeyword
            || !JAVA_FRESH_MAP_BASE_CALLS.has(node.expression.name.text)) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        const fileName = checker?.getResolvedSignature(node)?.declaration?.resolve()?.getSourceFile?.()?.fileName;
        return typeof fileName === 'string' && JAVA_THIS_RETURN_TYPES_BASE_FILE.test(fileName);
    }

    // the map type a local the printer itself feeds a fresh plain map prints with: its element
    // writes then bind the native put, and (a fresh HashMap holds a null like the helper does) a
    // null value needs no helper. Only the shapes whose Java print IS `Map<String, Object>`.
    javaElementWriteMapLocalType(declaration): string | undefined {
        if (!isVariableDeclaration(declaration) || !isIdentifier(declaration.name) || !declaration.initializer) {
            return undefined;
        }
        const name = declaration.name;
        if (!this.javaElementWriteMapSource(declaration.initializer)) {
            return undefined;
        }
        if (this.javaLocalHasWriteAtAll(name)) {
            return undefined; // the declaration-typing layer casts a later write of an Object local
        }
        return JAVA_ELEMENT_WRITE_MAP_TYPE;
    }

    // `Object x = this.<field>` where the hand-written base declares that field
    // `Map<String, Object>`: binding the local to the field's own type makes its element reads
    // bind the accessor with no cast. Only a local nothing writes and nothing consumes as
    // another Java type may carry it, or javac rejects the declaration's own uses.
    javaBaseMapFieldLocalType(declaration): string | undefined {
        if (!isVariableDeclaration(declaration) || !isIdentifier(declaration.name) || !declaration.initializer) {
            return undefined;
        }
        const initializer = this.unwrapPrintTransparentExpression(declaration.initializer);
        if (!isPropertyAccessExpression(initializer)
            || initializer.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        if (!JAVA_DECLARED_MAP_FIELD_NAMES.has(String(initializer.name?.text))) {
            return undefined;
        }
        if (this.javaLocalHasWriteAtAll(declaration.name)) {
            return undefined; // a later write hands the local another type (the build layer casts it)
        }
        if (!this.javaLocalUsesKeepContainerType(declaration.name)) {
            return undefined;
        }
        return JAVA_ELEMENT_WRITE_MAP_TYPE;
    }

    // RF-java-2: `const x = Object.values(..)` with no other write prints the helper's exact return type
    // `const x = Object.keys(this.<BaseExchange Map field>)` prints the null-guarded key copy
    // (printNativeBaseMapFieldKeys), a fresh ArrayList, so the same List<Object> local applies.
    javaObjectValuesLocalType(declaration): string | undefined {
        if (!isVariableDeclaration(declaration) || !isIdentifier(declaration.name) || !declaration.initializer) {
            return undefined;
        }
        const init = this.unwrapPrintTransparentExpression(declaration.initializer);
        if (init === undefined || !isCallExpression(init) || !isPropertyAccessExpression(init.expression)
            || !isIdentifier(init.expression.expression) || init.expression.expression.text !== 'Object'
            || init.arguments.length !== 1) {
            return undefined;
        }
        const method = init.expression.name.text;
        const arg = init.arguments[0];
        if (method === 'keys' ? !(isPropertyAccessExpression(arg) && this.printNativeBaseMapFieldKeys(arg) !== undefined) : method !== 'values') {
            return undefined;
        }
        if (this.javaLocalHasWriteAtAll(declaration.name)) {
            return undefined;
        }
        return 'List<Object>';
    }

    // a json object box: the generic `Dictionary<T>` of ts/src/base/types.ts (so `Dict` and
    // `Dictionary<Dictionary<..>>`): an object type with a string index signature and no numeric one.
    // Arrays, tuples, DTOs, primitives, unions and the named typed views that extend it (Balances,
    // Tickers, ..., which own a typed print) all decline.
    javaJsonBoxType(type): boolean {
        if (type === undefined || type === null || !((type.flags as number) & TypeFlags.Object)) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        try {
            if (checker.isArrayType(type) || checker.isTupleType(type)) {
                return false;
            }
            const symbol: any = (type as any).getSymbol?.();
            const declaration: any = symbol?.declarations?.[0]?.resolve();
            if (symbol?.escapedName !== 'Dictionary'
                || !/(^|[\\/])ts[\\/]src[\\/]base[\\/]types\.ts$/.test(declaration?.getSourceFile?.()?.fileName ?? '')) {
                return false;
            }
            return checker.getIndexTypeOfType(type, IndexKind.String) !== undefined
                && checker.getIndexTypeOfType(type, IndexKind.Number) === undefined;
        } catch (e) {
            return false;
        }
    }

    // How the identifier at `node` is used. 'element' = the printed Java is a native get/put on the
    // local; 'neutral' = a property NAME, not a read of the local; 'value' = a position that takes the
    // box as an Object (return, copy, the value of an element write); 'other' = any use that would see
    // the local's new static type (argument, receiver, comparison, delete, spread, call of an element)
    javaBoxUseVerdict(node): 'element' | 'neutral' | 'value' | 'other' {
        const parent: any = node.parent;
        if (parent === undefined || parent === null) {
            return 'other';
        }
        if (isPropertyAccessExpression(parent) && parent.name === node) {
            return 'neutral';
        }
        if ((parent.kind === SyntaxKind.ReturnStatement && parent.expression === node)
            || (parent.kind === SyntaxKind.VariableDeclaration && parent.initializer === node)
            || (parent.kind === SyntaxKind.BinaryExpression && parent.right === node
                && parent.operatorToken?.kind === SyntaxKind.EqualsToken)) {
            return 'value';
        }
        if (isElementAccessExpression(parent) && parent.expression === node) {
            const grand: any = parent.parent;
            if (grand?.kind === SyntaxKind.DeleteExpression || isSpreadElement(grand) || isSpreadAssignment(grand)
                || (isCallExpression(grand) && grand.expression === parent)) {
                return 'other';
            }
            // a numeric / counter key takes the printer's LIST arm, which a Map box cannot honour
            const key: any = parent.argumentExpression;
            return key !== undefined && (isStringLiteralLikeNode(key) || isIdentifier(key)) ? 'element' : 'other';
        }
        return 'other';
    }

    // every use of the local in its function is an element access (at least one), so declaring it a
    // Map cannot rebind any call in the file through the new static type
    javaBoxLocalUsedOnlyAsElements(nameNode): boolean {
        const checker: any = this.checkerOrUndefined();
        const symbol = checker?.getSymbolAtLocation(nameNode);
        if (symbol === undefined) {
            return false;
        }
        let scope: any = nameNode.parent;
        while (scope && !isFunctionLike(scope)) {
            scope = scope.parent;
        }
        if (!scope) {
            return false;
        }
        let uses = 0;
        let ok = true;
        const walk = (current) => {
            if (!ok || current === undefined) {
                return;
            }
            if (current !== nameNode && isIdentifier(current) && current.text === nameNode.text
                && checker.getSymbolAtLocation(current) === symbol) {
                const verdict = this.javaBoxUseVerdict(current);
                if (verdict === 'element') {
                    uses++;
                } else if (verdict === 'other') {
                    ok = false;
                    return;
                }
            }
            current.forEachChild(walk);
        };
        scope.forEachChild(walk);
        return ok && uses > 0;
    }

    // `const x = await this.m(..)` / `[a, b] = this.m(..)` slot: the awaited / tuple-element TS type is
    // a json object box and the local is only element-accessed. The erased `.join()` / list `get` needs
    // the checkcast the declaration carries.
    javaCheckedBoxLocalType(declaration): string | undefined {
        if (declaration === undefined) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        if (isVariableDeclaration(declaration) && isIdentifier(declaration.name) && declaration.initializer?.kind === SyntaxKind.AwaitExpression) {
            const call: any = this.unwrapParenthesesOnly((declaration.initializer as any).expression);
            if (!isCallExpression(call) || !isPropertyAccessExpression(call.expression)
                || (call.expression.expression.kind !== SyntaxKind.ThisKeyword
                    && call.expression.expression.kind !== SyntaxKind.SuperKeyword)) {
                return undefined;
            }
            let type;
            try {
                type = checker.getTypeAtLocation(declaration.initializer);
            } catch (e) {
                return undefined;
            }
            return this.javaJsonBoxType(type) && this.javaBoxLocalUsedOnlyAsElements(declaration.name)
                ? JAVA_ELEMENT_WRITE_MAP_TYPE : undefined;
        }
        if (declaration.kind === SyntaxKind.BindingElement && isIdentifier(declaration.name)
            && declaration.dotDotDotToken === undefined && declaration.initializer === undefined) {
            const pattern: any = declaration.parent;
            const owner: any = pattern?.parent;
            if (pattern?.kind !== SyntaxKind.ArrayBindingPattern || owner === undefined || !isVariableDeclaration(owner)
                || owner.name !== pattern || owner.initializer === undefined) {
                return undefined;
            }
            const call: any = this.unwrapParenthesesOnly(owner.initializer);
            if (!isCallExpression(call)) {
                return undefined;
            }
            let element;
            try {
                const type = checker.getTypeAtLocation(call);
                if (!checker.isTupleType(type)) {
                    return undefined;
                }
                const arguments_ = checker.getTypeArguments(type);
                if (arguments_ === undefined || arguments_.length !== pattern.elements.length) {
                    return undefined;
                }
                element = arguments_[pattern.elements.indexOf(declaration)];
            } catch (e) {
                return undefined;
            }
            return this.javaJsonBoxType(element) && this.javaBoxLocalUsedOnlyAsElements(declaration.name)
                ? JAVA_ELEMENT_WRITE_MAP_TYPE : undefined;
        }
        return undefined;
    }

    javaCheckedBoxLocalTypeCache: WeakMap<Node, string | typeof JAVA_MEMO_UNDEFINED> = new WeakMap();

    javaCheckedBoxLocalTypeCached(declaration): string | undefined {
        if (declaration === undefined) {
            return undefined;
        }
        const cached = this.javaCheckedBoxLocalTypeCache.get(declaration);
        if (cached !== undefined) {
            return cached === JAVA_MEMO_UNDEFINED ? undefined : cached;
        }
        let type;
        try {
            type = this.javaCheckedBoxLocalType(declaration);
        } catch (e) {
            type = undefined;
        }
        this.javaCheckedBoxLocalTypeCache.set(declaration, type ?? JAVA_MEMO_UNDEFINED);
        return type;
    }

    unwrapParenthesesOnly(node): any {
        let current = node;
        while (current !== undefined && isParenthesizedExpression(current)) {
            current = current.expression;
        }
        return current;
    }

    // every other mention of the local must be a read a `Map<String, Object>` declaration leaves
    // unchanged: an element-access receiver, a call argument, a return value, an assignment's
    // right-hand side, a comparison or a container element. A cast, a method call, a spread or a
    // for-of loop on it prints code that only compiles for the box.
    javaLocalUsesKeepContainerType(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol === undefined) {
            return false;
        }
        let scope: any = node;
        while (scope && !isFunctionLike(scope) && !isSourceFile(scope)) {
            scope = scope.parent;
        }
        if (!scope) {
            return false;
        }
        let safe = true;
        const walk = (current) => {
            if (!safe || current === undefined) {
                return;
            }
            if (isIdentifier(current) && current !== node && checker.getSymbolAtLocation(current) === symbol) {
                if (!this.javaContainerNeutralIdentifierUse(current)) {
                    safe = false;
                    return;
                }
            }
            current.forEachChild(walk);
        };
        scope.forEachChild(walk);
        return safe;
    }

    javaContainerNeutralIdentifierUse(node): boolean {
        const parent: any = node.parent;
        if (parent === undefined) {
            return false;
        }
        switch (parent.kind) {
        case SyntaxKind.ElementAccessExpression:
            return parent.expression === node;
        case SyntaxKind.CallExpression:
        case SyntaxKind.NewExpression:
            return parent.arguments !== undefined && parent.arguments.includes(node);
        case SyntaxKind.ReturnStatement:
            return true;
        case SyntaxKind.BinaryExpression:
            return parent.operatorToken.kind === SyntaxKind.EqualsToken ? parent.right === node : true;
        case SyntaxKind.VariableDeclaration:
            return parent.initializer === node;
        case SyntaxKind.ArrayLiteralExpression:
        case SyntaxKind.ParenthesizedExpression:
        case SyntaxKind.ConditionalExpression:
        case SyntaxKind.PrefixUnaryExpression:
            return true;
        default:
            return false;
        }
    }

    // any write at all - plain, compound, or a destructuring target - keeps the local on the type
    // the build layer assigned it: it casts the write of an Object local and rewrites a destructuring
    // hand-back into a raw element read, both of which need the box
    javaLocalHasWriteAtAll(node): boolean {
        const symbol = this.getChecker().getSymbolAtLocation(node);
        if (symbol === undefined) {
            return true;
        }
        let scope: any = node;
        while (scope && !isFunctionLike(scope) && !isSourceFile(scope)) {
            scope = scope.parent;
        }
        if (!scope) {
            return true;
        }
        let wrote = false;
        const walk = (current) => {
            if (wrote || current === undefined) {
                return;
            }
            if (current.kind === SyntaxKind.BinaryExpression
                && current.operatorToken.kind >= SyntaxKind.FirstAssignment
                && current.operatorToken.kind <= SyntaxKind.LastAssignment) {
                const left = current.left;
                if (isIdentifier(left) && this.getChecker().getSymbolAtLocation(left) === symbol) {
                    wrote = true;
                    return;
                }
                if (!isIdentifier(left) && !isElementAccessExpression(left) && !isPropertyAccessExpression(left)
                    && this.javaPatternBindsSymbol(left, symbol)) {
                    wrote = true;
                    return;
                }
            }
            if ((isForOfStatement(current) || isForInStatement(current))
                && isIdentifier(current.initializer)
                && this.getChecker().getSymbolAtLocation(current.initializer) === symbol) {
                wrote = true;
                return;
            }
            current.forEachChild(walk);
        };
        walk(scope);
        return wrote;
    }

    // fresh-map values whose Java print carries `Map<String, Object>`: an object literal, the
    // base-tier extend/deepExtend (declared `java.util.Map<String, Object>`), `this.account()`
    javaElementWriteMapSource(value): boolean {
        const node = this.unwrapPrintTransparentExpression(value);
        if (node === undefined) {
            return false;
        }
        return isObjectLiteralExpression(node) || this.javaFreshExtendMap(node) || this.javaFreshMapBaseCall(node);
    }

    // a value whose Java print can never be null: non-null literals and fresh containers
    javaPrintsNonNullValue(node): boolean {
        const value = this.unwrapPrintTransparentExpression(node);
        if (value === undefined) {
            return false;
        }
        return isStringLiteralLikeNode(value) || isNumericLiteral(value)
            || value.kind === SyntaxKind.TrueKeyword || value.kind === SyntaxKind.FalseKeyword
            || isObjectLiteralExpression(value) || isArrayLiteralExpression(value)
            || (isPrefixUnaryExpression(value) && value.operator === SyntaxKind.MinusToken && isNumericLiteral(value.operand));
    }

    // `this.extend(..)` / `this.deepExtend(..)` from the base tier hand back a fresh LinkedHashMap
    // when the call has two arguments (Generic.Extend copies both) or ends in an object literal
    // (deepExtend's last Map argument replaces any earlier non-Map box with a new map)
    javaFreshExtendMap(initializer): boolean {
        if (initializer === undefined || !isCallExpression(initializer)
            || !isPropertyAccessExpression(initializer.expression)
            || initializer.expression.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        const name = initializer.expression.name.text;
        const args = initializer.arguments;
        const last = args.length > 0 ? this.unwrapPrintTransparentExpression(args[args.length - 1]) : undefined;
        const endsInLiteral = last !== undefined && isObjectLiteralExpression(last);
        if (!((name === 'extend' && (args.length === 2 || endsInLiteral)) || (name === 'deepExtend' && endsInLiteral))) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        const fileName = checker?.getResolvedSignature(initializer)?.declaration?.resolve()?.getSourceFile?.()?.fileName;
        return typeof fileName === 'string' && JAVA_FRESH_EXTEND_FILE.test(fileName);
    }

    // the bottom container of `x[k1][k2].. = v` when x is a declared Map / List and k1 is not a
    // string literal: the guarded native read of the element-read families (the literal key is
    // printed by the caller's own arm)
    javaDeclaredChainContainerRead(left, keyCount: number): string | undefined {
        let inner = left;
        for (let i = 1; i < keyCount; i++) {
            inner = inner.expression;
        }
        if (inner === undefined || !isElementAccessExpression(inner) || isStringLiteralLikeNode(inner.argumentExpression)) {
            return undefined;
        }
        const declared = this.javaDeclaredTypeOf(inner.expression);
        if (declared === undefined) {
            return undefined;
        }
        if (JAVA_DECLARED_MAP_TYPES.test(declared)) {
            return this.javaDeclaredMapElementRead(inner);
        }
        if (JAVA_DECLARED_LIST_TYPES.test(declared) && this.javaPrimitiveCounterIndex(inner.argumentExpression)) {
            return this.javaDeclaredListElementRead(inner, true);
        }
        return undefined;
    }

    unwrapPrintTransparentExpression(node): any {
        let current = node;
        while (current && (isParenthesizedExpression(current)
            || isAsExpression(current)
            || isTypeAssertion(current)
            || current.kind === SyntaxKind.NonNullExpression)) {
            current = current.expression;
        }
        return current;
    }

    // Every write of the local in its enclosing function must be the element write
    // itself; an assignment could replace the HashMap with a List or a class instance.
    javaLocalIsReassigned(node, admitsWrite?: (rhs) => boolean): boolean {
        let scope: any = node;
        while (scope && !isFunctionLike(scope) && !isSourceFile(scope)) {
            scope = scope.parent;
        }
        if (!scope) {
            return true;
        }
        const symbol = this.getChecker().getSymbolAtLocation(node);
        let reassigned = false;
        const walk = (current) => {
            if (reassigned || current === undefined) {
                return;
            }
            if (current.kind === SyntaxKind.BinaryExpression
                && current.operatorToken.kind === SyntaxKind.EqualsToken
                && current.left.kind === SyntaxKind.Identifier
                && this.getChecker().getSymbolAtLocation(current.left) === symbol) {
                if (admitsWrite === undefined || !admitsWrite(current.right)) {
                    reassigned = true;
                    return;
                }
            }
            if (current.kind === SyntaxKind.BinaryExpression
                && current.operatorToken.kind >= SyntaxKind.FirstAssignment && current.operatorToken.kind <= SyntaxKind.LastAssignment
                && !isIdentifier(current.left)
                && !isElementAccessExpression(current.left) && !isPropertyAccessExpression(current.left)
                && this.javaPatternBindsSymbol(current.left, symbol)
                && !this.javaDestructuringHandsBackLocal(current, symbol)) {
                reassigned = true; // destructuring assignment `[x, p] = ..`
                return;
            }
            if (current.kind === SyntaxKind.BinaryExpression
                && current.operatorToken.kind !== SyntaxKind.EqualsToken
                && current.operatorToken.kind >= SyntaxKind.FirstAssignment && current.operatorToken.kind <= SyntaxKind.LastAssignment
                && isIdentifier(current.left)
                && this.getChecker().getSymbolAtLocation(current.left) === symbol) {
                reassigned = true; // compound write (`x ??= ..`)
                return;
            }
            if ((isForOfStatement(current) || isForInStatement(current))
                && isIdentifier(current.initializer)
                && this.getChecker().getSymbolAtLocation(current.initializer) === symbol) {
                reassigned = true;
                return;
            }
            current.forEachChild(walk);
        };
        walk(scope);
        return reassigned;
    }

    // `[.., x, ..] = this.m(.., x, ..)` where every return of m is an array literal whose
    // element at x's position is the never-reassigned parameter x was passed to: x keeps its object
    javaDestructuringHandsBackLocal(assignment, symbol): boolean {
        const checker: any = this.getChecker();
        const left = assignment.left;
        const call = this.unwrapPrintTransparentExpression(assignment.right);
        if (!isArrayLiteralExpression(left) || call === undefined || !isCallExpression(call)) {
            return false;
        }
        const index = left.elements.findIndex((e) => isIdentifier(e) && checker.getSymbolAtLocation(e) === symbol);
        if (index < 0 || left.elements.some((e, i) => i !== index && this.javaPatternBindsSymbol(e, symbol))) {
            return false;
        }
        const declaration: any = checker.getResolvedSignature(call)?.declaration?.resolve();
        if (!declaration || !isMethodDeclaration(declaration) || !declaration.body) {
            return false;
        }
        const argIndex = call.arguments.findIndex((a) => isIdentifier(a) && checker.getSymbolAtLocation(a) === symbol);
        const parameter = argIndex >= 0 ? declaration.parameters[argIndex] : undefined;
        if (parameter === undefined || !isIdentifier(parameter.name) || parameter.dotDotDotToken) {
            return false;
        }
        const parameterSymbol = checker.getSymbolAtLocation(parameter.name);
        let returns = 0;
        let proven = true;
        const walk = (n) => {
            if (!proven || n === undefined || (n !== declaration.body && isFunctionLike(n))) {
                return;
            }
            if (isReturnStatement(n)) {
                returns++;
                const value = this.unwrapPrintTransparentExpression(n.expression);
                const element = value !== undefined && isArrayLiteralExpression(value) ? value.elements[index] : undefined;
                proven = element !== undefined && isIdentifier(element) && checker.getSymbolAtLocation(element) === parameterSymbol;
                return;
            }
            n.forEachChild(walk);
        };
        walk(declaration.body);
        if (!proven || returns === 0 || this.javaHandBackVisiting.has(declaration)) {
            return false; // a recursive hand-back chain stays unproven
        }
        this.javaHandBackVisiting.add(declaration);
        try {
            return !this.javaLocalIsReassigned(parameter.name);
        } finally {
            this.javaHandBackVisiting.delete(declaration);
        }
    }

    javaHandBackVisiting = new Set<any>();

    // true when a destructuring target mentions the symbol anywhere
    javaPatternBindsSymbol(pattern, symbol): boolean {
        let found = false;
        const walk = (n) => {
            if (found || n === undefined) {
                return;
            }
            if (isIdentifier(n) && this.getChecker().getSymbolAtLocation(n) === symbol) {
                found = true;
                return;
            }
            n.forEachChild(walk);
        };
        walk(pattern);
        return found;
    }

    // A call whose callee body returns object literals only, so the value it hands
    // back is always a freshly built HashMap on the Java side as well.
    callAlwaysReturnsPlainHashMap(node, depth: number): boolean {
        if (depth > 3) {
            return false;
        }
        const checker: any = this.getChecker();
        let callee: any = this.unwrapPrintTransparentExpression(node.expression);
        if (callee !== undefined && isPropertyAccessExpression(callee)) {
            if (callee.expression.kind !== SyntaxKind.ThisKeyword) {
                return false; // this.<method>() only: another receiver's body is not in this class
            }
            callee = callee.name;
        }
        if (callee === undefined || callee.kind !== SyntaxKind.Identifier) {
            return false;
        }
        let symbol: any;
        try {
            symbol = checker.getSymbolAtLocation(callee);
        } catch (e) {
            return false;
        }
        const declaration: any = symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve();
        if (!declaration || (declaration.kind !== SyntaxKind.MethodDeclaration && declaration.kind !== SyntaxKind.FunctionDeclaration)) {
            return false;
        }
        if (!this.returnTypePrintsAsHashMap(declaration)) {
            return false;
        }
        const body = declaration.body;
        if (!body || !isBlock(body)) {
            return false;
        }
        let plain = true;
        let returns = 0;
        const walk = (current) => {
            if (!plain || current === undefined) {
                return;
            }
            if (isFunctionLike(current) && current !== declaration) {
                return; // a nested closure returns into its own call
            }
            if (isReturnStatement(current)) {
                returns += 1;
                const expression = current.expression;
                if (expression === undefined) {
                    plain = false;
                    return;
                }
                const value = this.unwrapPrintTransparentExpression(expression);
                if (isObjectLiteralExpression(value)) {
                    return;
                }
                if (isCallExpression(value) && this.callAlwaysReturnsPlainHashMap(value, depth + 1)) {
                    return;
                }
                plain = false;
                return;
            }
            current.forEachChild(walk);
        };
        walk(body);
        return plain && returns > 0;
    }

    // the declared return type must not be a class instance (those print as objects)
    // or an array (those print as Lists), so the object-literal returns above are what
    // the caller can rely on
    returnTypePrintsAsHashMap(declaration): boolean {
        try {
            const checker: any = this.getChecker();
            const signature = checker.getSignatureFromDeclaration(declaration);
            const type: any = signature?.getReturnType();
            if (!type || (type.flags & TypeFlags.Object) === 0) {
                return false;
            }
            if (checker.isArrayType(type) || checker.isTupleType(type)) {
                return false;
            }
            const declarations = (type.getSymbol()?.declarations ?? []).map((d) => d.resolve());
            if (declarations.some((d) => d.kind === SyntaxKind.ClassDeclaration)) {
                return false;
            }
            return type.getCallSignatures().length === 0;
        } catch (e) {
            return false;
        }
    }

    isDictionaryType(node): boolean {
        try {
            const checker: any = this.getChecker();
            const type = checker.getTypeAtLocation(node);
            return this.isDictionaryTsType(type, checker, 0);
        } catch (e) {
            return false;
        }
    }

    // A TS dictionary (`{ [key: string]: any }`, i.e. ccxt's Dict) is a Map on every
    // print and run path. Arrays, class instances and unknown types are not, so they
    // keep the helper.
    isDictionaryTsType(type: any, checker: any, depth: number): boolean {
        if (!type || depth > 3) {
            return false;
        }
        const flags: any = type.flags;
        if (flags & TypeFlags.Union) {
            const parts: any[] = type.getTypes?.() ?? [];
            return parts.length > 0 && parts.every((t) => this.isDictionaryTsType(t, checker, depth + 1));
        }
        if (!(flags & TypeFlags.Object)) {
            return false;
        }
        try {
            if (checker.isArrayType(type) || checker.isTupleType(type)) {
                return false;
            }
            return checker.getIndexTypeOfType(type, IndexKind.String) !== undefined;
        } catch (e) {
            return false;
        }
    }

    // -------------------------------------------------------------------
    // helper removal: native emission when the checker proves the printed
    // operand is a Java numeric primitive / List / Map
    // -------------------------------------------------------------------

    // int/long kind of a literal as printNumericLiteral emits it. Fraction and
    // exponent forms are Java doubles and a double can hold NaN, which the
    // comparison helpers order differently (`NaN < x` is true there), so those
    // never become a native comparison.
    javaIntegerLiteralKind(node) {
        if (!node || !isNumericLiteral(node)) {
            return undefined;
        }
        if (/[.eE]/.test(node.text)) {
            return undefined;
        }
        return Number(node.text) > 2147483647 ? 'long' : 'int';
    }

    // A rest parameter is a Java varargs array, not a List, so a List cast on it
    // would throw ClassCastException; simple identifier aliases are followed too.
    isVarargsArrayReference(node, depth = 0) {
        if (!node || depth > 4 || node.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const symbol = this.getChecker().getSymbolAtLocation(node);
        const declaration: any = symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve();
        if (!declaration) {
            return false;
        }
        if (declaration.dotDotDotToken !== undefined) {
            return true;
        }
        const initializer = declaration.initializer;
        if (initializer && isIdentifier(initializer)) {
            return this.isVarargsArrayReference(initializer, depth + 1);
        }
        return false;
    }

    // checker proof that the value is printed as a java.util.List: TS arrays and
    // tuples become ArrayList, ReadonlyArray only adds a readonly modifier
    isJavaListType(type) {
        if (!type) {
            return false;
        }
        const checker = this.getChecker();
        if (checker.isArrayType(type) || checker.isTupleType(type)) {
            return true;
        }
        return (type as any).isTypeReference?.() === true && (type as any).getTarget().getSymbol()?.escapedName === 'ReadonlyArray';
    }

    // `.length` is a Java int for exactly these receivers; every other receiver keeps
    // Helpers.getArrayLength, whose result type is not proven
    javaLengthKind(expression) {
        const type = this.getChecker().getTypeAtLocation(expression);
        if (this.isJavaStringType(type)) {
            return 'String';
        }
        if (this.isJavaListValueType(type) && !this.isVarargsArrayReference(expression)) {
            return 'List';
        }
        // a nullish union member cannot take a bare `.size()`/`.length()`, but the
        // guard below answers 0 for null exactly like the helper, and only a bare
        // identifier keeps the receiver evaluate-once
        if (isIdentifier(expression)) {
            if (this.isJavaNullishUnion(type, (member) => this.isStringType(member.flags))) {
                return 'StringOrNull';
            }
            if (this.isJavaNullishUnion(type, (member) => this.isJavaListValueType(member))
                && !this.isVarargsArrayReference(expression)) {
                return 'ListOrNull';
            }
        }
        return undefined;
    }

    // every union member is a List-printing type (TS array/tuple/ReadonlyArray, or an
    // Array-derived class whose hand-written java counterpart is an ArrayList)
    isJavaListValueType(type) {
        if (!type) {
            return false;
        }
        if ((type.flags & TypeFlags.Union) !== 0) {
            return type.getTypes().length > 0 && type.getTypes().every((member) => this.isJavaListValueType(member));
        }
        return this.isJavaListType(type) || this.isJavaListBackedClassType(type);
    }

    // TS class/interface whose java counterpart extends java.util.ArrayList<Object>:
    // the ws caches (ws/ArrayCache.java) and the order-book sides (ws/OrderBookSide.java)
    isJavaListBackedClassType(type) {
        if (!type || (type.flags & TypeFlags.Object) === 0) {
            return false;
        }
        let current: any = (type as any).isTypeReference?.() ? (type as any).getTarget() : type;
        for (let depth = 0; current && depth < 8; depth++) {
            const name = current.getSymbol?.()?.escapedName;
            if (name !== undefined && JAVA_LIST_BACKED_TS_CLASSES.has(name)) {
                return true;
            }
            const bases: any[] = current.getBaseTypes?.() ?? [];
            current = bases.length > 0 ? ((bases[0] as any).isTypeReference?.() ? (bases[0] as any).getTarget() : bases[0]) : undefined;
        }
        return false;
    }

    // union of one accepted member family plus null/undefined: the emitted guard is the
    // helper's answer for the nullish case and the native read otherwise
    isJavaNullishUnion(type, isMember) {
        if (!type || (type.flags & TypeFlags.Union) === 0 || type.getTypes().length === 0) {
            return false;
        }
        return type.getTypes().every((member) => isMember(member)
            || (member.flags & (TypeFlags.Undefined | TypeFlags.Null)) !== 0);
    }

    // shared by printLengthProperty and transformPropertyAcessExpressionIfNeeded
    printJavaLength(expression, leftSide) {
        const kind = this.javaLengthKind(expression);
        if (kind !== undefined) {
            const read = kind.startsWith('String') ? `((String)${leftSide}).length()` : `((java.util.List<?>)${leftSide}).size()`;
            return kind.endsWith('OrNull') ? `(${leftSide} == null ? 0 : ${read})` : read;
        }
        // a receiver the embedding pass declared a java.util.List (`List<Object> response =
        // (this.someRequest(..)).join()` — a typed list return bound to a local, or a list
        // parameter the pass retyped): the declaration carries the type, so `x.size()` needs
        const declared = this.javaDeclaredTypeOf(expression);
        if (declared !== undefined && JAVA_DECLARED_LIST_TYPES.test(declared)) {
            return `(${leftSide} == null ? 0 : ${leftSide}.size())`;
        }
        return `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`;
    }

    // `for (var i = <int literal>; ...; i++)`: printForStatement rewrites the
    // Object initializer into `var`, so javac infers a primitive counter there,
    // and only ++/-- writes keep it primitive
    isJavaPrimitiveForCounter(node) {
        if (node.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const comparison = node.parent;
        if (!comparison || comparison.kind !== SyntaxKind.BinaryExpression) {
            return false;
        }
        const forStatement = comparison.parent;
        if (!forStatement || forStatement.kind !== SyntaxKind.ForStatement || forStatement.condition !== comparison) {
            return false;
        }
        const initializer = forStatement.initializer;
        if (!initializer || initializer.kind !== SyntaxKind.VariableDeclarationList) {
            return false;
        }
        const declarations = initializer.declarations ?? [];
        if (declarations.length !== 1) {
            return false;
        }
        const declaration = declarations[0];
        if (!isIdentifier(declaration.name) || declaration.name.text !== node.text) {
            return false;
        }
        if (this.javaIntegerLiteralKind(declaration.initializer) === undefined) {
            return false;
        }
        const counterSymbol = this.getChecker().getSymbolAtLocation(node);
        const declarationSymbol = this.getChecker().getSymbolAtLocation(declaration.name);
        if (counterSymbol !== undefined && declarationSymbol !== undefined && counterSymbol !== declarationSymbol) {
            return false;
        }
        const incrementor = forStatement.incrementor;
        if (!incrementor || incrementor.operand?.kind !== SyntaxKind.Identifier || incrementor.operand.text !== node.text) {
            return false;
        }
        return incrementor.kind === SyntaxKind.PostfixUnaryExpression || incrementor.kind === SyntaxKind.PrefixUnaryExpression;
    }

    // Java primitive kind of a comparison operand; undefined keeps the helper. Proof sources: literals
    // (int/long/double) and expressions the printer's own emitter pins: `var` for-counter, `.length`,
    // `x.indexOf(arg)`/`x.search(arg)` (int), Math.round (long), Math.floor/ceil/pow (double).
    javaPrimitiveOperandKind(node) {
        if (node === undefined || node === null) {
            return undefined;
        }
        if (node.kind === SyntaxKind.ParenthesizedExpression) {
            return this.javaPrimitiveOperandKind(node.expression);
        }
        const literalKind = this.javaIntegerLiteralKind(node);
        if (literalKind !== undefined) {
            return literalKind;
        }
        if (this.isJavaFloatLiteral(node)) {
            return 'double';
        }
        if (this.isJavaPrimitiveForCounter(node) || this.javaPrintedIntCounter(node)) {
            return 'int';
        }
        // `-1`: the sign prints in front of an int literal, still a Java int
        if (node.kind === SyntaxKind.PrefixUnaryExpression && node.operator === SyntaxKind.MinusToken
            && this.javaIntegerLiteralKind(node.operand) === 'int') {
            return 'int';
        }
        if (node.kind === SyntaxKind.PropertyAccessExpression && node.name.text === 'length') {
            return 'int';
        }
        if (node.kind === SyntaxKind.CallExpression) {
            return this.javaPrintedCallKind(node);
        }
        // a nested `+ - * /` this printer emits natively is a Java primitive of its kind
        if (node.kind === SyntaxKind.BinaryExpression) {
            return this.javaNativeArithmeticKind(node);
        }
        return undefined;
    }

    // a read of a `for (var i = <int literal>; ..; i++)` counter anywhere in the loop: javac types it
    // int and no box write reaches it; a capture rename (`finalI`) prints an Object copy instead
    javaPrintedIntCounter(node): boolean {
        return node?.kind === SyntaxKind.Identifier && this.javaIntForCounter(node)
            && this.javaIdentifierPrintsDeclaredName(node);
    }

    // fractional / exponent literals print as Java double literals (printNumericLiteral)
    isJavaFloatLiteral(node) {
        if (!node || !isNumericLiteral(node)) {
            return false;
        }
        return !/^0[xXbBoO]/.test(node.text) && /[.eE]/.test(node.text);
    }

    // Java kind of a call the printer emits itself, undefined otherwise. Mirrors printIndexOfCall /
    // printSearchCall / printMathRoundCall / printMathFloorCall / printMathCeilCall and Math.pow:
    // x.indexOf(a) / x.search(a) -> int; Math.round(x) -> long; Math.floor/ceil/pow -> double.
    javaPrintedCallKind(node) {
        const callee = node.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression) {
            return undefined;
        }
        const name = callee.name?.text;
        const argCount = node.arguments?.length ?? 0;
        const onMath = callee.expression?.kind === SyntaxKind.Identifier
            && callee.expression.text === 'Math';
        switch (name) {
        case 'indexOf':
        case 'search':
            // the dispatch routes a 1-argument indexOf/search through the int-returning
            // helpers; a receiver that prints String keeps String.indexOf (int as well)
            return argCount >= 1 ? 'int' : undefined;
        case 'round':
            return onMath && argCount === 1 ? 'long' : undefined;
        case 'floor':
        case 'ceil':
            return onMath && argCount === 1 ? 'double' : undefined;
        case 'pow':
            return onMath && argCount === 2 ? 'double' : undefined;
        }
        return undefined;
    }

    // operand usability for `>=` / `<` / `<=`, which route through the helper's isEqual. Two integral
    // operands are always exact; once a double is involved, toLong saturates and BigDecimal throws on
    // ±Infinity, so a double or long is accepted only as a finite literal within ±2^53.
    javaComparisonOperandsAreExact(left, leftKind, right, rightKind) {
        if (leftKind !== 'double' && rightKind !== 'double') {
            return true;
        }
        return this.javaComparisonOperandIsExactAgainstDouble(left, leftKind)
            && this.javaComparisonOperandIsExactAgainstDouble(right, rightKind);
    }

    javaComparisonOperandIsExactAgainstDouble(node, kind) {
        if (kind === 'int') {
            return true;
        }
        if ((kind !== 'long' && kind !== 'double') || !isNumericLiteral(node)) {
            return false;
        }
        const text = node.text;
        if (/^[0-9]+$/.test(text)) {
            // the text is what the printer emits, and JS Number() rounds above 2^53 —
            // compare the literal's exact value instead
            return BigInt(text) <= 9007199254740992n;
        }
        const value = Number(text);
        return Number.isFinite(value) && Math.abs(value) <= 9007199254740992;
    }

    // checker proof that the value is printed as a java.util.HashMap: TS object
    // shapes (interfaces, object literals, aliases) become HashMaps, while class
    // instances are real Java objects and arrays/unions are not proven here
    isJavaMapType(type) {
        if (!type || (type.flags & TypeFlags.Object) === 0) {
            return false;
        }
        const checker = this.getChecker();
        if (checker.isArrayType(type) || checker.isTupleType(type)) {
            return false;
        }
        if (type.getCallSignatures().length > 0) {
            return false;
        }
        const declarations = (type.getSymbol()?.declarations ?? []).map((d) => d.resolve());
        return !declarations.some((declaration) => declaration.kind === SyntaxKind.ClassDeclaration
            || declaration.getSourceFile().fileName.indexOf('typescript') > -1);
    }

    // string keys (plain, literal or a union of literals) print as Java Strings
    isJavaStringType(type) {
        if (!type) {
            return false;
        }
        if (this.isStringType(type.flags)) {
            return true;
        }
        if ((type.flags & TypeFlags.Union) === 0) {
            return false;
        }
        return type.getTypes().every((member) => this.isStringType(member.flags));
    }

    // `Dictionary | undefined` (what a no-overload safe* signature widens to): the helper
    // answers false for the nullish arm and the guarded emission keeps exactly that; every
    // non-map member (arrays, classes, scalars) keeps the helper
    isJavaNullableMapType(type) {
        return this.isJavaNullishUnion(type, (member) => this.isJavaMapType(member))
            && ((type as any).getTypes?.() ?? []).some((member) => (member.flags & (TypeFlags.Undefined | TypeFlags.Null)) === 0);
    }

    // the guarded emission reads the receiver twice, so it is only printed for an operand
    // that cannot run anything twice: a name or a `this.` field. Everything else (calls,
    // element reads) keeps the helper so the operand is still evaluated once.
    javaRepeatableOperand(node) {
        if (node === undefined) {
            return false;
        }
        if (isIdentifier(node)) {
            return true;
        }
        if (isParenthesizedExpression(node)) {
            return this.javaRepeatableOperand(node.expression);
        }
        return isPropertyAccessExpression(node) && node.expression?.kind === SyntaxKind.ThisKeyword;
    }

    // The declared Java type of a local/parameter is known to the pass that rewrites the declaration
    // text (build/java-local-types.js), which records every name it typed here. With no consumer
    // installed the table is empty and every read keeps the helper.
    javaDeclaredTypeOf(expression): string | undefined {
        if (expression === undefined || !isIdentifier(expression)) {
            return undefined;
        }
        const declaration = this.javaDeclarationOfIdentifier(expression);
        if (declaration === undefined || expression.text !== declaration.name?.text) {
            return undefined;
        }
        return this.javaDeclaredTypeOfDeclaration(declaration);
    }

    // the declared Java type of a declaration: the embedding build layer names the
    // declarations it retypes itself, and a parameter the printer retypes
    // (javaNativeParameterType) answers for itself, so its element reads go native too
    javaDeclaredTypeOfDeclaration(declaration): string | undefined {
        if (this.javaDeclaredLocalTypeResolver !== undefined) {
            let type;
            try {
                type = this.javaDeclaredLocalType(declaration);
            } catch (e) {
                type = undefined;
            }
            if (typeof type === 'string' && type.trim().length > 0) {
                return type.trim();
            }
        }
        // a local the printer itself declared with the map type it proved (javaElementWriteMapLocalType)
        const own = this.javaElementWriteMapLocalType(declaration);
        if (own !== undefined) {
            return own;
        }
        // the same for a local it bound to a base field the hand-written Java declares a map
        const baseField = this.javaBaseMapFieldLocalType(declaration);
        if (baseField !== undefined) {
            return baseField;
        }
        // an awaited / destructured json-box local the printer declares with its checked Map box
        const checkedBox = this.javaCheckedBoxLocalTypeCached(declaration);
        if (checkedBox !== undefined) {
            return checkedBox;
        }
        if (isParameterDeclaration(declaration)) {
            const fixed = this.javaNativeParameterType(declaration);
            if (fixed !== undefined) {
                return fixed;
            }
            // A default-valued slot the printer typed in its signature: the dict family is the
            // one whose element accessors bind on the declaration, so only it resolves here.
            const optional = this.javaOptionalParameterTypeCached(declaration);
            return optional === JAVA_NATIVE_DICT_PARAMETER_TYPE ? optional : undefined;
        }
        return undefined;
    }

    // The declared Java type of a local as the embedding build layer publishes it
    // (javaDeclaredLocalTypeResolver), else the type its own initialiser prints when that is a
    // sync `this.<m> (...)` call of a generated venue method whose declaration prints a native
    // Map/List (javaVenueCalleeReturnType). The resolver only knows the files the calling worker
    // printed, and a callee's local can sit in another file: the fallback answers from the callee's
    // declaration, so the answer never depends on what an earlier generation or worker printed.
    // No resolver installed (no consumer) = no fallback, every read keeps the helper.
    javaDeclaredLocalType(declaration): string | undefined {
        const resolver = this.javaDeclaredLocalTypeResolver;
        if (typeof resolver !== 'function') {
            return undefined;
        }
        const own = resolver(declaration);
        if (own !== undefined || declaration === undefined) {
            return own;
        }
        try {
            return this.javaVenueCalleeLocalType(declaration);
        } catch (e) {
            return undefined;
        }
    }

    javaVenueCalleeLocalType(declaration): string | undefined {
        if (!isVariableDeclaration(declaration) || declaration.initializer === undefined) {
            return undefined;
        }
        let initializer = declaration.initializer;
        while (isParenthesizedExpression(initializer)) {
            initializer = initializer.expression;
        }
        return this.javaVenueCalleeReturnType(initializer);
    }

    // the emitted Java type of a sync `this.<m> (...)` / `super.<m> (...)` call whose resolved callee
    // is a generated venue method (ts/src/<id>.ts, pro/, prediction/) and whose declaration prints a
    // native Map<String, Object> / List<Object> return: the annotation print, or the native fallback
    // printMethodDefinition takes when that prints the boxed `Object`. A base-tier or hand-written
    // callee, a future, a DTO or a scalar answers undefined (the build layer's tables stay the proof).
    javaVenueCalleeReturnType(call): string | undefined {
        if (call === undefined || !isCallExpression(call)) {
            return undefined;
        }
        const callee = call.expression;
        if (!isPropertyAccessExpression(callee)
            || (callee.expression.kind !== SyntaxKind.ThisKeyword
                && !(isIdentifier(callee.expression) && callee.expression.text === 'super'))) {
            return undefined;
        }
        if (this.javaVenueCalleeInProgress.has(call)) {
            return undefined; // a mutually recursive proof reads as unproven
        }
        this.javaVenueCalleeInProgress.add(call);
        try {
            // the resolved declaration is a pure function of the call node: ask the checker once
            let declaration = this.javaVenueCalleeDeclarations.get(call);
            for (let attempt = 0; attempt < 2 && declaration === undefined; attempt++) {
                try {
                    declaration = this.getChecker().getResolvedSignature(call)?.declaration?.resolve();
                } catch (e) {
                    declaration = undefined; // a transient checker failure: one retry, then the tables decide
                }
            }
            if (declaration !== undefined) {
                this.javaVenueCalleeDeclarations.set(call, declaration);
            }
            if (declaration === undefined || declaration.kind !== SyntaxKind.MethodDeclaration
                || declaration.body === undefined) {
                return undefined;
            }
            const fileName = String(declaration.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
            if (!JAVA_NATIVE_PARAMETER_GENERATED_FILES.test(fileName)) {
                return undefined;
            }
            let printed;
            try {
                printed = this.printFunctionType(declaration);
            } catch (e) {
                return undefined;
            }
            const direct = javaVenueCalleeNativeType(printed);
            if (direct !== undefined) {
                return direct;
            }
            if (printed !== this.DEFAULT_RETURN_TYPE) {
                return undefined;
            }
            try {
                return javaVenueCalleeNativeType(this.javaNativeReturnType(declaration));
            } catch (e) {
                return undefined;
            }
        } finally {
            this.javaVenueCalleeInProgress.delete(call);
        }
    }

    javaVenueCalleeInProgress: Set<Node> = new Set();
    javaVenueCalleeDeclarations: WeakMap<Node, Node> = new WeakMap();

    // javaOptionalParameterType walks the heritage chain, and every element access consults it
    javaOptionalParameterTypeCache: WeakMap<Node, string | typeof JAVA_MEMO_UNDEFINED> = new WeakMap();

    javaOptionalParameterTypeCached(node): string | undefined {
        const cached = this.javaOptionalParameterTypeCache.get(node);
        if (cached !== undefined) {
            return cached === JAVA_MEMO_UNDEFINED ? undefined : cached;
        }
        let type;
        try {
            type = this.javaOptionalParameterType(node);
        } catch (e) {
            type = undefined;
        }
        this.javaOptionalParameterTypeCache.set(node, type ?? JAVA_MEMO_UNDEFINED);
        return type;
    }

    // The native Java type a parameter prints with when its TS annotation is a base/types.ts alias in
    // JAVA_NATIVE_PARAMETER_TYPES. Fixed parameters of generated-tier methods only, and every
    // declaration up the heritage chain must print the same type: Java overrides are invariant.
    javaNativeParameterType(node): string | undefined {
        if (node === undefined || !isParameterDeclaration(node)
            || node.initializer !== undefined || node.dotDotDotToken !== undefined) {
            return undefined;
        }
        const own = this.javaNativeParameterTypeOf(node);
        const type = own !== undefined ? own : this.javaInheritedParameterType(node);
        if (type === undefined) {
            return undefined;
        }
        // D2: a parameter the enclosing body assigns with a compound operator keeps the box — `url += '/x'`
        // prints `url = Helpers.add(url, ..)`, whose result is an Object. A plain `x = ..` or a
        // destructuring target is cast at the write site instead (javaParameterAssignmentCast).
        if (this.javaParameterIsCompoundAssigned(node)) {
            return undefined;
        }
        try {
            const method: any = node.parent;
            const index = method.parameters.indexOf(node);
            let override = this.getMethodOverride(method);
            if (override === undefined
                && JAVA_NATIVE_PARAMETER_PREDICTION_FILES.test(node.getSourceFile().fileName)
                && method.name !== undefined) {
                // a venue method overriding the Exchange-tier body PredictionExchange.java carries
                // must print that tier parameter's type (D8: Java overrides are invariant)
                const tier = this.exchangeTierMethods().get(method.name.getText().trim());
                if (tier !== undefined && !this.javaParameterPrintsType(tier.parameters?.[index], type)) {
                    return undefined;
                }
            }
            while (override !== undefined) {
                const baseParam = (override as any).parameters?.[index];
                if (!this.javaParameterPrintsType(baseParam, type)) {
                    return undefined;
                }
                override = this.getMethodOverride(override);
            }
        } catch (e) {
            return undefined; // an unresolvable heritage keeps the box
        }
        return type;
    }

    // method declarations (first per name) of the `Exchange` class of ts/src/base/Exchange.ts, read off the
    // program the warp ran on. A prediction venue's method with one of these names overrides
    // the tier body javaTranspiler.ts injects into PredictionExchange.java.
    private _exchangeTierMethods: Map<string, any> | undefined = undefined;
    exchangeTierMethods(): Map<string, any> {
        if (this._exchangeTierMethods !== undefined) {
            return this._exchangeTierMethods;
        }
        const names = new Map<string, any>();
        try {
            const program = this.getProgram();
            const fileName = program.getSourceFileNames().find((f) => JAVA_NATIVE_PARAMETER_BASE_FILES.test(f));
            const file = fileName !== undefined ? program.getSourceFile(fileName) : undefined;
            const collect = (node: Node) => {
                if (isClassDeclaration(node) && node.name?.text === 'Exchange') {
                    for (const member of node.members) {
                        const key = (member as any).name?.getText().trim();
                        if (isMethodDeclaration(member) && key !== undefined && !names.has(key)) {
                            names.set(key, member);
                        }
                    }
                }
                node.forEachChild(collect);
            };
            if (file !== undefined) {
                collect(file);
            }
        } catch (e) {
            // no program yet: the heritage walk above already answered
        }
        this._exchangeTierMethods = names;
        return names;
    }

    // the same parameter position of an ancestor declaration prints this native type: its
    // own annotation names it, or - with no annotation of its own - it inherits the same
    // type from a declaration above it, exactly like this one does
    javaParameterPrintsType(baseParam, type: string): boolean {
        if (baseParam === undefined || !isParameterDeclaration(baseParam)
            || baseParam.initializer !== undefined || baseParam.dotDotDotToken !== undefined) {
            return false;
        }
        const own = this.javaNativeParameterTypeOf(baseParam);
        const printed = own !== undefined ? own : this.javaInheritedParameterType(baseParam);
        return printed === type;
    }

    // the type a fixed parameter with no annotation of its own inherits: the nearest
    // declaration of the method up the heritage chain that prints a native type. An
    // unannotated root declaration prints `Object`, so nothing is inherited and the whole
    javaInheritedParameterType(node): string | undefined {
        const method = node.parent;
        const index = method?.parameters?.indexOf(node);
        if (method === undefined || index === undefined || index < 0) {
            return undefined;
        }
        let override = this.getMethodOverride(method);
        while (override !== undefined) {
            const baseParam = (override as any).parameters?.[index];
            const type = baseParam === undefined ? undefined : this.javaNativeParameterTypeOf(baseParam);
            if (type !== undefined) {
                return type;
            }
            override = this.getMethodOverride(override);
        }
        return undefined;
    }

    // Default-valued parameters are real parameters of the typed core that carries the body;
    // the untyped `Object... optionalArgs` front delegates to it.
    javaOptionalParameterJavaType(node): string {
        return this.javaOptionalParameterType(node) ?? 'Object';
    }

    // A bare `params = {}` (no annotation) inherits the nearest ancestor declaration's native type.
    // Only the dict family: every other alias pairs with a default of its own kind, so `{}` there
    // would be a different value, not the same slot. javaOptionalParameterType's family walk still
    // vetoes a chain whose declarations disagree.
    javaInheritedOptionalParameterType(node): string | undefined {
        if (node.initializer === undefined || !isObjectLiteralExpression(node.initializer)
            || node.initializer.properties.length > 0) {
            return undefined;
        }
        const method: any = node.parent;
        const index = method?.parameters?.indexOf(node) ?? -1;
        if (index < 0) {
            return undefined;
        }
        let override;
        try {
            override = this.getMethodOverride(method);
        } catch (e) {
            return undefined;
        }
        while (override !== undefined) {
            const baseParam = (override as any).parameters?.[index];
            const type = baseParam === undefined ? undefined : this.javaOptionalParameterTypeOf(baseParam);
            if (type !== undefined) {
                return type === JAVA_NATIVE_DICT_PARAMETER_TYPE ? type : undefined;
            }
            try {
                override = this.getMethodOverride(override);
            } catch (e) {
                return undefined;
            }
        }
        return undefined;
    }

    javaOptionalParameterType(node): string | undefined {
        if (node === undefined || !isParameterDeclaration(node)) {
            return undefined;
        }
        if (node.initializer === undefined || node.dotDotDotToken !== undefined) {
            return undefined; // `?` parameters keep today's shape (they print in the fixed prefix)
        }
        const own = this.javaOptionalParameterTypeOf(node);
        if (own === undefined) {
            return undefined;
        }
        // a parameter the body assigns with a compound operator keeps the box (`x += ..` prints
        // Helpers.add(x, ..), an Object result) - the same rule as the fixed-parameter path
        if (this.javaParameterIsCompoundAssigned(node)) {
            return undefined;
        }
        // a list parameter the body `typeof`-probes also accepts other boxes at runtime
        if (own === JAVA_STRING_LIST_TYPE && this.javaParameterIsTypeofTested(node)) {
            return undefined;
        }
        const method: any = node.parent;
        try {
            const index = method.parameters.indexOf(node);
            let override = this.getMethodOverride(method);
            while (override !== undefined) {
                if (!this.javaOptionalParameterFamilyAgrees(method, override, index, own)) {
                    return undefined;
                }
                override = this.getMethodOverride(override);
            }
        } catch (e) {
            return undefined; // an unresolvable heritage keeps the box
        }
        return own;
    }

    // the annotation proof for an optional parameter (no initializer bail)
    javaOptionalParameterTypeOf(node): string | undefined {
        if (node === undefined || !isParameterDeclaration(node) || node.dotDotDotToken !== undefined) {
            return undefined;
        }
        const method = node.parent;
        if (method === undefined || !isMethodDeclaration(method) || !isClassDeclaration(method.parent)) {
            return undefined;
        }
        if (!JAVA_NATIVE_PARAMETER_BASE_FILES.test(node.getSourceFile().fileName)
            && !JAVA_NATIVE_PARAMETER_GENERATED_FILES.test(node.getSourceFile().fileName)) {
            return undefined; // a hand-written java class declares this method, not the printer
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const type = checker.getTypeAtLocation(node);
        if (type === undefined) {
            return undefined;
        }
        const symbol = this.javaParameterAliasSymbol(node, type, checker);
        const name = symbol?.name;
        const excluded = JAVA_NATIVE_PARAMETER_EXCLUDED_POSITIONS[(method.name as any)?.text];
        if (excluded !== undefined && excluded.includes(method.parameters.indexOf(node))) {
            return undefined;
        }
        // a bare `params = {}` re-declares a slot an ancestor declares with a native type: the
        // override carries the base contract, so it prints that type (Java overrides are invariant)
        if (node.type === undefined) {
            return this.javaInheritedOptionalParameterType(node);
        }
        if (name === 'Strings' || this.javaIsStringArrayType(checker, type)) {
            const listName = JAVA_STRINGS_OPTIONAL_PARAMETER_NAMES.has((node.name as any)?.text)
                && !JAVA_STRINGS_EXCLUDED_METHODS.has((method.name as any)?.text);
            return listName ? JAVA_STRING_LIST_TYPE : undefined;
        }
        if (name === undefined || JAVA_NATIVE_PARAMETER_TYPES_OPTIONAL[name] === undefined) {
            return undefined;
        }
        const declaration = symbol?.declarations?.[0]?.resolve();
        const fileName = declaration?.getSourceFile?.()?.fileName;
        return JAVA_NATIVE_PARAMETER_SOURCE_FILES.test(fileName ?? '')
            ? JAVA_NATIVE_PARAMETER_TYPES_OPTIONAL[name] : undefined;
    }

    // a `string[]` annotation (optionally `| undefined`), the unaliased spelling of `Strings`
    javaIsStringArrayType(checker, type): boolean {
        const members = type.isUnionType?.() ? type.getTypes() : [type];
        let arrays = 0;
        for (const member of members) {
            if (member.flags & (TypeFlags.Undefined | TypeFlags.Null)) {
                continue;
            }
            if (!checker.isArrayType(member)) {
                return false;
            }
            const element = checker.getTypeArguments(member)?.[0];
            if (element === undefined || !(element.flags & TypeFlags.String)) {
                return false;
            }
            arrays++;
        }
        return arrays === 1;
    }

    // Java overrides are invariant: every ancestor declaration must match the parameter count,
    // the first default-valued index and this position's type, otherwise the position stays Object.
    javaOptionalParameterFamilyAgrees(method, override, index, type: string): boolean {
        const baseParams = override?.parameters;
        if (baseParams === undefined || baseParams.length !== method.parameters.length) {
            return false;
        }
        if (this.firstDefaultParameterIndex(baseParams) !== this.firstDefaultParameterIndex(method.parameters)) {
            return false;
        }
        const baseParam = baseParams[index];
        if (baseParam === undefined || !isParameterDeclaration(baseParam) || baseParam.dotDotDotToken !== undefined) {
            return false;
        }
        const baseIsOptional = baseParam.initializer !== undefined || baseParam.questionToken !== undefined;
        const ownIsOptional = method.parameters[index].initializer !== undefined
            || method.parameters[index].questionToken !== undefined;
        if (baseIsOptional !== ownIsOptional) {
            return false;
        }
        const baseType = baseIsOptional
            ? this.javaOptionalParameterTypeOf(baseParam)
            : this.javaNativeParameterTypeOf(baseParam);
        return baseType === type;
    }

    firstDefaultParameterIndex(params): number {
        for (let i = 0; i < params.length; i++) {
            if (params[i].initializer !== undefined || params[i].questionToken !== undefined) {
                return i;
            }
        }
        return -1;
    }

    // a method with >=1 optional parameter prints one typed full signature (callers pass every slot).
    hasDefaultedTail(node): boolean {
        if (node === undefined || !isMethodDeclaration(node)) {
            return false; // constructors and functions keep the optionalArgs unpack
        }
        return this.javaHasOptionalParameter(node);
    }

    // a typed default-valued method parameter is written in place, so its writes convert to the declared type
    javaSplitParameterWriteType(node): string | undefined {
        if (node?.initializer === undefined || !this.hasDefaultedTail(node.parent)) {
            return undefined;
        }
        return this.javaOptionalParameterType(node);
    }

    // the async body copy of a reassigned default-valued parameter keeps a `List<String>` type;
    // its writes convert like the sync in-place ones (other types keep the `Object` copy)
    javaAsyncParameterLocalType(node): string | undefined {
        if (node?.initializer === undefined || !this.hasDefaultedTail(node.parent) || !this.isAsyncFunction(node.parent)) {
            return undefined;
        }
        const type = this.javaOptionalParameterType(node);
        if (type === 'Long' && !this.javaParameterIsWritten(node)) {
            return type; // a read-only copy of the Long core parameter
        }
        return type === JAVA_STRING_LIST_TYPE ? type : undefined;
    }

    // any write to the parameter in its method: assignment (plain or compound), a destructuring
    // target, `++`/`--`, a for-of/in binding
    javaParameterIsWritten(node): boolean {
        const method = node?.parent;
        const checker: any = this.checkerOrUndefined();
        if (method?.body === undefined || checker === undefined) {
            return true;
        }
        const symbol = checker.getSymbolAtLocation(node.name);
        if (symbol === undefined) {
            return true;
        }
        const same = (n) => n !== undefined && isIdentifier(n) && checker.getSymbolAtLocation(n) === symbol;
        let written = false;
        const visit = (n) => {
            if (written) {
                return;
            }
            if (isBinaryExpression(n) && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(n.operatorToken.kind)) {
                const left = n.left;
                if (same(left) || (isArrayLiteralExpression(left) && left.elements.some(same))) {
                    written = true;
                    return;
                }
            }
            if ((isPrefixUnaryExpression(n) || isPostfixUnaryExpression(n)) && same(n.operand)
                && (n.operator === SyntaxKind.PlusPlusToken || n.operator === SyntaxKind.MinusMinusToken)) {
                written = true;
                return;
            }
            if ((isForOfStatement(n) || isForInStatement(n)) && same(n.initializer)) {
                written = true;
                return;
            }
            n.forEachChild(visit);
        };
        visit(method.body);
        return written;
    }

    // a read the enclosing code only reaches with the binding non-null: the right operand of
    // `x !== undefined && ..`, the matching arm of an `if`/`?:` on that test, or any statement
    // after `if (x === undefined) { return/throw/.. }`. Callers require an unwritten binding.
    javaNullGuardAdmitsRead(node): boolean {
        const checker: any = this.checkerOrUndefined();
        const symbol = checker?.getSymbolAtLocation(node);
        if (symbol === undefined) {
            return false;
        }
        let current: any = node;
        while (current.parent !== undefined) {
            const parent: any = current.parent;
            if (isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken
                && parent.right === current && this.javaTestProvesNonNull(parent.left, symbol, true)) {
                return true;
            }
            if (isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.BarBarToken
                && parent.right === current && this.javaTestProvesNonNull(parent.left, symbol, false)) {
                return true;
            }
            if ((isIfStatement(parent) || isConditionalExpression(parent))) {
                const test = isIfStatement(parent) ? parent.expression : parent.condition;
                const whenTrue = isIfStatement(parent) ? parent.thenStatement : parent.whenTrue;
                const whenFalse = isIfStatement(parent) ? parent.elseStatement : parent.whenFalse;
                if ((whenTrue === current && this.javaTestProvesNonNull(test, symbol, true))
                    || (whenFalse === current && this.javaTestProvesNonNull(test, symbol, false))) {
                    return true;
                }
            }
            if (isBlock(parent)) {
                for (const sibling of parent.statements) {
                    if (sibling === current) {
                        break;
                    }
                    if (isIfStatement(sibling)
                        && ((this.javaTestProvesNonNull(sibling.expression, symbol, false) && this.javaStatementAlwaysExits(sibling.thenStatement))
                            || (this.javaTestProvesNonNull(sibling.expression, symbol, true) && this.javaStatementAlwaysExits(sibling.elseStatement)))) {
                        return true;
                    }
                }
            }
            current = parent;
        }
        return false;
    }

    // `x !== undefined` / `x != null` (either order) proves x non-null when the test is true;
    // `x === undefined` when false; `&&` (true) / `||` (false) prove through either side, `!` flips
    javaTestProvesNonNull(test, symbol, truthy): boolean {
        if (test === undefined) {
            return false;
        }
        if (isParenthesizedExpression(test)) {
            return this.javaTestProvesNonNull(test.expression, symbol, truthy);
        }
        if (isPrefixUnaryExpression(test) && test.operator === SyntaxKind.ExclamationToken) {
            return this.javaTestProvesNonNull(test.operand, symbol, !truthy);
        }
        if (!isBinaryExpression(test)) {
            return false;
        }
        const op = test.operatorToken.kind;
        if (op === SyntaxKind.AmpersandAmpersandToken) {
            return truthy && (this.javaTestProvesNonNull(test.left, symbol, true) || this.javaTestProvesNonNull(test.right, symbol, true));
        }
        if (op === SyntaxKind.BarBarToken) {
            return !truthy && (this.javaTestProvesNonNull(test.left, symbol, false) || this.javaTestProvesNonNull(test.right, symbol, false));
        }
        const inequality = op === SyntaxKind.ExclamationEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken;
        const equality = op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken;
        if ((!inequality && !equality) || truthy !== inequality) {
            return false;
        }
        const nullish = (n) => n.kind === SyntaxKind.NullKeyword || (isIdentifier(n) && n.text === 'undefined');
        const tested = nullish(test.right) ? test.left : (nullish(test.left) ? test.right : undefined);
        const checker: any = this.checkerOrUndefined();
        return tested !== undefined && isIdentifier(tested) && checker?.getSymbolAtLocation(tested) === symbol;
    }

    javaStatementAlwaysExits(statement): boolean {
        if (statement === undefined) {
            return false;
        }
        const exits = (n) => isReturnStatement(n) || isThrowStatement(n) || isContinueStatement(n) || isBreakStatement(n);
        if (exits(statement)) {
            return true;
        }
        return isBlock(statement) && statement.statements.length > 0 && exits(statement.statements[statement.statements.length - 1]);
    }

    // `Long` when the body reads this default-valued `Int` parameter as the core's own Long (the
    // parameter itself or its read-only async copy); undefined otherwise
    javaLongParameterRead(node): boolean {
        if (node === undefined || !isIdentifier(node) || !this.javaIdentifierPrintsDeclaredName(node)
            || !this.javaIdentifierKeepsDeclaredName(node)) {
            return false;
        }
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined || !isParameterDeclaration(declaration) || declaration.initializer === undefined
            || !this.hasDefaultedTail(declaration.parent)) {
            return false;
        }
        return this.javaOptionalParameterType(declaration) === 'Long' && !this.javaParameterIsWritten(declaration);
    }

    // the names the enclosing method body assigns with a compound operator (`x += ..`),
    // by method node; a plain assignment is handled by javaParameterAssignmentCast
    javaMethodAssignedNames: WeakMap<Node, Set<string>> = new WeakMap();

    // D-09 memo/cycle guard for javaNativeReturnType (mutually recursive return chains)
    javaReturnTypeCache: WeakMap<Node, string | undefined> = new WeakMap();
    javaReturnTypeInProgress: Set<Node> = new Set();
    // the build layer answers a printed local's type from what THIS worker has printed so far, so
    // an unproven answer may only be provisional: caching it freezes the first worker's view
    javaReturnTypeUsedDeclaredLocals = false;

    javaParameterIsTypeofTested(node): boolean {
        const method = node.parent;
        const name = (node.name as any)?.text;
        // forEachChild stops at the first truthy visit, i.e. the first matching typeof
        const visit = (n: Node): boolean => (isTypeOfExpression(n) && isIdentifier(n.expression) && n.expression.text === name)
            || n.forEachChild(visit) === true;
        return method?.body !== undefined && name !== undefined && method.body.forEachChild(visit) === true;
    }

    javaParameterIsCompoundAssigned(node): boolean {
        const method = node.parent;
        const name = (node.name as any)?.text;
        if (method?.body === undefined || name === undefined) {
            return false;
        }
        let assigned = this.javaMethodAssignedNames.get(method);
        if (assigned === undefined) {
            assigned = new Set<string>();
            const collect = (n: Node) => {
                if (isBinaryExpression(n) && n.operatorToken.kind !== SyntaxKind.EqualsToken
                    && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(n.operatorToken.kind)) {
                    const left = n.left;
                    if (isIdentifier(left) && left.text !== undefined) {
                        assigned.add(left.text as string);
                    }
                }
                n.forEachChild(collect);
            };
            method.body.forEachChild(collect);
            this.javaMethodAssignedNames.set(method, assigned);
        }
        return assigned.has(name as string);
    }

    // a write to a parameter this printer declared natively: the right side prints from `Object`
    // locals, so the assignment carries the same checkcast as the call sites. The checker proved the
    // right side assignable to the parameter, so the declared type describes the value received.
    javaParameterAssignmentCast(left, right, identation): string | undefined {
        if (!isIdentifier(left)) {
            return undefined;
        }
        const declaration = this.javaDeclarationOfIdentifier(left);
        if (declaration === undefined || !isParameterDeclaration(declaration) || left.text !== (declaration.name as any)?.text) {
            return undefined;
        }
        const native = this.javaNativeParameterType(declaration) ?? this.javaSplitParameterWriteType(declaration);
        if (native === undefined) {
            return undefined;
        }
        const leftText = this.printNode(left, 0);
        if (this.javaNativeArgumentAlreadyTyped(right, native)) {
            return `${leftText} = ${this.printNode(right, identation)}`;
        }
        if (native === 'Long') {
            return `${leftText} = Helpers.toLongOrNull(${this.printNode(right, identation)})`;
        }
        if (native === JAVA_STRING_LIST_TYPE) {
            return `${leftText} = Helpers.toStringListArg(${this.printNode(right, identation)})`;
        }
        // the checkcast carries its own parentheses: a bare `(T) cond ? a : b` binds the
        // condition, not the whole right side
        return `${leftText} = (${native}) (${this.printNode(right, identation)})`;
    }

    // ===== native return types (D-09) =====
    //
    // The native Java return a generated method declaration prints with, when its TS
    javaNativeReturnType(node): string | undefined {
        if (node === undefined || node.kind !== SyntaxKind.MethodDeclaration
            || node.name === undefined || node.type === undefined || node.body === undefined
            || !isClassDeclaration(node.parent)) {
            return undefined;
        }
        if (this.javaReturnTypeInProgress.has(node)) {
            return undefined; // a mutually recursive return chain reads as unproven
        }
        if (this.javaReturnTypeCache.has(node)) {
            return this.javaReturnTypeCache.get(node);
        }
        this.javaReturnTypeInProgress.add(node);
        const outerUsedDeclaredLocals = this.javaReturnTypeUsedDeclaredLocals;
        this.javaReturnTypeUsedDeclaredLocals = false;
        let result;
        try {
            result = this.javaNativeReturnTypeUncached(node);
        } finally {
            this.javaReturnTypeInProgress.delete(node);
        }
        const usedDeclaredLocals = this.javaReturnTypeUsedDeclaredLocals;
        this.javaReturnTypeUsedDeclaredLocals = outerUsedDeclaredLocals || usedDeclaredLocals;
        if (result !== undefined || !usedDeclaredLocals) {
            this.javaReturnTypeCache.set(node, result);
        }
        return result;
    }

    javaNativeReturnTypeUncached(node): string | undefined {
        const fileName = node.getSourceFile().fileName;
        const generated = JAVA_NATIVE_PARAMETER_GENERATED_FILES.test(fileName);
        // the printed base tier (below the transpile delimiter) may carry a Boolean return
        // when no venue in the program redeclares the name
        const baseTier = !generated && JAVA_NATIVE_PARAMETER_BASE_FILES.test(fileName) && this.javaIsPrintedMethod(node);
        if ((!generated && !baseTier) || this.isAsyncFunction(node)) {
            return undefined;
        }
        let target = this.javaNativeReturnTypeTarget(node);
        // an annotation the checker cannot carry (`any`, an unmodelled structure) still prints a
        // native return when EVERY return site prints the same carriable type
        if (target === undefined && !baseTier) {
            target = this.javaReturnTypeFromBody(node);
        }
        if (target === undefined || (baseTier && target !== 'Boolean')) {
            return undefined;
        }
        // D8: an override prints the base declaration's boxed signature; a Boolean base
        // signature binds every override to Boolean (Java return types are covariant only)
        const ancestor = this.getMethodOverride(node);
        const ancestorBoolean = ancestor !== undefined && this.javaNativeReturnType(ancestor) === 'Boolean';
        if (ancestorBoolean && (target !== 'Boolean' || !this.javaReturnSitesPrintType(node, target)
            || (this.javaMethodReturnsNonNullBoolean(ancestor, 0) && !this.javaMethodReturnsNonNullBoolean(node, 0)))) {
            throw new Error(`java: ${String((node.name as any).text)} overrides a Boolean base method but its returns do not all print Boolean`);
        }
        if (ancestor !== undefined && !ancestorBoolean) {
            return undefined;
        }
        if (!this.javaReturnSitesPrintType(node, target)) {
            return undefined;
        }
        return target;
    }

    // a native-Boolean method whose every return prints a primitive Java boolean (never null):
    // a call to it can be a condition as is (unboxing cannot throw)
    javaMethodReturnsNonNullBoolean(method, depth: number): boolean {
        if (method === undefined || depth > 3 || method.body === undefined) {
            return false;
        }
        const name = String((method.name as any)?.text);
        if (this.javaNativeReturnType(method) !== 'Boolean' && !JAVA_THIS_BOOLEAN_METHODS.has(name)) {
            return false;
        }
        let returns = 0;
        let ok = true;
        const scan = (n: Node) => {
            if (!ok || (n !== method && isFunctionLike(n))) {
                return;
            }
            if (isReturnStatement(n)) {
                returns++;
                ok = n.expression !== undefined && this.javaPrintsNonNullBoolean(n.expression, depth);
                return;
            }
            n.forEachChild(scan);
        };
        scan(method.body);
        return ok && returns > 0;
    }

    javaPrintsNonNullBoolean(node, depth: number): boolean {
        switch (node?.kind) {
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
            return true;
        case SyntaxKind.ParenthesizedExpression:
            return this.javaPrintsNonNullBoolean(node.expression, depth);
        case SyntaxKind.PrefixUnaryExpression:
            return node.operator === SyntaxKind.ExclamationToken; // prints `!` + a condition
        case SyntaxKind.BinaryExpression:
            return JAVA_BOOLEAN_OPERATOR_KINDS.has(node.operatorToken.kind);
        case SyntaxKind.ConditionalExpression:
            return this.javaPrintsNonNullBoolean(node.whenTrue, depth) && this.javaPrintsNonNullBoolean(node.whenFalse, depth);
        case SyntaxKind.CallExpression:
            return this.javaCallPrintsNonNullBoolean(node, depth + 1);
        }
        return false;
    }

    // `this.<name>(...)` resolving to a method proven by javaMethodReturnsNonNullBoolean
    javaCallPrintsNonNullBoolean(node, depth: number): boolean {
        if (this.isArrayIsArrayCall(node) || this.javaPreciseBooleanCall(node) || this.javaStringAffixCall(node)) {
            return true;
        }
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        let declaration;
        try {
            declaration = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
        } catch (e) {
            return false;
        }
        if (declaration === undefined || declaration.kind !== SyntaxKind.MethodDeclaration) {
            return false;
        }
        if (JAVA_THIS_BOOLEAN_METHODS.has(String(callee.name.text))) {
            return this.javaCallBooleanKind(node) === 'boolean';
        }
        return this.javaMethodReturnsNonNullBoolean(declaration, depth);
    }

    javaNativeReturnTypeTarget(node): string | undefined {
        let type;
        try {
            type = this.getChecker().getTypeAtLocation(node.type);
        } catch (e) {
            return undefined;
        }
        if (type === undefined) {
            return undefined;
        }
        const aliasSymbol = (type as any).getAliasSymbol?.();
        if (aliasSymbol !== undefined) {
            const name = aliasSymbol.name;
            const fileName = aliasSymbol.declarations?.[0]?.resolve()?.getSourceFile?.()?.fileName;
            if (fileName !== undefined && JAVA_NATIVE_PARAMETER_SOURCE_FILES.test(fileName) && (name === 'Str' || name === 'Bool')) {
                return name === 'Str' ? 'String' : 'Boolean';
            }
        }
        // a plain (non-alias) string annotation already prints String; the flag proof keeps
        // this rule consistent with the printer's own plain-string handling
        if (type.flags === TypeFlags.String) {
            return 'String';
        }
        // plain `boolean` is the true|false union: the Boolean bit, with no alias (`Bool` is handled above)
        if (aliasSymbol === undefined && (type.flags & TypeFlags.Boolean) !== 0) {
            return 'Boolean';
        }
        // an array annotation prints List<Object> slots from its own elements; a `string[]`
        // prints List<String> slots, so its own return keeps the boxed declaration
        if (!this.javaStringArrayAnnotation(node) && this.javaArrayReturnType(type)) {
            return JAVA_NATIVE_RETURN_LIST_TYPE;
        }
        return this.isJavaMapStructureType(type) ? JAVA_NATIVE_RETURN_MAP_TYPE : undefined;
    }

    // a return annotation that names a string array: `string[]`, `Str[]`, or the `Strings`
    // alias. Its printed slots are java.util.List<String>, so the List<Object> target never
    // fits, whatever the body returns.
    javaStringArrayAnnotation(node): boolean {
        const annotation = node?.type;
        if (annotation === undefined) {
            return false;
        }
        if (isArrayTypeNode(annotation)) {
            const element = annotation.elementType;
            if (element.kind === SyntaxKind.StringKeyword) {
                return true;
            }
            return isTypeReferenceNode(element) && isIdentifier(element.typeName)
                && (/^(?:Str|string)$/).test(String(element.typeName.text));
        }
        return isTypeReferenceNode(annotation) && isIdentifier(annotation.typeName)
            && (/^Strings$/).test(String(annotation.typeName.text));
    }

    // a tuple annotation (`[Bool, Dict]`, `[Str, Str, Bool]`): its destructured slots print as
    // Pair/List pairs at the call sites, so the return keeps the boxed declaration
    javaTupleAnnotation(node): boolean {
        return isTupleTypeNode(node?.type);
    }

    // the checker type of an array annotation whose element slots are not strings. A tuple
    // annotation stays out: its slots print as Pair/List pairs the return proof cannot see.
    javaArrayReturnType(type): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined || !checker.isArrayType(type) || checker.isTupleType(type)) {
            return false;
        }
        let element;
        try {
            element = checker.getTypeArguments(type)?.[0] ?? type.typeArguments?.[0];
        } catch (e) {
            element = undefined;
        }
        if (element === undefined) {
            return false;
        }
        const flags = (element as any).flags;
        // a plain string element keeps Object: the printed slots are java.util.List<String>
        return (flags & TypeFlags.StringLike) === 0;
    }

    // every `return` of the method body (nested functions are separate scopes) prints the
    // target Java type
    javaReturnSitesPrintType(method, target: string): boolean {
        const returns: any[] = [];
        const collect = (n) => {
            if (n === undefined) {
                return;
            }
            if (n !== method && isFunctionLike(n)) {
                return;
            }
            if (isReturnStatement(n)) {
                returns.push(n);
            }
            n.forEachChild(collect);
        };
        collect(method.body);
        if (returns.length === 0) {
            return false;
        }
        return returns.every((r) => r.expression !== undefined
            && this.javaExpressionPrintsType(r.expression, target));
    }

    // the carriable target every return site of the body prints, when the annotation names
    // none (`any`, an unmodelled structure): a body that only ever returns a fresh map is a
    // Map at runtime, one that only ever returns a fresh list is a List. A string-array
    // annotation keeps its boxed declaration (its slots are java.util.List<String>).
    javaReturnTypeFromBody(method): string | undefined {
        const candidates = (this.javaStringArrayAnnotation(method) || this.javaTupleAnnotation(method))
            ? [JAVA_NATIVE_RETURN_MAP_TYPE]
            : [JAVA_NATIVE_RETURN_MAP_TYPE, JAVA_NATIVE_RETURN_LIST_TYPE];
        for (const target of candidates) {
            if (this.javaReturnSitesPrintType(method, target)) {
                return target;
            }
        }
        return undefined;
    }

    javaExpressionPrintsType(expression, target: string): boolean {
        const node = this.javaUnwrapReturnExpression(expression);
        if (node === undefined) {
            return false;
        }
        if (node.kind === SyntaxKind.NullKeyword) {
            return true; // null is assignable to String / Boolean / Map
        }
        if (isIdentifier(node) && node.text === 'undefined') {
            return true;
        }
        if (node.kind === SyntaxKind.ConditionalExpression) {
            return this.javaExpressionPrintsType(node.whenTrue, target)
                && this.javaExpressionPrintsType(node.whenFalse, target);
        }
        let literal: boolean;
        if (target === JAVA_NATIVE_RETURN_MAP_TYPE) {
            literal = isObjectLiteralExpression(node); // a fresh HashMap literal
        } else if (target === JAVA_NATIVE_RETURN_LIST_TYPE) {
            // a fresh ArrayList<Object> literal; any other List producer is proven below
            literal = isArrayLiteralExpression(node);
        } else if (target === 'String') {
            literal = isStringLiteralLikeNode(node);
        } else if (target === 'Boolean') {
            // the printer's own proof that this expression prints a Java boolean (or a
            // Boolean box): the comparison helpers, `!`, the logical operators, boolean
            // literals and the verified boolean-returning calls
            literal = this.javaPrintsBooleanValue(node, new Set<any>(), 0);
        } else {
            return false;
        }
        return literal
            || this.javaReturnedParameterType(node) === target
            || this.javaReturnedCallType(node) === target
            || this.javaDeclaredReturnTarget(node, target)
            || (target === JAVA_NATIVE_RETURN_LIST_TYPE && this.javaReturnedObjectListCall(node))
            || (target === 'String' && this.javaStringCallReturn(node));
    }

    // a local whose emitted declaration the build layer already typed with the target Java
    // type (javaDeclaredLocalTypeResolver publishes exactly the printed `Map<String, Object> x`
    // / `List<Object> x` lines), so the return prints the target on that path
    javaDeclaredReturnTarget(node, target: string): boolean {
        if (!isIdentifier(node) || typeof this.javaDeclaredLocalTypeResolver !== 'function') {
            return false;
        }
        this.javaReturnTypeUsedDeclaredLocals = true;
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined) {
            return false;
        }
        let declared;
        try {
            declared = this.javaDeclaredLocalType(declaration);
        } catch (e) {
            return false;
        }
        if (declared === undefined) {
            return false;
        }
        const normalize = (type) => String(type).replace(/^final\s+/, '').replace(/\s+/g, '').replace(/^java\.util\./, '');
        return normalize(declared) === normalize(target);
    }

    // `this.toArray (x)` and `Object.keys/values (x)` print calls the hand-written runtime
    // declares `java.util.List<Object>` (BaseExchange.toArray, Helpers.objectKeys/objectValues)
    javaReturnedObjectListCall(node): boolean {
        if (!isCallExpression(node)) {
            return false;
        }
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee)) {
            return false;
        }
        const name = String(callee.name.text);
        if (JAVA_OBJECT_LIST_CALL_NAMES.has(name) && isIdentifier(callee.expression)
            && callee.expression.text === 'Object') {
            return true;
        }
        if (!JAVA_LIST_RETURN_BASE_METHODS.has(name) || callee.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        let declaration;
        try {
            declaration = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
        } catch (e) {
            return false;
        }
        const fileName = declaration?.getSourceFile?.()?.fileName;
        return fileName !== undefined && JAVA_STRING_RETURN_BASE_FILES.test(fileName);
    }

    javaUnwrapReturnExpression(expression) {
        if (expression === undefined) {
            return undefined;
        }
        let node = expression;
        while (node !== undefined && (isParenthesizedExpression(node) || isAsExpression(node)
            || isNonNullExpression(node) || isTypeAssertion(node)
            || node.kind === SyntaxKind.SatisfiesExpression)) {
            node = node.expression;
        }
        return node;
    }

    // an identifier bound to a parameter the printer itself declares with the target Java
    // type (javaNativeParameterType: Dict/Market/Currency/Str/Bool annotations)
    javaReturnedParameterType(node): string | undefined {
        if (!isIdentifier(node)) {
            return undefined;
        }
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined || !isParameterDeclaration(declaration)) {
            return undefined;
        }
        return this.javaNativeParameterType(declaration);
    }

    // a `this.<name> (...)` / `super.<name> (...)` return is the callee's native return type
    // (fixpoint over javaNativeReturnType)
    javaReturnedCallType(node): string | undefined {
        if (!isCallExpression(node)) {
            return undefined;
        }
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee)
            || (callee.expression.kind !== SyntaxKind.ThisKeyword
                && !(isIdentifier(callee.expression) && callee.expression.text === 'super'))) {
            return undefined;
        }
        let declaration;
        try {
            declaration = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
        } catch (e) {
            return undefined;
        }
        if (declaration === undefined || declaration.kind !== SyntaxKind.MethodDeclaration) {
            return undefined;
        }
        return this.javaNativeReturnType(declaration);
    }

    // a `this.<name> (...)` return of a hand-written base String producer: the resolved
    // signature must still live in the base tier (a venue override prints its own boxed
    // Object signature)
    javaStringCallReturn(node): boolean {
        if (!isCallExpression(node)) {
            return false;
        }
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        if (!JAVA_STRING_RETURN_BASE_METHODS.has(callee.name.text as string)) {
            return false;
        }
        let declaration;
        try {
            declaration = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
        } catch (e) {
            return false;
        }
        if (declaration === undefined) {
            return false; // an unresolvable call prints Helpers.callDynamically (Object)
        }
        const fileName = declaration.getSourceFile?.()?.fileName;
        return fileName !== undefined && JAVA_STRING_RETURN_BASE_FILES.test(fileName);
    }

    // the alias a parameter's annotation names; `OrderType` ('limit' | 'market' | string) reduces
    // to plain `string` and keeps no aliasSymbol, so read the annotation's type reference instead
    javaParameterAliasSymbol(node, type, checker) {
        const symbol = (type as any).getAliasSymbol?.() ?? (type as any).getSymbol?.();
        if (symbol !== undefined || node.type === undefined || !isTypeReferenceNode(node.type)) {
            return symbol;
        }
        const referenced = checker.getSymbolAtLocation(node.type.typeName);
        const alias = referenced !== undefined && (referenced.flags & SymbolFlags.Alias)
            ? checker.getAliasedSymbol(referenced) : referenced;
        return alias !== undefined && (alias.flags & SymbolFlags.TypeAlias) ? alias : undefined;
    }

    // the annotation proof alone, without the heritage check
    javaNativeParameterTypeOf(node): string | undefined {
        if (node === undefined || !isParameterDeclaration(node)
            || node.initializer !== undefined || node.dotDotDotToken !== undefined) {
            return undefined;
        }
        const method = node.parent;
        const testFileName = node.getSourceFile().fileName.replace(/\\/g, '/');
        const testTier = JAVA_TEST_TIER_FILES.test(testFileName);
        if (testTier) {
            // a free function of the test tier prints as a class method with no ancestor override
            if (!isFunctionDeclaration(method) && !isMethodDeclaration(method)) {
                return undefined;
            }
            // an async body that writes a parameter reads an Object copy of it, not the typed slot
            if (this.isAsyncFunction(method) && this.javaParameterIsWritten(node)) {
                return undefined;
            }
        } else if (method === undefined || !isMethodDeclaration(method) || !isClassDeclaration(method.parent)) {
            return undefined;
        }
        if (!JAVA_NATIVE_PARAMETER_BASE_FILES.test(node.getSourceFile().fileName)
            && !JAVA_NATIVE_PARAMETER_GENERATED_FILES.test(node.getSourceFile().fileName) && !testTier) {
            return undefined; // a hand-written java class declares this method, not the printer
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const type = checker.getTypeAtLocation(node);
        if (type === undefined) {
            return undefined;
        }
        const excluded = JAVA_NATIVE_PARAMETER_EXCLUDED_POSITIONS[(method.name as any)?.text];
        if (excluded !== undefined && excluded.includes(method.parameters.indexOf(node))) {
            return undefined;
        }
        const baseList = testTier ? undefined : this.javaBaseListParameterTypeOf(node, method, type, checker);
        if (baseList !== undefined) {
            return baseList;
        }
        const symbol = this.javaParameterAliasSymbol(node, type, checker);
        const name = symbol?.name;
        if (testTier && (name === 'Strings' || this.javaIsStringArrayType(checker, type))) {
            // a `Strings` slot stays Object: the test tier's own callers hold List<Object> locals
            // and Java generics are invariant, so a typed slot rejects them
            return undefined;
        }
        if (name === undefined) {
            return this.javaPlainParameterTypeOf(node, type, checker);
        }
        const aliasType = JAVA_NATIVE_PARAMETER_TYPES[name];
        const classType = aliasType === undefined ? this.javaNativeParameterClassType(name, symbol) : undefined;
        if (aliasType === undefined && classType === undefined) {
            return this.javaPlainParameterTypeOf(node, type, checker);
        }
        if (classType !== undefined) {
            return classType; // the class declaration itself is the proof (see javaNativeParameterClassType)
        }
        const declaration = symbol?.declarations?.[0]?.resolve();
        const fileName = declaration?.getSourceFile?.()?.fileName;
        return JAVA_NATIVE_PARAMETER_SOURCE_FILES.test(fileName ?? '') ? aliasType : this.javaPlainParameterTypeOf(node, type, checker);
    }

    // Whole-repo facts about a method name that one program cannot show (the base-tier program holds Exchange.ts
    // and its imports, not the venues). The embedding build layer answers with plain data: how many ts/src
    // declarations carry the name, how many non-call `.name` references / string literals mention it, whether
    // the hand-written Java above the transpile delimiters mentions it, and the argument nodes of every
    // `this.name (..)` call outside `ownFile`. All judgement stays here. With no consumer installed nothing changes.
    javaRepoMethodUses: ((name: string, ownFile: string) => { declared: number, mentions: number, handWritten: boolean, calls: Node[][] } | undefined) | undefined;

    // A fixed `any[]` / `number[]` parameter of a method the printer emits from the base tier prints
    // `java.util.List<Object>` when (a) the checker types it a plain array (not a tuple, not `string[]`),
    // (b) the body never writes it and no ancestor declares the method, (c) the name is declared once in the
    // repo, never referenced other than as `this.name (..)` and never mentioned by hand-written Java, and
    // (d) there is a caller and every caller hands a value that prints as a bare List (array literal, base list
    // producer, a local the build layer declared `List<Object>`), so no call gains a checkcast and none can throw.
    // A caller whose local is not published yet answers undefined; the embedding layer's re-print asks again.
    javaBaseListParameterTypeOf(node, method, type, checker): string | undefined {
        if (typeof this.javaRepoMethodUses !== 'function'
            || !JAVA_BASE_LIST_PARAMETER_FILES.test(node.getSourceFile().fileName)
            || !isIdentifier(method.name) || !this.javaIsPrintedMethod(method)
            || !checker.isArrayType(type) || checker.isTupleType(type)) {
            return undefined;
        }
        const element = checker.getTypeArguments(type)?.[0];
        if (element === undefined || (element.flags & (TypeFlags.Any | TypeFlags.Number)) === 0) {
            return undefined;
        }
        if (this.getMethodOverride(method) !== undefined || this.javaParameterIsWritten(node)) {
            return undefined;
        }
        const position = method.parameters.indexOf(node);
        const name = String(method.name.text);
        const ownFile = node.getSourceFile().fileName;
        const uses = this.javaRepoMethodUses(name, ownFile);
        if (uses === undefined || uses.declared !== 1 || uses.mentions > 0 || uses.handWritten) {
            return undefined;
        }
        const internal = this.javaThisCallsInFile(node.getSourceFile(), name);
        if (internal.length + uses.calls.length === 0) {
            return undefined;
        }
        const producerDeclared = (producer: string) => this.javaRepoMethodUses?.(producer, ownFile)?.declared === 1;
        const listOutside = uses.calls.every((args) => args.length > position && !isSpreadElement(args[position])
            && this.javaSyntacticListArgument(args[position], producerDeclared));
        const listInside = internal.every((call) => {
            const arg = call.arguments?.[position];
            return arg !== undefined && !isSpreadElement(arg) && this.javaPrintsListArgument(arg);
        });
        return listOutside && listInside ? JAVA_NATIVE_RETURN_LIST_TYPE : undefined;
    }

    // every `this.<name> (..)` call expression of a source file, collected once per file
    private javaThisCallIndex = new WeakMap<object, Map<string, any[]>>();
    javaThisCallsInFile(file, name: string): any[] {
        let index = this.javaThisCallIndex.get(file);
        if (index === undefined) {
            index = new Map<string, any[]>();
            const collect = (n: Node) => {
                if (isCallExpression(n) && isPropertyAccessExpression(n.expression)
                    && n.expression.expression.kind === SyntaxKind.ThisKeyword) {
                    const key = String(n.expression.name.text);
                    index!.set(key, (index!.get(key) ?? []).concat([n]));
                }
                n.forEachChild(collect);
            };
            collect(file);
            this.javaThisCallIndex.set(file, index);
        }
        return index.get(name) ?? [];
    }

    // an argument node that needs no program to show it prints a bare List: an array literal without spread
    // or hole, or a `this.<producer> (..)` call of a hand-written list producer the repo declares once
    javaSyntacticListArgument(arg, producerDeclared: (name: string) => boolean): boolean {
        let node = arg;
        while (node !== undefined && isParenthesizedExpression(node)) {
            node = node.expression;
        }
        if (isArrayLiteralExpression(node)) {
            return !node.elements.some((e) => isSpreadElement(e) || e.kind === SyntaxKind.OmittedExpression);
        }
        return isCallExpression(node) && isPropertyAccessExpression(node.expression)
            && node.expression.expression.kind === SyntaxKind.ThisKeyword
            && JAVA_LIST_ARGUMENT_BASE_METHODS.has(String(node.expression.name.text))
            && producerDeclared(String(node.expression.name.text));
    }

    // an argument whose printed Java is already a `java.util.List<Object>`-compatible value: an array literal
    // without spread (always `new ArrayList<Object>(Arrays.asList(..))`), a base `this.toArray/aggregate/sortBy/
    // sortBy2/filterBy (..)` call (hand-written, resolved by signature), or a local the build layer declared
    // `List<Object>`. Such an argument needs no checkcast into a List slot.
    javaPrintsListArgument(arg): boolean {
        let node = arg;
        while (node !== undefined && isParenthesizedExpression(node)) {
            node = node.expression;
        }
        if (isArrayLiteralExpression(node)) {
            return !node.elements.some((e) => isSpreadElement(e) || e.kind === SyntaxKind.OmittedExpression);
        }
        if (isCallExpression(node)) {
            const callee = node.expression;
            if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword
                || !JAVA_LIST_ARGUMENT_BASE_METHODS.has(String(callee.name.text))) {
                return false;
            }
            try {
                const fileName = this.getChecker().getResolvedSignature(node)?.declaration?.resolve()?.getSourceFile?.()?.fileName;
                return fileName !== undefined && JAVA_LIST_ARGUMENT_BASE_FILES.test(fileName.replace(/\\/g, '/'));
            } catch (e) {
                return false;
            }
        }
        if (isIdentifier(node) && this.printNode(node, 0) === node.text) {
            const declared = this.javaDeclaredTypeOf(node);
            return declared !== undefined
                && declared.replace(/^final\s+/, '').replace(/\s+/g, '').replace(/^java\.util\./, '') === 'List<Object>';
        }
        return false;
    }

    // the Java class a class-typed annotation names: only a name in
    // JAVA_NATIVE_PARAMETER_CLASS_TYPES whose symbol resolves to a CLASS declaration in the
    // ts/src file that declares it (an interface, a type alias or a same-named class from
    // another module is not that class)
    javaNativeParameterClassType(name: string, symbol: any): string | undefined {
        const javaType = JAVA_NATIVE_PARAMETER_CLASS_TYPES[name];
        if (javaType === undefined) {
            return undefined;
        }
        for (const declaration of symbol?.declarations ?? []) {
            const resolved = declaration?.resolve?.() ?? declaration;
            if (resolved === undefined || resolved.kind !== SyntaxKind.ClassDeclaration) {
                continue;
            }
            const fileName = (resolved.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
            if (JAVA_NATIVE_PARAMETER_CLASS_FILES.test(fileName)) {
                return javaType;
            }
        }
        return undefined;
    }

    // the generated test tier's async wrapper copies hold the typed parameter's value
    javaTestTierWrapperType(param): string | undefined {
        const fileName = (param?.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
        if (!JAVA_TEST_TIER_FILES.test(fileName) || this.javaParameterIsWritten(param)) {
            return undefined;
        }
        return this.javaNativeParameterType(param);
    }

    // a generated venue method's PLAIN annotation prints its Java type: a TS `string` is always a
    // String box, a string-indexed dict a HashMap. Base-tier declarations are hand-written Java
    // (`Object`), so the heritage walk keeps the box for anything overriding them.
    javaPlainParameterTypeOf(node, type, checker): string | undefined {
        const fileName = node.getSourceFile().fileName.replace(/\\/g, '/');
        const testTier = JAVA_TEST_TIER_FILES.test(fileName);
        if (!JAVA_NATIVE_PARAMETER_GENERATED_FILES.test(fileName) && !testTier) {
            return undefined;
        }
        if ((type as any).getAliasSymbol?.() !== undefined || (type as any).isUnionType?.()) {
            return undefined;
        }
        if ((type.flags & TypeFlags.String) !== 0) {
            return this.STRING_KEYWORD;
        }
        if (testTier) {
            return undefined; // the test tier types a plain `string` annotation only
        }
        if ((type.flags & TypeFlags.Object) === 0) {
            return undefined;
        }
        const value = checker.getIndexTypeOfType(type, IndexKind.String);
        if (value === undefined || (value.flags & (TypeFlags.Any | TypeFlags.Unknown)) === 0) {
            return undefined;
        }
        return this.OBJECT_KEYWORD;
    }

    // `k` where the consumer declares k as a Java String: the helper's String branch (the
    // only one that can answer true for a map) is the native lookup, and no null key can
    // reach containsKey
    javaDeclaredStringType(expression) {
        const type = this.javaDeclaredTypeOf(expression);
        return type !== undefined && JAVA_DECLARED_STRING_TYPE.test(type);
    }

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right;
        const op = node.operatorToken.kind;

        if (left.kind === SyntaxKind.Identifier) {
            this.ReassignedVars[this.getVarKey(left)] = true;
        }

        if (left.kind === SyntaxKind.TypeOfExpression) {
            const typeOfExpression = this.handleTypeOfInsideBinaryExpression(
                node,
                identation
            );
            if (typeOfExpression) return typeOfExpression;
        }

        // a write to a parameter the printer declared natively casts its right side
        if (op === SyntaxKind.EqualsToken && left.kind === SyntaxKind.Identifier) {
            const assignment = this.javaParameterAssignmentCast(left, right, identation);
            if (assignment !== undefined) {
                return assignment;
            }
        }

        // destructuring: [a,b] = this.method()
        if (
            op === SyntaxKind.EqualsToken &&
            left.kind === SyntaxKind.ArrayLiteralExpression
        ) {
            const arrayBindingPatternElements = left.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => {
                this.ReassignedVars[this.getVarKey(e)] = true;
                return this.printNode(e, 0);
            });
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement =
                `var ${syntheticName} = ${this.printNode(right, 0)};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                // a destructuring target the printer declares natively carries the cast the
                // synthesized `.get(index)` result needs (a plain `Object` read)
                let elementValue = `((java.util.List<Object>) ${syntheticName}).get(${index})`;
                const target = arrayBindingPatternElements[index];
                if (isIdentifier(target)) {
                    const declaration = this.javaDeclarationOfIdentifier(target);
                    const native = declaration !== undefined && isParameterDeclaration(declaration)
                        ? (this.javaNativeParameterType(declaration) ?? this.javaSplitParameterWriteType(declaration)) : undefined;
                    if (native === 'Long') {
                        elementValue = `Helpers.toLongOrNull(${elementValue})`;
                    } else if (native !== undefined) {
                        elementValue = `(${native}) ${elementValue}`;
                    }
                }
                const terminator = index < parsedArrayBindingElements.length - 1 ? ";\n" : "";
                arrayBindingStatement += this.getIden(identation) + `${e} = ${elementValue}` + terminator;
            });

            return arrayBindingStatement;
        }

        // ---------------------------------------------------------------
        // setter for element-access assignments:  a[b] = v
        // ---------------------------------------------------------------
        if (op === SyntaxKind.EqualsToken &&
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

            // Build GetValue(GetValue( ... )) chain for all but the last key; the first
            // step reads the receiver itself, so a declared map indexes natively and only
            // the `any` steps above it keep the helper (Go: goElementWriteChain).
            let acc = containerStr;
            let firstKey = 0;
            const chainRead = (keyStrs.length > 1) ? this.javaDeclaredChainContainerRead(left, keys.length) : undefined;
            if ((keyStrs.length > 1) && this.javaDeclaredMapReceiver(baseExpr)
                && isStringLiteralLikeNode(keys[0])) {
                acc = `${containerStr}.get(${keyStrs[0]})`;
                firstKey = 1;
            } else if (chainRead !== undefined) {
                acc = chainRead;
                firstKey = 1;
            } else if (keyStrs.length > 1) {
                // `this.<field>[k1][k2] = v`: the bottom step reads the hand-written base map
                // field natively (JAVA_FIELD_TYPES), every step above it keeps the helper
                const fieldRead = this.javaFieldMapReadText(baseExpr, keys[0])
                    ?? (isStringLiteralLikeNode(keys[0]) && this.javaWsClientMapField(baseExpr) !== undefined
                        ? `(${containerStr} == null ? null : ${containerStr}.get(${keyStrs[0]}))`
                        : this.javaWsClientMapReadText(baseExpr, keys[0]));
                if (fieldRead !== undefined) {
                    acc = fieldRead;
                    firstKey = 1;
                }
            }
            for (let i = firstKey; i < keyStrs.length - 1; i++) {
                acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
            }

            const prefixes = "";


            const lastKey = keyStrs[keyStrs.length - 1];
            const rhs     = this.printNode(right, 0);
            const keyArg  = this.elementWriteKeyText(keys[keys.length - 1], lastKey);

            if (this.elementWriteTargetsMap(left.expression, baseExpr, keys, right)) {
                // a receiver declared as a Map already carries the type the put binds on
                const target = (keys.length === 1 && (this.javaDeclaredMapReceiver(baseExpr) || this.javaWsClientObjectMapReceiver(baseExpr)))
                    ? acc : `((${this.OBJECT_KEYWORD})${acc})`;
                return `${prefixes}${target}.put(${keyArg}, ${rhs})`;
            }
            // a ws Client `Map<String, Object>` takes the put for any value under a String-proven key
            if (keys.length === 1 && this.javaWsClientObjectMapReceiver(baseExpr)
                && (isStringLiteralLikeNode(keys[0]) || this.javaDeclaredStringType(keys[0]))) {
                return `${prefixes}${acc}.put(${lastKey}, ${rhs})`;
            }
            // a declared Map local takes a non-null value: the helper's only non-put branch is
            // the ConcurrentHashMap null removal, so the native put is the same write
            if (keys.length === 1 && this.javaDeclaredMapReceiver(baseExpr)
                && (isStringLiteralLikeNode(keys[0]) || this.javaDeclaredStringType(keys[0]))
                && this.javaPrintsNonNullValue(right)) {
                return `${prefixes}${acc}.put(${lastKey}, ${rhs})`;
            }
            // `this.<field>[k] = v` on a header field the base declares Map<String, Object>: the
            // field declaration is the type put binds on, and a non-null value makes the helper's
            // ConcurrentHashMap null-removal branch unreachable, so the two writes are one
            if (keys.length === 1 && this.javaMapWriteFieldReceiver(baseExpr)
                && (isStringLiteralLikeNode(keys[0]) || this.javaDeclaredStringType(keys[0]))
                && !this.elementWriteValueMayBeNull(right)) {
                return `${prefixes}${acc}.put(${lastKey}, ${rhs})`;
            }
            // `this.<cache>[k] = v` on a plain HashMap cache of the base header: the helper's Map branch
            // stores a null value too, so a String key makes it the native put
            if (keys.length === 1 && this.javaPlainCacheFieldReceiver(baseExpr)
                && this.javaStringProvenKey(keys[0])) {
                return `${prefixes}${acc}.put(${lastKey}, ${rhs})`;
            }
            // `this.<owner store>[lit] = v`: the store's `put(key, null)` removes the key like the
            // helper's null write does, so any value is the same write
            if (keys.length === 1 && this.javaOwnerStoreFieldReceiver(baseExpr)
                && isStringLiteralLikeNode(keys[0])) {
                // the store's `put(key, null)` removes the key, so a null literal prints the removal
                return this.isNullishLiteral(this.unwrapPrintTransparentExpression(right))
                    ? `${prefixes}${acc}.remove(${lastKey})`
                    : `${prefixes}${acc}.put(${lastKey}, ${rhs})`;
            }
            // a statement-level write of a plain map field from an owner-executor member, String key and
            // no box cast in either operand: the field is never null, so put takes any value
            if (keys.length === 1 && node.parent?.kind === SyntaxKind.ExpressionStatement
                && this.javaPlainMapFieldReceiver(baseExpr)
                && (isStringLiteralLikeNode(this.unwrapPrintTransparentExpression(keys[0])) || this.javaDeclaredStringType(this.unwrapPrintTransparentExpression(keys[0])))
                && this.javaInOwnerMember(node) && !JAVA_BOX_CAST.test(lastKey) && !JAVA_BOX_CAST.test(rhs)) {
                return `${prefixes}${acc}.put(${lastKey}, ${rhs})`;
            }
            if (this.javaHx4MapPutIsNative(baseExpr, keys)) {
                return `${prefixes}${acc}.put(${keyArg}, ${rhs})`;
            }
            // `this.<field>[k] = v` where the file only ever builds the field as a plain HashMap
            if (keys.length === 1 && isPropertyAccessExpression(baseExpr)
                && this.javaFileBuiltMapField(baseExpr, baseExpr.name.text, true)) {
                return `${prefixes}((java.util.Map<Object, Object>) (java.util.Map<?, ?>) ${acc}).put(${lastKey}, ${rhs})`;
            }

            return `${prefixes}Helpers.addElementToObject(${acc}, ${lastKey}, ${rhs})`;
        }

        if (op === SyntaxKind.InKeyword) {
            const objectType = this.getChecker().getTypeAtLocation(right);
            const keyType = this.getChecker().getTypeAtLocation(left);
            const objText = this.printNode(right, 0);
            const keyText = this.printNode(left, 0);
            // A key the checker does not prove a Java String: the helper's map branch and containsKey both
            // answer false for it, and the null test keeps ConcurrentHashMap/TreeMap receivers from throwing
            // on a null key. The key prints once per guard, so it must be a side-effect-free read.
            let guarded: string | undefined;
            if (this.isJavaStringType(keyType) || this.javaDeclaredStringType(left)) {
                guarded = '';
            } else if (this.javaSideEffectFreeReference(left) && !this.javaOperandPrintsPrimitiveNumber(left)
                && !this.isNullishLiteral(left)
                && left.kind !== SyntaxKind.TrueKeyword && left.kind !== SyntaxKind.FalseKeyword) {
                guarded = `${keyText} != null && `;
            }
            const withGuard = (read: string) => (guarded ? `(${guarded}${read})` : read);
            if (guarded !== undefined) {
                // the declaration the pass rewrote already carries the map type (and, for a
                // `this.` field or a retyped local, the surface that names it): no cast needed
                if (this.javaDeclaredMapReceiver(right)) {
                    return withGuard(`${objText}.containsKey(${keyText})`);
                }
                // a ws Client map (or a local bound to one) is never null and binds containsKey with no cast
                if (this.javaWsClientMapReceiver(right)) {
                    // an `any` client (the base tier's `client: any`) is a TS-unchecked receiver: a non-literal key keeps
                    // its null test there, exactly as the helper's inOp answers false for it
                    if (guarded === '' && this.javaWsClientReceiverIsAny(right) && !isStringLiteralLikeNode(left)
                        && this.javaSideEffectFreeReference(left) && !this.javaOperandPrintsPrimitiveNumber(left)) {
                        return `(${keyText} != null && ${objText}.containsKey(${keyText}))`;
                    }
                    return withGuard(`${objText}.containsKey(${keyText})`);
                }
                if (this.isJavaMapType(objectType)) {
                    return withGuard(`((java.util.Map<?, ?>)${objText}).containsKey(${keyText})`);
                }
                // `Dictionary | undefined` (a no-overload safe* signature): the helper answers
                // false for the nullish arm, the guard keeps exactly that
                if (this.isJavaNullableMapType(objectType) && this.javaRepeatableOperand(right)) {
                    return `(${objText} != null && ${guarded}((java.util.Map<?, ?>)${objText}).containsKey(${keyText}))`;
                }
            }
            return `Helpers.inOp(${objText}, ${keyText})`;
        }

        const hx4J05 = this.printHx4J05ModComparison(left, right, op);
        if (hx4J05 !== undefined) {
            return hx4J05;
        }
        // native comparison when both operands provably print as Java numbers. `>` is exact for every
        // numeric pair (isGreaterThan is a toDouble compare, NaN included); `>=` / `<` / `<=` also go
        // through the helper's isEqual, so they need operands isEqual reproduces exactly.
        if (op === SyntaxKind.LessThanToken || op === SyntaxKind.GreaterThanToken ||
            op === SyntaxKind.LessThanEqualsToken || op === SyntaxKind.GreaterThanEqualsToken) {
            const leftKind = this.javaPrimitiveOperandKind(left);
            const rightKind = this.javaPrimitiveOperandKind(right);
            const orderingSafe = op === SyntaxKind.GreaterThanToken
                || this.javaComparisonOperandsAreExact(left, leftKind, right, rightKind);
            if (leftKind !== undefined && rightKind !== undefined && orderingSafe) {
                return `${this.printNode(left, 0)} ${this.SupportedKindNames[op]} ${this.printNode(right, 0)}`;
            }
            const declaredCompare = this.printDeclaredNumericComparison(left, right, op);
            if (declaredCompare !== undefined) {
                return declaredCompare;
            }
        }

        // only print the operands when this op is actually handled here; otherwise
        // the base printBinaryExpression prints them, and doing it eagerly means
        // every unhandled binary expression gets its subtrees printed twice
        if (op === SyntaxKind.PlusEqualsToken || op === SyntaxKind.MinusEqualsToken || op in this.binaryExpressionsWrappers) {
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);

            const inlined = this.printInlineHelperArithmetic(left, right, leftText, rightText, op);
            if (inlined !== undefined) {
                return inlined;
            }
            const declaredBox = this.printDeclaredBoxArithmetic(node, left, right, leftText, rightText, op);
            if (declaredBox !== undefined) {
                return declaredBox;
            }


            if (op === SyntaxKind.PlusEqualsToken) {
                return `${leftText} = Helpers.add(${leftText}, ${rightText})`;
            }

            if (op === SyntaxKind.MinusEqualsToken) {
                return `${leftText} = Helpers.subtract(${leftText}, ${rightText})`;
            }

            const wrapper = this.binaryExpressionsWrappers[op];
            const nativeEquality = this.printNativeEqualityIfProvable(node, leftText, rightText);
            if (nativeEquality !== undefined) {
                return nativeEquality;
            }
            return `${wrapper[0]}${leftText}, ${rightText}${wrapper[1]}`;
        }

        return undefined;
    }


    // dict-shaped values are Map<String, Object> in the Java port: raw HashMap/ConcurrentHashMap
    // or a types.TypedMap view (AbstractMap<String, Object> over the raw payload). Proven by the
    // checker (string index signature, or an interface/alias declared in the base types file).
    // a concrete (non-any, non-union, non-generic) type the structure proofs below can reason about
    javaConcreteStructureType(type) {
        const excludedFlags = TypeFlags.Any | TypeFlags.Unknown | TypeFlags.Union
            | TypeFlags.Intersection | TypeFlags.Undefined | TypeFlags.Null
            | TypeFlags.TypeParameter | TypeFlags.Conditional | TypeFlags.Never;
        return type !== undefined && (type.flags & excludedFlags) === 0;
    }

    isJavaMapStructureType(type) {
        if (!this.javaConcreteStructureType(type)) {
            return false;
        }
        const checker = this.getChecker();
        if (checker.isArrayType(type) || checker.isTupleType(type)) {
            return false;
        }
        if (type.getStringIndexType() !== undefined) {
            return true;
        }
        const symbol = (type as any).getAliasSymbol?.() ?? type.getSymbol?.();
        const declaration = symbol?.declarations?.[0]?.resolve();
        const fileName = declaration?.getSourceFile?.()?.fileName;
        return fileName !== undefined && /(^|\/)ts\/src\/base\/types\.ts$/.test(fileName);
    }

    // tuples are List<Object> in the Java port (types.TypedList). Only an index inside the
    // tuple's required elements goes native: .get(i) throws out of range where the helper
    // returns null, so non-tuple array reads (any[], string[], ...) keep the helper.
    isJavaListStructureType(type) {
        return this.javaConcreteStructureType(type) && this.getChecker().isTupleType(type);
    }

    tupleRequiredElementCount(type) {
        const flags = ((type as any)?.isTypeReference?.() ? (type as any).getTarget().elementFlags : undefined) ?? (type as any)?.elementFlags ?? [];
        let required = 0;
        for (const flag of flags) {
            if (flag !== ElementFlags.Optional && flag !== ElementFlags.Rest) {
                required++;
            } else {
                break;
            }
        }
        return required;
    }

    // non-tuple array reads: the Java representation is java.util.List (the printer maps every
    // array type to one), but neither the receiver nor the index is bounded statically, so the
    // read keeps the helper's null / off-range outcomes.
    isJavaArrayStructureType(type) {
        if (!this.javaConcreteStructureType(type)) {
            return false;
        }
        const checker = this.getChecker();
        if (checker.isTupleType(type)) {
            return false; // handled by the tuple branch, where the bound is provable
        }
        return checker.isArrayType(type);
    }

    // the null-safe element read prints its receiver once per guard; only a reference whose
    // printed Java has no side effects (identifier, `this`/`this.field` chain) may repeat it.
    javaSideEffectFreeReference(node) {
        if (node === undefined) {
            return false;
        }
        switch (node.kind) {
        case SyntaxKind.Identifier:
        case SyntaxKind.ThisKeyword:
            return true;
        case SyntaxKind.ParenthesizedExpression:
        case SyntaxKind.PropertyAccessExpression:
            return this.javaSideEffectFreeReference(node.expression);
        default:
            return false;
        }
    }

    // receivers whose printed elements the ccxt post-pass types as String FROM the helper call
    // (`x.split(sep)` and string-literal array producers): those locals narrow to String only
    // while the read prints `Helpers.GetValue(`, so their reads keep the helper.
    javaStringElementsReceiver(node) {
        if (!isIdentifier(node)) {
            return false;
        }
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        const initializer = declaration !== undefined && isVariableDeclaration(declaration) ? declaration.initializer : undefined;
        if (initializer === undefined) {
            return false;
        }
        if (isCallExpression(initializer) && isPropertyAccessExpression(initializer.expression)) {
            return initializer.expression.name?.text === 'split';
        }
        if (isArrayLiteralExpression(initializer)) {
            return initializer.elements.length > 0 && initializer.elements.every((element) =>
                element.kind === SyntaxKind.StringLiteral
                || element.kind === SyntaxKind.NoSubstitutionTemplateLiteral);
        }
        return false;
    }

    isLeftSideOfAssignment(node) {
        const parent = node.parent;
        if (parent?.kind !== SyntaxKind.BinaryExpression || parent.left !== node) {
            return false;
        }
        return JAVA_ASSIGNMENT_OPERATOR_KINDS.has(parent.operatorToken.kind);
    }

    // The declared Java type of a local is known to the pass that rewrites the declaration
    // text (build/java-local-types.js): it records every local it typed here. Reads consult
    // it; with no consumer installed the table is empty and every read keeps the helper.
    javaDeclaredLocalTypeResolver: ((declaration: Node) => string | undefined) | undefined;
    // the type the embedding layer's destructuring pass gave a `const [ a, p ] = ...` element
    javaBindingElementTypeResolver: ((declaration: Node) => string | undefined) | undefined;

    // the declaration node behind an identifier, when the checker resolves one
    javaDeclarationOfIdentifier(expression) {
        if (expression === undefined || !isIdentifier(expression)) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(expression);
        const declaration = symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve();
        const kind = declaration?.kind;
        return kind === SyntaxKind.VariableDeclaration || kind === SyntaxKind.Parameter ? declaration : undefined;
    }

    // `x["lit"]` where the consumer declares x as a Java map: the native read returns the
    // element or null, exactly what the helper's Map branch returns, and the declaration
    // already carries the type, so no cast is needed.
    javaDeclaredMapReceiver(expression) {
        const declaration = this.javaDeclarationOfIdentifier(expression);
        if (declaration === undefined) {
            return false;
        }
        if (expression.text !== declaration.name?.text) {
            return false; // a capture rename prints `final Object finalX = x` (Object)
        }
        const type = this.javaDeclaredTypeOfDeclaration(declaration);
        return type !== undefined && JAVA_DECLARED_MAP_TYPES.test(type);
    }

    // `this.<field>` for a BaseExchange.java field declared Map<String, Object>
    javaMapWriteFieldReceiver(expression): boolean {
        if (expression === undefined || !isPropertyAccessExpression(expression)) {
            return false;
        }
        if (expression.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        return JAVA_MAP_WRITE_FIELDS.has(expression.name.text);
    }

    // hand-written BaseExchange.java fields declared `Map<String, Object>` over a single-owner store
    // (`options = new SynchronizedOptions ()`): the map lives on the state-owner thread and its
    // `put(key, null)` removes the key, which is exactly the contract of the helper's element write.
    // The embedding build layer names them (it reads the hand-written header); empty = every site
    // keeps the helper.
    javaOwnerStoreFields: ReadonlySet<string> = new Set<string>();

    // `this.<owner store>` keys the hand-written base hands over through an owner field instead
    // of a store entry (loadMarketsHelper sets it, the same chain clears it). Value = [accessor with a
    // null default, accessor with an empty-map default]; filled by the build layer from the header.
    javaOwnerStoreHandoffs: { [key: string]: [string, string] } = {};

    // BaseExchange.java fields declared `Map<String, Object> f = new HashMap<>()` that the header only
    // ever reassigns to a fresh HashMap: `m.put(k, v)` stores a null value like the helper does.
    // Named by the build layer from the header; empty = every site keeps the helper.
    javaPlainCacheFields: ReadonlySet<string> = new Set<string>();

    // `this.<cache>` whose TS declaration types the values (an `any`-valued bag is reassigned freely)
    javaPlainCacheFieldReceiver(expression): boolean {
        if (expression === undefined || !isPropertyAccessExpression(expression)
            || expression.expression.kind !== SyntaxKind.ThisKeyword
            || !this.javaPlainCacheFields.has(expression.name.text)) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const value = checker.getIndexTypeOfType(checker.getTypeAtLocation(expression), IndexKind.String);
        return value !== undefined && (value.flags & (TypeFlags.Any | TypeFlags.Unknown)) === 0;
    }

    // a key Java proves String: a literal, an `x as string` (prints `((String)x)`) or a String-declared name
    javaStringProvenKey(key): boolean {
        if (isStringLiteralLikeNode(key)) {
            return true;
        }
        let node = key;
        while (isParenthesizedExpression(node)) {
            node = node.expression;
        }
        return (isAsExpression(node) && node.type?.kind === SyntaxKind.StringKeyword) || this.javaDeclaredStringType(node);
    }

    // `this.<cache>[k]` with a non-literal String key: GetValue answers null for a null receiver or
    // key and the plain map get is its Map branch. The key prints twice, so it must be repeatable.
    javaPlainCacheReadText(receiver, key): string | undefined {
        if (isStringLiteralLikeNode(key) || !this.javaPlainCacheFieldReceiver(receiver) || !this.javaStringProvenKey(key)) {
            return undefined;
        }
        let operand = key;
        while (isParenthesizedExpression(operand) || isAsExpression(operand)) {
            operand = operand.expression;
        }
        if (!isIdentifier(operand)) {
            return undefined;
        }
        const target = this.printNode(receiver, 0);
        const keyText = this.printNode(operand, 0);
        return `(${target} == null || ${keyText} == null ? null : ${target}.get(${keyText}))`;
    }

    // `this.<field>` for a BaseExchange.java field in JAVA_PLAIN_MAP_FIELDS
    javaPlainMapFieldReceiver(expression): boolean {
        return expression !== undefined && isPropertyAccessExpression(expression)
            && expression.expression.kind === SyntaxKind.ThisKeyword
            && JAVA_PLAIN_MAP_FIELDS.has(expression.name.text);
    }

    // the node sits in a class member whose name marks it as running on the owner executor
    javaInOwnerMember(node): boolean {
        for (let current = node?.parent; current; current = current.parent) {
            if (isMethodDeclaration(current) && current.parent !== undefined && isClassDeclaration(current.parent)) {
                const name = (current.name as any)?.text;
                return typeof name === 'string' && JAVA_OWNER_MEMBER_NAME.test(name);
            }
        }
        return false;
    }

    // every `public Map<String, Object> f` field of the hand-written BaseExchange.java header, named by
    // the build layer; empty = every nested describe () read keeps the helper.
    javaHeaderMapFields: ReadonlySet<string> = new Set<string>();

    // describe () literal of the class: root field -> nested object literals (a non-object value is a leaf)
    javaDescribeTreeCache: WeakMap<object, any> = new WeakMap<object, any>();

    javaLiteralTree(literal): any {
        const tree: any = {};
        for (const property of literal.properties) {
            if (!isPropertyAssignment(property) || (!isIdentifier(property.name) && !isStringLiteralLikeNode(property.name))) {
                return undefined; // a spread or computed name: the literal's keys are not all known
            }
            const value = property.initializer;
            const nested = isObjectLiteralExpression(value) ? this.javaLiteralTree(value) : undefined;
            tree[property.name.text] = nested === undefined ? 'leaf' : nested;
        }
        return tree;
    }

    javaDescribeTree(node): any {
        let cls: any = node.parent;
        while (cls !== undefined && !isClassDeclaration(cls)) {
            cls = cls.parent;
        }
        if (cls === undefined) {
            return undefined;
        }
        if (this.javaDescribeTreeCache.has(cls)) {
            return this.javaDescribeTreeCache.get(cls);
        }
        let tree: any;
        const method = (name) => (cls.members ?? []).find((m) => isMethodDeclaration(m) && (m.name as any)?.text === name);
        const returnedLiterals = (body, depth) => {
            const found: any[] = [];
            for (const statement of body?.statements ?? []) {
                if (!isReturnStatement(statement) || statement.expression === undefined) {
                    continue;
                }
                const returned = this.unwrapPrintTransparentExpression(statement.expression);
                const candidates = isCallExpression(returned) ? [ returned, ...returned.arguments ] : [ returned ];
                for (const candidate of candidates.map((c) => this.unwrapPrintTransparentExpression(c))) {
                    if (isObjectLiteralExpression(candidate)) {
                        found.push(candidate);
                    } else if (depth < 2 && isCallExpression(candidate) && isPropertyAccessExpression(candidate.expression)
                        && candidate.expression.expression.kind === SyntaxKind.ThisKeyword) {
                        found.push(...returnedLiterals(method(candidate.expression.name.text)?.body, depth + 1));
                    }
                }
            }
            return found;
        };
        for (const literal of returnedLiterals(method('describe')?.body, 0)) {
            const candidate = this.javaLiteralTree(literal);
            if (candidate !== undefined && typeof candidate['urls'] === 'object') {
                tree = candidate;
                break;
            }
        }
        this.javaDescribeTreeCache.set(cls, tree);
        return tree;
    }

    // `this.<header Map field>[a]..[z][k]` where the class's own describe () literal holds every step
    // as an object: the receiver is the plain Map the constructor built, so the helper's Map branch is
    // the native get (a null identifier key answers null like the helper)
    javaDescribedDictChainRead(node): string | undefined {
        if (this.javaHeaderMapFields.size === 0 || node.parent?.kind === SyntaxKind.ExpressionStatement
            || this.printElementAccessExpressionExceptionIfAny(node) !== undefined || this.isLeftSideOfAssignment(node)) {
            return undefined;
        }
        const key = node.argumentExpression;
        const literalKey = isStringLiteralLikeNode(key);
        if (!literalKey && !isIdentifier(key)) {
            return undefined;
        }
        const steps: string[] = [];
        let current = node.expression;
        while (current !== undefined) {
            current = this.unwrapPrintTransparentExpression(current);
            if (!isElementAccessExpression(current) || !isStringLiteralLikeNode(current.argumentExpression)) {
                break;
            }
            steps.unshift(current.argumentExpression.text);
            current = current.expression;
        }
        if (steps.length === 0 || current === undefined || !isPropertyAccessExpression(current)
            || current.expression.kind !== SyntaxKind.ThisKeyword || !this.javaHeaderMapFields.has(current.name.text)
            || this.javaOwnerStoreFields.has(current.name.text)) {
            return undefined;
        }
        let value: any = this.javaDescribeTree(node)?.[current.name.text];
        for (const step of steps) {
            value = typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, step) ? value[step] : undefined;
        }
        if (typeof value !== 'object') {
            return undefined;
        }
        const target = this.printNode(node.expression, 0);
        const keyText = this.printNode(key, 0).trim();
        if (literalKey) {
            return `((java.util.Map<String, Object>)${target}).get(${keyText})`;
        }
        const declared = this.javaDeclaredTypeOf(key);
        if (!/^[A-Za-z_]\w*$/.test(keyText) || (declared !== undefined && JAVA_PRIMITIVE_DECLARED_TYPES.has(declared.trim()))
            || (declared === undefined && this.javaOperandPrintsPrimitiveNumber(key))) {
            return undefined;
        }
        return `(${keyText} == null ? null : ((java.util.Map<String, Object>)${target}).get(${keyText}))`;
    }

    // `this.<field>` for a BaseExchange.java field declared over a single-owner store
    javaOwnerStoreFieldReceiver(expression): boolean {
        if (expression === undefined || !isPropertyAccessExpression(expression)) {
            return false;
        }
        return expression.expression.kind === SyntaxKind.ThisKeyword
            && this.javaOwnerStoreFields.has(expression.name.text);
    }

    // `x[k]` where x is `this.ohlcvs[s]`: see javaOhlcvsSymbolMapRead
    javaOhlcvsElementRead(node): string | undefined {
        if (node.parent?.kind === SyntaxKind.ExpressionStatement || node.parent?.kind === SyntaxKind.DeleteExpression
            || this.printElementAccessExpressionExceptionIfAny(node) !== undefined || this.isLeftSideOfAssignment(node)) {
            return undefined;
        }
        const receiver = this.unwrapPrintTransparentExpression(node.expression);
        return receiver !== undefined && isElementAccessExpression(receiver) ? this.javaOhlcvsSymbolMapRead(node, receiver) : undefined;
    }

    // `(x as string[])[i]` over a for-counter, x a side-effect-free reference the checker types
    // `string[]` (| undefined): the printed receiver is the cast `(java.util.List<String>)(x)` either way,
    // so the helper's null / range answers become the explicit guard on that same cast
    javaStringArrayAssertedCounterRead(node): string | undefined {
        if (node.parent?.kind === SyntaxKind.ExpressionStatement || this.isLeftSideOfAssignment(node)
            || this.printElementAccessExpressionExceptionIfAny(node) !== undefined) {
            return undefined;
        }
        const asserted = this.unwrapParenthesized(node.expression);
        if (asserted === undefined || !isAsExpression(asserted) || !isArrayTypeNode(asserted.type)
            || asserted.type.elementType.kind !== SyntaxKind.StringKeyword) {
            return undefined;
        }
        const operand = this.unwrapParenthesized(asserted.expression);
        if (operand === undefined || !isIdentifier(operand) || this.isVarargsArrayReference(operand)
            || this.javaStringElementsReceiver(operand) || this.printNode(operand, 0).trim() !== operand.text) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        let operandType;
        try {
            operandType = checker?.getTypeAtLocation(operand);
        } catch (e) {
            return undefined;
        }
        if (operandType === undefined || !this.javaIsStringArrayType(checker, operandType)) {
            return undefined;
        }
        const list = `((java.util.List<String>)(${operand.text}))`;
        const index = this.printNode(node.argumentExpression, 0);
        return `(${list} == null || ${index} < 0 || ${index} >= ${list}.size() ? null : ${list}.get(${index}))`;
    }

    unwrapParenthesized(node): any {
        let current = node;
        while (current !== undefined && isParenthesizedExpression(current)) {
            current = current.expression;
        }
        return current;
    }

    // `this.ohlcvs[s][k]` (base field `Dictionary<Dictionary<ArrayCacheByTimestamp>>`): once the member
    // has put a fresh map under s the per-symbol value is a non-null Map, so the helper's read is the
    // plain get. Both names must be plain strings and nothing may disturb the entry in between.
    javaOhlcvsSymbolMapRead(node, inner): string | undefined {
        if (!this.javaIsOhlcvsField(inner.expression)) {
            return undefined;
        }
        const symbolNode = inner.argumentExpression;
        const key = this.unwrapPrintTransparentExpression(node.argumentExpression);
        const isString = (n) => this.javaScalarFamily(n) === 'string' || this.javaDeclaredStringType(n);
        if (!isIdentifier(symbolNode) || key === undefined || !isIdentifier(key) || !isString(symbolNode) || !isString(key)) {
            return undefined;
        }
        const symbolText = this.printNode(symbolNode, 0).trim();
        if (symbolText !== symbolNode.text || this.printNode(key, 0).trim() !== key.text) {
            return undefined; // a capture rename prints a box
        }
        const keyText = key.text;
        if (!this.isJavaMapStructureType(this.getChecker().getTypeAtLocation(inner))) {
            return undefined;
        }
        if (!this.javaOhlcvsEntryIsFresh(node, symbolNode)) {
            return undefined;
        }
        return `((java.util.Map<?, ?>)this.ohlcvs.get(${symbolText})).get(${keyText})`;
    }

    javaIsOhlcvsField(node): boolean {
        const field = this.unwrapPrintTransparentExpression(node);
        return field !== undefined && isPropertyAccessExpression(field)
            && field.expression.kind === SyntaxKind.ThisKeyword && field.name.text === 'ohlcvs';
    }

    // an earlier statement of an enclosing block of the read puts a fresh map under s
    // (`this.ohlcvs[s] = {}`, `= this.safeDict(this.ohlcvs, s, {})`, or the same under
    // `if (!(s in this.ohlcvs))`), and the statements from there to the read neither write the
    // entry, s or the field, nor suspend
    javaOhlcvsEntryIsFresh(site, symbolNode): boolean {
        const checker: any = this.getChecker();
        const symbol = checker.getSymbolAtLocation(symbolNode);
        if (symbol === undefined) {
            return false;
        }
        let child = site;
        while (child?.parent !== undefined) {
            const parent = child.parent;
            if (isFunctionLike(parent)) {
                return false;
            }
            if (isBlock(parent) || isSourceFile(parent)) {
                const statements: any[] = Array.from(parent.statements);
                const at = statements.indexOf(child);
                for (let j = at - 1; j >= 0; j--) {
                    if (this.javaOhlcvsFreshAnchor(statements[j], symbol)) {
                        for (let m = j + 1; m <= at; m++) {
                            if (this.javaOhlcvsDisturbed(statements[m], symbol)) {
                                return false;
                            }
                        }
                        return true;
                    }
                }
            }
            child = parent;
        }
        return false;
    }

    javaOhlcvsFreshAnchor(statement, symbol): boolean {
        const checker: any = this.getChecker();
        const isSymbol = (n) => isIdentifier(n) && checker.getSymbolAtLocation(n) === symbol;
        const emptyLiteral = (n) => n !== undefined && isObjectLiteralExpression(n) && n.properties.length === 0;
        const freshPut = (candidate): boolean => {
            if (candidate === undefined || !isExpressionStatement(candidate)) {
                return false;
            }
            const put = candidate.expression;
            if (!isBinaryExpression(put) || put.operatorToken.kind !== SyntaxKind.EqualsToken
                || !isElementAccessExpression(put.left) || !this.javaIsOhlcvsField(put.left.expression)
                || !isSymbol(put.left.argumentExpression)) {
                return false;
            }
            if (emptyLiteral(put.right)) {
                return true;
            }
            const call = put.right;
            return isCallExpression(call) && isPropertyAccessExpression(call.expression)
                && call.expression.expression.kind === SyntaxKind.ThisKeyword && call.expression.name.text === 'safeDict'
                && call.arguments.length === 3 && this.javaIsOhlcvsField(call.arguments[0]) && isSymbol(call.arguments[1])
                && emptyLiteral(call.arguments[2]) && this.javaCalleeResolves(call)
                && JAVA_THIS_RETURN_TYPES_BASE_FILE.test(checker.getResolvedSignature(call)?.declaration?.resolve()?.getSourceFile?.()?.fileName ?? '');
        };
        if (freshPut(statement)) {
            return true;
        }
        if (!isIfStatement(statement) || statement.elseStatement !== undefined) {
            return false;
        }
        const condition = this.unwrapParenthesized(statement.expression);
        if (condition === undefined || !isPrefixUnaryExpression(condition) || condition.operator !== SyntaxKind.ExclamationToken) {
            return false;
        }
        const test = this.unwrapParenthesized(condition.operand);
        if (test === undefined || !isBinaryExpression(test) || test.operatorToken.kind !== SyntaxKind.InKeyword
            || !isSymbol(test.left) || !this.javaIsOhlcvsField(test.right)) {
            return false;
        }
        const then = statement.thenStatement;
        return isBlock(then) ? then.statements.length === 1 && freshPut(then.statements[0]) : freshPut(then);
    }

    javaOhlcvsDisturbed(statement, symbol): boolean {
        const checker: any = this.getChecker();
        let disturbed = false;
        const writesSymbol = (n) => {
            const target = this.unwrapPrintTransparentExpression(n);
            return target !== undefined && isIdentifier(target) && checker.getSymbolAtLocation(target) === symbol;
        };
        const walk = (n) => {
            if (disturbed || n === undefined) {
                return;
            }
            if (n.kind === SyntaxKind.AwaitExpression) {
                disturbed = true;
                return;
            }
            if (isBinaryExpression(n) && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(n.operatorToken.kind)) {
                const left = this.unwrapPrintTransparentExpression(n.left);
                if (writesSymbol(left) || this.javaIsOhlcvsField(left)
                    || (isElementAccessExpression(left) && this.javaIsOhlcvsField(left.expression))) {
                    disturbed = true;
                    return;
                }
            }
            if (n.kind === SyntaxKind.DeleteExpression) {
                const target = this.unwrapPrintTransparentExpression(n.expression);
                if (target !== undefined && isElementAccessExpression(target) && this.javaIsOhlcvsField(target.expression)) {
                    disturbed = true;
                    return;
                }
            }
            if ((isPrefixUnaryExpression(n) || isPostfixUnaryExpression(n)) && writesSymbol(n.operand)) {
                disturbed = true;
                return;
            }
            n.forEachChild(walk);
        };
        walk(statement);
        return disturbed;
    }

    // `<client>.<futures|subscriptions|rejections>` where the property is declared by the ws Client
    // class (ts/src/base/ws/Client.ts, the twin of the hand-written WsClient.java)
    javaWsClientMapField(expression): string | undefined {
        if (expression === undefined || !isPropertyAccessExpression(expression)
            || !this.javaSideEffectFreeReference(expression.expression)) {
            return undefined; // the guard prints the receiver twice
        }
        return this.javaWsClientDeclaredMapField(expression);
    }

    // the field declaration alone: the property is declared by the ws Client class (no receiver proof)
    javaWsClientDeclaredMapField(expression): string | undefined {
        if (expression === undefined || !isPropertyAccessExpression(expression)
            || !Object.prototype.hasOwnProperty.call(JAVA_WS_CLIENT_MAP_FIELDS, expression.name.text)) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(expression.name);
        const declaration = symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve();
        const fileName = declaration?.getSourceFile?.()?.fileName;
        return typeof fileName === 'string' && JAVA_WS_CLIENT_FILE.test(fileName)
            ? JAVA_WS_CLIENT_MAP_FIELDS[expression.name.text] : undefined;
    }

    // `client.<futures|subscriptions|rejections>` where `client` is the ws Client the generated handlers
    // receive: a parameter in first position or a local with an initializer, both of which the ws tier
    // prints as the java `Client` (WsClient.java) with the fields declared `public final Map<String, V>`.
    // Any other receiver (`okClient`, a later parameter) prints an `Object` box, so no operation binds
    // on the Map type there. The field is initialised and final, so it is never null.
    // Returns the Java value type the field declares.
    javaWsClientTypedMapField(expression): string | undefined {
        if (expression === undefined || !isPropertyAccessExpression(expression)) {
            return undefined;
        }
        const receiver = expression.expression;
        if (!isIdentifier(receiver) || receiver.text !== 'client' || this.printNode(receiver, 0) !== 'client') {
            return undefined;
        }
        const declaration: any = this.javaDeclarationOfIdentifier(receiver);
        if (declaration === undefined || declaration.name?.text !== 'client') {
            return undefined;
        }
        if (isParameterDeclaration(declaration)) {
            if ((declaration.parent as any)?.parameters?.[0] !== declaration) {
                return undefined;
            }
        } else if (declaration.initializer === undefined) {
            return undefined;
        }
        return this.javaWsClientDeclaredMapField(expression) ?? this.javaWsClientUntypedMapField(expression);
    }

    // the same receiver when TS leaves it `any` (`client: any` of the base tier, `const client = this.safeValue (this.clients, url)`):
    // the build layer prints every such `client` as the java `Client`, so the field table alone names the Map type
    javaWsClientUntypedMapField(expression): string | undefined {
        if (!Object.prototype.hasOwnProperty.call(JAVA_WS_CLIENT_MAP_FIELDS, expression.name.text)) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        const type = checker?.getTypeAtLocation(expression.expression);
        return type !== undefined && (type.flags & TypeFlags.Any) !== 0
            ? JAVA_WS_CLIENT_MAP_FIELDS[expression.name.text] : undefined;
    }

    // the Java type the ws Client declares for a field (`Map<String, Object>` / `Map<String, Future>`)
    javaWsClientFieldMapType(field: string): string {
        return `java.util.Map<String, ${JAVA_WS_CLIENT_MAP_FIELDS[field]}>`;
    }

    // `const subs = client.subscriptions`: the local holds the field's own Map, so every operation on it
    // binds on that type with no receiver cast. Only a local nothing writes and nothing consumes as
    // another Java type may carry it.
    javaWsClientAliasLocalType(declaration): string | undefined {
        if (!isVariableDeclaration(declaration) || !isIdentifier(declaration.name) || !declaration.initializer) {
            return undefined;
        }
        const initializer = this.unwrapPrintTransparentExpression(declaration.initializer);
        if (this.javaWsClientTypedMapField(initializer) === undefined) {
            return undefined;
        }
        if (this.javaLocalHasWriteAtAll(declaration.name) || !this.javaLocalUsesKeepContainerType(declaration.name)) {
            return undefined;
        }
        return this.javaWsClientFieldMapType(initializer.name.text);
    }

    // the ws Client field (`subscriptions`, ...) a receiver stands for: the field itself or a local bound to
    // it. Such a receiver is never null and binds every Map operation with no receiver cast.
    javaWsClientMapReceiverField(expression): string | undefined {
        const field = this.javaWsClientTypedMapField(expression);
        if (field !== undefined) {
            return expression.name.text;
        }
        if (expression !== undefined && isIdentifier(expression)) {
            const declaration = this.javaDeclarationOfIdentifier(expression);
            if (declaration !== undefined && expression.text === declaration.name?.text
                && this.javaWsClientAliasLocalType(declaration) !== undefined) {
                return this.unwrapPrintTransparentExpression(declaration.initializer).name.text;
            }
        }
        return undefined;
    }

    // `client` itself is `any` in TS (the property is not checker-declared by the ws Client class)
    javaWsClientReceiverIsAny(expression): boolean {
        if (expression === undefined || !isPropertyAccessExpression(expression)) {
            return false;
        }
        const type = this.checkerOrUndefined()?.getTypeAtLocation(expression.expression);
        return type !== undefined && (type.flags & TypeFlags.Any) !== 0;
    }

    javaWsClientMapReceiver(expression): boolean {
        return this.javaWsClientMapReceiverField(expression) !== undefined;
    }

    // `Object`-valued ws Client map (subscriptions / rejections): `put(String, Object)` binds any value, and
    // WsClient's OwnerMap.put(key, null) removes the key, which is exactly Helpers.addElementToObject's
    // null-hostile-map branch, so the native put is the helper's write for every value
    javaWsClientObjectMapReceiver(expression): boolean {
        const field = this.javaWsClientMapReceiverField(expression);
        return field !== undefined && JAVA_WS_CLIENT_MAP_FIELDS[field] === 'Object';
    }

    // `client.<map>[k]` with a non-literal key: Helpers.GetValue answers null for a null receiver or
    // key and the map get is the helper's Map branch, so the guarded native get is exact. The key
    // prints twice, so it must be a repeatable non-primitive identifier; a literal key already prints
    // through the checker-typed read below.
    javaWsClientMapReadText(receiver, key): string | undefined {
        if (this.javaWsClientMapField(receiver) === undefined || !isIdentifier(key)
            || !this.javaRepeatableOperand(key) || this.javaOperandPrintsPrimitiveNumber(key)) {
            return undefined;
        }
        const declared = this.javaDeclaredTypeOf(key);
        if (declared !== undefined && JAVA_PRIMITIVE_DECLARED_TYPES.has(declared.trim())) {
            return undefined;
        }
        const target = this.printNode(receiver, 0);
        const keyText = this.printNode(key, 0);
        return `(${target} == null || ${keyText} == null ? null : ${target}.get(${keyText}))`;
    }

    javaWsClientMapRead(node): string | undefined {
        if (node.parent?.kind === SyntaxKind.ExpressionStatement
            || this.printElementAccessExpressionExceptionIfAny(node) !== undefined || this.isLeftSideOfAssignment(node)) {
            return undefined;
        }
        return this.javaWsClientMapReadText(node.expression, node.argumentExpression);
    }

    // `const f = client.futures[k]`: the local holds the field's declared value type, so its uses
    // (`f.resolve(..)`) bind with no checkcast
    javaWsClientLocalType(declaration): string | undefined {
        if (!isVariableDeclaration(declaration) || !isIdentifier(declaration.name) || !declaration.initializer) {
            return undefined;
        }
        const initializer = this.unwrapPrintTransparentExpression(declaration.initializer);
        if (initializer === undefined || !isElementAccessExpression(initializer)) {
            return undefined;
        }
        // a literal key prints through the checker-typed read of a typed ws client receiver
        const literalRead = isStringLiteralLikeNode(initializer.argumentExpression)
            && this.javaWsClientMapReceiver(initializer.expression)
            && this.printElementAccessExpressionExceptionIfAny(initializer) === undefined;
        if (!literalRead && this.javaWsClientMapRead(initializer) === undefined) {
            return undefined;
        }
        const type = this.javaWsClientMapField(initializer.expression)
            ?? (literalRead ? JAVA_WS_CLIENT_MAP_FIELDS[(initializer.expression as any).name?.text] : undefined);
        if (type === undefined || type === 'Object' || this.javaLocalHasWriteAtAll(declaration.name)) {
            return undefined;
        }
        return type;
    }

    // `this.safeDict(this.options, "<handoff key>"[, null | {}])`: the key is not a store entry,
    // the base hands it over through an owner field accessor (javaOwnerStoreHandoffs)
    printOptionsHandoffRead(node): string | undefined {
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword
            || callee.name.text !== 'safeDict' || node.arguments.length < 2 || node.arguments.length > 3) {
            return undefined;
        }
        const [ source, key, fallback ] = node.arguments;
        if (!isPropertyAccessExpression(source) || source.expression.kind !== SyntaxKind.ThisKeyword
            || !this.javaOwnerStoreFields.has(source.name.text) || !isStringLiteralLikeNode(key)) {
            return undefined;
        }
        const accessors = Object.prototype.hasOwnProperty.call(this.javaOwnerStoreHandoffs, key.text)
            ? this.javaOwnerStoreHandoffs[key.text] : undefined;
        if (accessors === undefined) {
            return undefined;
        }
        const fileName = this.checkerOrUndefined()?.getResolvedSignature(node)?.declaration?.resolve()?.getSourceFile?.()?.fileName;
        if (typeof fileName !== 'string' || !JAVA_THIS_RETURN_TYPES_BASE_FILE.test(fileName)) {
            return undefined; // a venue override may read the key itself
        }
        if (fallback === undefined || this.isNullishLiteral(fallback)) {
            return `this.${accessors[0]}()`;
        }
        const literal = this.unwrapPrintTransparentExpression(fallback);
        if (isObjectLiteralExpression(literal) && literal.properties.length === 0) {
            return `this.${accessors[1]}()`;
        }
        return undefined;
    }

    // `x[i]` where x is a declared java List and i is the int counter of `for (var i = <int literal>`:
    // GetValue answers null for a null receiver or index outside [0, size) while List.get throws, so
    // the emission carries the same tests. `||` short-circuits over identifiers, so nothing runs twice.
    javaDeclaredListElementRead(node, isCounter) {
        if (node.parent?.kind === SyntaxKind.ExpressionStatement) {
            return undefined; // a bare conditional expression is not a Java statement
        }
        // the ws-tier post-pass types `Object client = Helpers.GetValue(..)` by that exact
        // printed text (build/javaTranspiler.ts postProcessWsJava: `Client client =
        // (Client)Helpers.GetValue(..)`). A native read drops the shape and the checkcast
        if (node.parent?.kind === SyntaxKind.VariableDeclaration
            && (node.parent as any).initializer === node
            && ((node.parent as any).name?.text === 'client')) {
            return undefined;
        }
        const declared = this.javaDeclaredTypeOf(node.expression);
        const declaredList = declared !== undefined && JAVA_DECLARED_LIST_TYPES.test(declared);
        let target;
        let list;
        if (declaredList) {
            target = this.printNode(node.expression, 0);
            list = target;
        } else {
            const type = this.getChecker().getTypeAtLocation(node.expression);
            if (!this.isJavaListValueType(type) || this.isVarargsArrayReference(node.expression)
                || !this.javaSideEffectFreeReference(node.expression)) {
                return undefined;
            }
            target = this.printNode(node.expression, 0);
            list = `((java.util.List<?>)${target})`;
        }
        if (!isCounter && Number(node.argumentExpression.text) > 2147483647) {
            return undefined; // printNumericLiteral would add an `L` suffix List.get cannot take
        }
        if (this.javaStringElementsReceiver(node.expression)) {
            return undefined; // its String consumers are typed from the `Helpers.GetValue(` prefix
        }
        const indexText = this.printNode(node.argumentExpression, 0);
        const lowerBound = isCounter ? `${indexText} < 0 || ` : '';
        return `(${target} == null || ${lowerBound}${indexText} >= ${list}.size() ? null : ${list}.get(${indexText}))`;
    }

    // `x[k]` where a consumer declares x a java Map and the key is not a literal: the
    // helper's Map branch is the map accessor behind its own tests — a null receiver, a
    // null key and a key that is not a String all answer null, and a String-keyed map's
    javaDeclaredMapElementRead(node) {
        if (node.parent?.kind === SyntaxKind.ExpressionStatement) {
            return undefined; // a bare conditional expression is not a Java statement
        }
        if (this.printElementAccessExpressionExceptionIfAny(node) !== undefined
            || this.isLeftSideOfAssignment(node)) {
            return undefined;
        }
        if (!this.javaDeclaredMapReceiver(node.expression)) {
            return undefined;
        }
        const key = node.argumentExpression;
        // `k as string` only narrows the static type: the Java key is the name cast `((String)k)`,
        // and the null test reads the bare name
        const operand = isAsExpression(key) && key.type?.kind === SyntaxKind.StringKeyword ? key.expression : key;
        if (!isIdentifier(operand) || !this.javaRepeatableOperand(operand)) {
            return undefined; // the guard prints the key twice
        }
        const declared = this.javaDeclaredTypeOf(operand);
        if (declared !== undefined && JAVA_PRIMITIVE_DECLARED_TYPES.has(declared.trim())) {
            return undefined; // a java primitive cannot take the `instanceof` test
        }
        if (declared === undefined && this.javaOperandPrintsPrimitiveNumber(operand)) {
            return undefined;
        }
        let keyType;
        try {
            keyType = this.getChecker().getTypeAtLocation(key);
        } catch (e) {
            return undefined;
        }
        if (keyType === undefined
            || this.getChecker().isArrayType(keyType) || this.getChecker().isTupleType(keyType)) {
            return undefined;
        }
        const target = this.printNode(node.expression, 0);
        const keyText = this.printNode(key, 0);
        if (keyType.getAliasSymbol?.() === undefined && keyType.flags === TypeFlags.String) {
            // a plain `string` key prints a java String; the null test keeps a receiver that
            // aliases a ConcurrentHashMap from throwing on a null the alias admits
            return `(${target} == null || ${this.printNode(operand, 0)} == null ? null : ${target}.get(${keyText}))`;
        }
        return `(${target} == null || !(${keyText} instanceof String) ? null : ${target}.get(${keyText}))`;
    }

    // `x[<integer expression>]` on a declared List. Helpers.GetValue truncates the key to an int
    // and answers null outside [0, size), so the read carries both tests on the narrowed index.
    // The guarded form prints the index three times, so only an operand of literals and
    // declared-numeric names may take it.
    javaDeclaredListIndexRead(node): string | undefined {
        if (node.parent?.kind === SyntaxKind.ExpressionStatement) {
            return undefined; // a bare conditional expression is not a Java statement
        }
        if (this.printElementAccessExpressionExceptionIfAny(node) !== undefined
            || this.isLeftSideOfAssignment(node)) {
            return undefined;
        }
        const declared = this.javaDeclaredTypeOf(node.expression);
        if (declared === undefined || !JAVA_DECLARED_LIST_TYPES.test(declared)) {
            return undefined;
        }
        const key = node.argumentExpression;
        if (!this.javaRepeatableIntegerExpression(key, 0)) {
            return undefined;
        }
        const index = this.printNode(key, 0);
        if (index.includes('Helpers.') || index.includes('()') || index.includes(' ? ')) {
            return undefined; // a boxed, call-borne or null-armed index is not the helper's own int index
        }
        // j03 (build/javaTranspiler.ts nativeJavaJ03ElementReads) already converts a numeric
        // literal, a counter, an int/long/Long/Integer name and the `((long) X) - 1L` form;
        // those sites stay byte-identical and are not ours to re-spell
        if (/^[A-Za-z_$][\w$]*$/.test(index)) {
            return undefined;
        }
        if (/^\(\(\(long\) [A-Za-z_$][\w$]*\) - 1L\)$/.test(index)) {
            return undefined;
        }
        if (!this.javaNonNullableNumberType(key)) {
            return undefined; // the narrowed form below cannot carry a nullable operand
        }
        const target = this.printNode(node.expression, 0);
        const narrowed = index.startsWith('(') ? `((int) ${index})` : `((int) (${index}))`;
        return `(${target} == null || ${narrowed} < 0 || ${narrowed} >= ${target}.size() ? null : ${target}.get(${narrowed}))`;
    }

    // a plain non-nullable TS number: the narrowed index is a primitive on every path
    javaNonNullableNumberType(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined || node === undefined) {
            return false;
        }
        let type;
        try {
            type = checker.getTypeAtLocation(node);
        } catch (e) {
            return false;
        }
        if (type === undefined || type.getAliasSymbol?.() !== undefined) {
            return false;
        }
        return (type.flags & TypeFlags.Number) !== 0 || (type.flags & TypeFlags.NumberLiteral) !== 0;
    }

    // a side-effect-free expression of integer leaves: a numeric literal, a `var` loop counter, or
    // a name whose declaration prints a Java numeric type, combined with + - * / %
    javaRepeatableIntegerExpression(node, depth: number): boolean {
        if (node === undefined || depth > 4) {
            return false;
        }
        switch (node.kind) {
        case SyntaxKind.NumericLiteral:
            return true;
        case SyntaxKind.Identifier: {
            if (this.javaPrimitiveCounterIndex(node)) {
                return true;
            }
            const declared = this.javaDeclaredTypeOf(node);
            return declared !== undefined && JAVA_DECLARED_NUMERIC_TYPES.has(declared.trim());
        }
        case SyntaxKind.ParenthesizedExpression:
            return this.javaRepeatableIntegerExpression(node.expression, depth + 1);
        case SyntaxKind.PrefixUnaryExpression:
            return this.javaRepeatableIntegerExpression(node.operand, depth + 1);
        case SyntaxKind.BinaryExpression: {
            const operator = node.operatorToken.kind;
            if (operator !== SyntaxKind.PlusToken && operator !== SyntaxKind.MinusToken
                && operator !== SyntaxKind.AsteriskToken && operator !== SyntaxKind.SlashToken
                && operator !== SyntaxKind.PercentToken) {
                return false;
            }
            return this.javaRepeatableIntegerExpression(node.left, depth + 1)
                && this.javaRepeatableIntegerExpression(node.right, depth + 1);
        }
        default:
            return false;
        }
    }

    // the identifier of a `for (var i = <int literal>; …; i++)` counter that still prints as
    // `i`: the JN capture rename prints `finalI`, a `final Object` box, which is not an int
    javaPrimitiveCounterIndex(node) {
        if (!this.isJavaPrimitiveCounterReference(node)) {
            return false;
        }
        const declaration = this.javaDeclarationOfIdentifier(node);
        return declaration !== undefined && node.text === declaration.name?.text;
    }

    // `this.<field>[k]` on a hand-written base map field (JAVA_FIELD_TYPES): the helper's Map branch is
    // the native `get`. The helper answers null for a null receiver or key, so both stay guarded; the
    // receiver and key are side-effect free. An unguarded read has no parens so a checkcast binds it.
    javaFieldMapReadText(receiver, key): string | undefined {
        if (receiver === undefined || receiver.kind !== SyntaxKind.PropertyAccessExpression
            || receiver.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const name = receiver.name?.text;
        const field = (typeof name === 'string') ? JAVA_FIELD_TYPES[name] : undefined;
        if (field === undefined || field.map !== true) {
            return this.javaJ02FieldMapReadText(receiver, key) ?? this.javaPlainCacheReadText(receiver, key);
        }
        const keyText = this.printNode(key, 0);
        let keyGuarded = false;
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const keyType = checker.getTypeAtLocation(key);
        if (!this.isJavaStringType(keyType) && !this.javaDeclaredStringType(key)) {
            // the guard prints the key twice, so only a repeatable operand can take it
            if (!this.javaRepeatableOperand(key)) {
                return undefined;
            }
            keyGuarded = true;
        }
        const target = this.printNode(receiver, 0);
        const read = `((java.util.Map<?, ?>)${target}).get(${keyText})`;
        if (!keyGuarded && field.nullable !== true) {
            return read;
        }
        const receiverGuard = (field.nullable === true) ? `${target} == null ? null : ` : '';
        return `(${keyGuarded ? `${keyText} == null ? null : ` : ''}${receiverGuard}${read})`;
    }

    // the read stands only where no exchange-specific override claims the site and the node
    // is not a write target
    javaFieldMapReadIfAllowed(node): string | undefined {
        const read = this.javaFieldMapReadText(node.expression, node.argumentExpression);
        if (read === undefined) {
            return undefined;
        }
        if (this.printElementAccessExpressionExceptionIfAny(node) !== undefined || this.isLeftSideOfAssignment(node)) {
            return undefined;
        }
        return read;
    }

    // `x[k]` reads: emit the native container accessor when the checker proves the Java
    // representation of `x`, otherwise return undefined so the base prints Helpers.GetValue.
    printCheckerTypedElementAccessRead(node) {
        const wsClientRead = this.javaWsClientMapRead(node);
        if (wsClientRead !== undefined) {
            return wsClientRead;
        }
        const key = node.argumentExpression;
        const isStringKey = isStringLiteralLikeNode(key);
        const isNumberKey = isNumericLiteral(key);
        const isCounterKey = !isStringKey && !isNumberKey && this.javaPrimitiveCounterIndex(key);
        if (!isStringKey && !isNumberKey && !isCounterKey) {
            // a `this.<field>` map read carries its own Java proof (JAVA_FIELD_TYPES): the
            // field declaration the printer cannot see is what makes `k` bind natively
            const field = this.javaFieldMapReadIfAllowed(node);
            if (field !== undefined) {
                return field;
            }
            // `this.ohlcvs[symbol][timeframe]` after a fresh put under symbol (base field type)
            const ohlcvsRead = this.javaOhlcvsElementRead(node);
            if (ohlcvsRead !== undefined) {
                return ohlcvsRead;
            }
            // a declared List with an integer expression index reads natively with the
            // helper's own bounds test
            const listIndexRead = this.javaDeclaredListIndexRead(node);
            if (listIndexRead !== undefined) {
                return listIndexRead;
            }
            // a declared map (a local the build layer typed, or a param the printer retypes)
            // is the other proof a non-literal key binds natively
            return this.javaDeclaredMapElementRead(node) ?? this.javaDescribedDictChainRead(node);
        }
        if (this.printElementAccessExpressionExceptionIfAny(node) !== undefined) {
            return undefined; // an exchange-specific override wins, the base prints it
        }
        if (this.isLeftSideOfAssignment(node)) {
            return undefined;
        }
        const type = this.getChecker().getTypeAtLocation(node.expression);
        if (isStringKey) {
            const classRead = this.javaClassTypedElementRead(node);
            if (classRead !== undefined) {
                return classRead;
            }
            // a receiver the printer itself declared a Map already carries the accessor, so the
            // read binds on the declaration and needs no checkcast in front of it
            if (this.javaDeclaredMapReceiver(node.expression) || this.javaWsClientMapReceiver(node.expression)) {
                return `${this.printNode(node.expression, 0)}.get(${this.printNode(key, 0)})`;
            }
            if (!this.isJavaMapStructureType(type)) {
                if (!this.javaDeclaredMapReceiver(node.expression)) {
                    // a literal key on a table field the checker does not type (balance is
                    // `any`) still has the field table's Java proof
                    return this.javaFieldMapReadIfAllowed(node) ?? this.javaDescribedDictChainRead(node);
                }
                // the declared local is already a map: the accessor binds with no cast
                return `${this.printNode(node.expression, 0)}.get(${this.printNode(key, 0)})`;
            }
            const target = this.printNode(node.expression, 0);
            return `((java.util.Map<String, Object>)${target}).get(${this.printNode(key, 0)})`;
        }
        if (isCounterKey) {
            // a `var` int loop index on a declared List: the only proof that prints an int
            return this.javaDeclaredListElementRead(node, true) ?? this.javaStringArrayAssertedCounterRead(node);
        }
        const index = Number(key.text);
        if (!Number.isInteger(index) || index < 0) {
            return undefined;
        }
        const splitRead = this.javaNativeSplitIndexRead(node, index);
        if (splitRead !== undefined) {
            return splitRead;
        }
        if (this.isJavaListStructureType(type)) {
            if (index >= this.tupleRequiredElementCount(type)) {
                return undefined;
            }
            const target = this.printNode(node.expression, 0);
            return `((java.util.List<Object>)${target}).get(${this.printNode(key, 0)})`;
        }
        if (!this.isJavaArrayStructureType(type)) {
            // the checker leaves the receiver boxed: a declared List still reads natively
            return this.javaDeclaredListElementRead(node, false);
        }
        if (!this.javaSideEffectFreeReference(node.expression) || this.javaStringElementsReceiver(node.expression)) {
            return undefined;
        }
        // `Helpers.GetValue` returns null for a null receiver and off range; List.get
        // throws on both, so the native read carries both guards. `||` short-circuits and
        // the receiver is side-effect free, so it is evaluated as often as before.
        const target = this.printNode(node.expression, 0);
        const list = `((java.util.List<?>)${target})`;
        const keyText = this.printNode(key, 0);
        return `(${target} == null || ${keyText} >= ${list}.size() ? null : ${list}.get(${keyText}))`;
    }

    printElementAccessExpression(node, identation) {
        return this.printCheckerTypedElementAccessRead(node) ?? super.printElementAccessExpression(node, identation);
    }

    // `Helpers.GetValue(book, "asks")` on a receiver declared the ws order book class: the class's
    // own `get` is the helper's map branch (containsKey holds every one of these keys), and GetValue
    // answers null for a null receiver, so the native read carries the same guard
    javaClassTypedElementRead(node) {
        const key = node.argumentExpression;
        if (!isStringLiteralLikeNode(key) || !JAVA_WS_ORDERBOOK_READ_KEYS.has(key.text)) {
            return undefined;
        }
        const declared = this.javaDeclaredTypeOf(node.expression);
        if (declared === undefined || !THIS_WS_ORDERBOOK_TYPE.test(declared.trim())) {
            return undefined;
        }
        const target = this.printNode(node.expression, 0);
        return `(${target} == null ? null : ${target}.get(${this.printNode(key, 0)}))`;
    }


    // ---- helper-family inlining: `+ - * / += -=` ---------------------------
    // `x + y` normally prints Helpers.add, `- * /` print Helpers.subtract/multiply/
    // divide, and `+=`/`-=` print `x = Helpers.add/subtract(...)`. They print native
    // Java when BOTH operands are checker-typed in the same non-nullable scalar family
    // and the printed operands carry the matching Java kind, so the native expression
    // has the helper's boxed result kind and value on every path.

    // the TypeScript scalar family of a binary operand: plain `string`/`number` and
    // their literals only. The nullable aliases (Str/Int/Num/Bool), unions and `any`
    // can hold undefined at runtime, which the helpers absorb.
    javaScalarFamily(node): string | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const type = checker.getTypeAtLocation(node);
        if (type === undefined || type.getAliasSymbol?.() !== undefined) {
            return undefined;
        }
        const flags = type.flags;
        if (flags === TypeFlags.String || flags === TypeFlags.StringLiteral) {
            return 'string';
        }
        if (flags === TypeFlags.Number || flags === TypeFlags.NumberLiteral) {
            return 'number';
        }
        return undefined;
    }

    // true when the printed Java for this operand is statically a String: a string
    // literal, a nested `+` this rule prints as a native concat, or a form the
    // embedding build layer's javaExpressionTypeResolver names `String` (a local whose
    // emitted declaration is `String <name> = `, a call to a hand-written `public
    // String` runtime method). Java compiles `+` only when at least one operand is
    // statically a String, so a String local anchors the concat like a literal does.
    javaProvableString(node): boolean {
        if (node === undefined) {
            return false;
        }
        switch (node.kind) {
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
            return true;
        case SyntaxKind.ParenthesizedExpression:
            return this.javaProvableString(node.expression);
        case SyntaxKind.BinaryExpression:
            return this.javaNativeConcat(node);
        }
        return this.javaResolvedString(node);
    }

    // the embedding build layer's proof of the concrete printed Java type of an
    // expression (installed like csharpExpressionTypeResolver); only `String` is
    // consumed here, and a missing resolver proves nothing
    javaResolvedString(node): boolean {
        if (node === undefined || this.javaExpressionTypeResolver === undefined) {
            return false;
        }
        try {
            return this.javaExpressionTypeResolver(node) === 'String';
        } catch (e) {
            return false;
        }
    }

    // does this `+` node print as a native concat (both sides plain string, one side a
    // provable String)? Mirrors printInlineHelperArithmetic so callers can reason about
    // the printed text of a nested concat.
    javaNativeConcat(node): boolean {
        if (node?.operatorToken?.kind !== SyntaxKind.PlusToken) {
            return false;
        }
        if (this.javaScalarFamily(node.left) !== 'string' || this.javaScalarFamily(node.right) !== 'string') {
            return false;
        }
        return this.javaProvableString(node.left) || this.javaProvableString(node.right);
    }

    // B-13: the `+` / `+=` concat drops the helper when one side's printed Java is
    // provably a String and the other side is an operand Helpers.add's String branch
    // converts exactly like javac's `+` does
    javaStringConcatIsProvable(left, right, leftFamily, rightFamily) {
        const leftProvable = this.javaProvableString(left);
        const rightProvable = this.javaProvableString(right);
        if (leftFamily === 'string' && rightFamily === 'string' && (leftProvable || rightProvable)) {
            return true;
        }
        return (leftProvable && this.javaConcatOtherOperandIsSafe(right))
            || (rightProvable && this.javaConcatOtherOperandIsSafe(left));
    }

    // the non-anchor operand of a concat: a value StringBuilder.append and Helpers.add's
    // `String.valueOf` branch turn into the same text. Inlined when it is a printed String, when the
    // checker proves a plain non-nullable `string`, or when the type cannot be a boxed Double.
    javaConcatOtherOperandIsSafe(node) {
        if (node === undefined) {
            return false;
        }
        if (this.javaProvableString(node) || this.javaScalarFamily(node) === 'string') {
            return true;
        }
        return this.javaConcatOperandPrintsAsValue(node) && !this.javaConcatOperandCanBeDouble(node);
    }

    // a bare value an infix operator can take without extra parentheses: a ternary,
    // assignment or comma expression printed here would re-parse (`(x + c ? a : b)`),
    // and an optional-chain call prints a guarded shape that is not an operand
    javaConcatOperandPrintsAsValue(node) {
        if (node === undefined) {
            return false;
        }
        if (isParenthesizedExpression(node)) {
            return this.javaConcatOperandPrintsAsValue(node.expression);
        }
        switch (node.kind) {
        case SyntaxKind.Identifier:
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
        case SyntaxKind.NumericLiteral:
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.NullKeyword:
        case SyntaxKind.ThisKeyword:
        case SyntaxKind.NewExpression:
        case SyntaxKind.ArrayLiteralExpression:
            return true;
        case SyntaxKind.PropertyAccessExpression:
        case SyntaxKind.ElementAccessExpression:
        case SyntaxKind.CallExpression:
            return node.questionDotToken === undefined;
        }
        return false;
    }

    // a Double operand makes Helpers.add take its `instanceof Double` branch and return a NUMBER, while
    // javac's `+` concatenates, so an operand that can be a boxed Double keeps the helper. Only types
    // that can never hold a number are accepted, plus integer literals that print as a Java `long`.
    javaConcatOperandCanBeDouble(node) {
        if (this.javaProvableNumericKind(node) === 'long') {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return true;
        }
        const type = checker.getTypeAtLocation(node);
        if (type === undefined) {
            return true;
        }
        const notNumber = TypeFlags.String | TypeFlags.StringLiteral | TypeFlags.TemplateLiteral
            | TypeFlags.Boolean | TypeFlags.BooleanLiteral | TypeFlags.Object | TypeFlags.Null
            | TypeFlags.Undefined | TypeFlags.Void | TypeFlags.Never;
        const notNumeric = (t) => {
            if (t === undefined || t.flags === 0) {
                return false;
            }
            if (t.isUnionType?.()) {
                return t.getTypes().every(notNumeric);
            }
            return (t.flags & ~notNumber) === 0;
        };
        return !notNumeric(type);
    }

    // the Java kind a `this.<name>(...)` call provably prints with (JAVA_THIS_RETURN_TYPES), or
    // undefined. The signature must resolve to the base tier or the Date.now lib signature of the
    // functions/time.ts mixin; a venue override prints its own (usually Object) signature.
    javaThisCallNumericKind(node): string | undefined {
        if (node?.kind !== SyntaxKind.CallExpression) {
            return undefined;
        }
        const callee = node.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression || callee.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const name = callee.name?.text;
        if (typeof name !== 'string') {
            return undefined;
        }
        const kind = JAVA_THIS_RETURN_TYPES[name];
        if (kind === undefined) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        const declaration = checker.getResolvedSignature(node)?.declaration?.resolve();
        const fileName = declaration?.getSourceFile?.().fileName;
        if (typeof fileName !== 'string') {
            return undefined;
        }
        if (!JAVA_THIS_RETURN_TYPES_BASE_FILE.test(fileName) && !JAVA_THIS_RETURN_TYPES_LIB_FILE.test(fileName)) {
            return undefined;
        }
        return kind;
    }

    // the Java kind a numeric operand provably prints with: decimal integer literal -> 'long',
    // fractional literal -> 'double', a nested native `+ - * /` -> its kind, a local retyped
    // `Long`/`Double` -> that kind. Hex/binary literals, negatives, calls, untyped locals: undefined.
    javaProvableNumericKind(node, allowDeclaredLocals = true): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        if (node.kind === SyntaxKind.ParenthesizedExpression) {
            return this.javaProvableNumericKind(node.expression, allowDeclaredLocals);
        }
        if (isNumericLiteral(node)) {
            const text = node.text;
            if (/^0[xXbBoO]/.test(text)) {
                return undefined;
            }
            return /[.eE]/.test(text) ? 'double' : 'long';
        }
        if (node.kind === SyntaxKind.Identifier) {
            if (this.javaPrintedIntCounter(node)) {
                return 'int';
            }
            if (allowDeclaredLocals && this.javaLongParameterRead(node) && this.javaNullGuardAdmitsRead(node)) {
                return 'long'; // an unwritten Long core parameter behind a null test
            }
            return allowDeclaredLocals ? this.javaDeclaredNumericLocalKind(node) : undefined;
        }
        if (node.kind === SyntaxKind.CallExpression) {
            // hand-written base accessors that box a primitive (`Long milliseconds()`,
            // `int parseTimeframe(..)`) - never null, so they anchor the native arithmetic
            if (this.javaBaseTimeLongCall(node)) {
                return 'long';
            }
            if (this.javaBaseIntCall(node)) {
                return 'int';
            }
            // indexOf/search print int, Math.round a primitive long (javaPrintedCallKind)
            const printed = this.javaPrintedCallKind(node);
            return (printed === 'int' || printed === 'long') ? printed : undefined;
        }
        if (node.kind === SyntaxKind.BinaryExpression) {
            return this.javaNativeArithmeticKind(node, allowDeclaredLocals);
        }
        if (this.javaLengthIntRead(node)) {
            return 'int';
        }
        return undefined;
    }

    // a bare identifier the embedding layer declares `Long`/`Double` prints as a boxed numeric, but a
    // null box would NPE where the helpers return null, so the checker must see a plain non-nullable
    // number here (nullable aliases and `any` excluded; a narrowed `number` is a real guard in Java).
    javaDeclaredNumericLocalKind(node): string | undefined {
        if (!this.javaOperandIsNonNullNumber(node) || !this.javaIdentifierKeepsDeclaredName(node)
            || !this.javaIdentifierPrintsDeclaredName(node)) {
            return undefined;
        }
        const declaration = this.javaDeclarationOfIdentifier(node);
        let javaType;
        if (declaration !== undefined) {
            try {
                javaType = this.javaDeclaredTypeOfDeclaration(declaration);
            } catch (e) {
                javaType = undefined;
            }
        }
        if (javaType === undefined && typeof this.javaExpressionTypeResolver === 'function') {
            try {
                javaType = this.javaExpressionTypeResolver(node);
            } catch (e) {
                javaType = undefined;
            }
        }
        return this.javaDeclaredNumericTypeKind(javaType);
    }

    // the numeric kind a printed Java declaration type names, or undefined for every other
    // type (`Object`, `String`, a boxed collection)
    javaDeclaredNumericTypeKind(javaType): string | undefined {
        if (javaType === undefined) {
            return undefined;
        }
        const type = String(javaType).replace(/^final\s+/, '').trim();
        const kinds = new Map([['Long', 'long'], ['long', 'long'], ['Double', 'double'], ['double', 'double'],
            ['Integer', 'int'], ['int', 'int']]);
        return kinds.get(type);
    }

    // the use prints the declaration's own name: a local or parameter the printer renamed
    // (the `finalX` object-literal capture, the async parameter wrapper) prints against a
    // different declaration, whose recorded type does not describe it
    javaIdentifierPrintsDeclaredName(node): boolean {
        try {
            return this.printNode(node, 0) === String(node.text);
        } catch (e) {
            return false;
        }
    }

    // a use the printer rewrote to its `finalX` anonymous-class capture prints against its
    // own `Object finalX = x;` local, so the recorded type of the declaration no longer
    // holds (`(finalTime - 8L)` on an Object local does not compile)
    javaIdentifierKeepsDeclaredName(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        if (declaration === undefined || (declaration.kind !== SyntaxKind.VariableDeclaration
            && !isParameterDeclaration(declaration))) {
            return false;
        }
        return String(node.text) === String(declaration.name?.text);
    }

    // the checker type is the plain non-nullable `number` (TypeFlags.Number/NumberLiteral, no
    // alias): `Int`/`Num`/`any` and unions hold undefined at runtime, which the helpers absorb
    javaOperandIsNonNullNumber(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const type = checker.getTypeAtLocation(node);
        return type !== undefined && type.getAliasSymbol?.() === undefined
            && (type.flags === TypeFlags.Number || type.flags === TypeFlags.NumberLiteral);
    }

    // the kind of the native arithmetic this rule prints for `+ - * /`, or undefined when
    // the node keeps the helper. Mirrors printInlineHelperArithmetic operand-for-operand
    // so callers can reason about the printed text of a nested arithmetic operand;
    // `allowDeclaredLocals=false` asks for a kind that does not rely on a retyped local
    // anywhere in the subtree (`+` never consumes one — java-13/14 own Add).
    javaNativeArithmeticKind(node, allowDeclaredLocals = true): string | undefined {
        const op = node?.operatorToken?.kind;
        const isPlus = op === SyntaxKind.PlusToken;
        const isMinus = op === SyntaxKind.MinusToken;
        const isMultiply = op === SyntaxKind.AsteriskToken;
        const isDivide = op === SyntaxKind.SlashToken;
        if (!isPlus && !isMinus && !isMultiply && !isDivide) {
            return undefined;
        }
        if (this.javaScalarFamily(node.left) !== 'number' || this.javaScalarFamily(node.right) !== 'number') {
            return undefined;
        }
        if (isMultiply && this.javaLiteralFractionalProduct(node.left, node.right)) {
            return 'double';
        }
        const childAllows = allowDeclaredLocals && !isPlus;
        const leftKind = this.javaProvableNumericKind(node.left, childAllows);
        const rightKind = this.javaProvableNumericKind(node.right, childAllows);
        return this.javaNativeArithmeticPairKind(isPlus, isMultiply, isDivide, leftKind, rightKind);
    }

    // `2 * 1.67`: two decimal literals whose IEEE product is finite and fractional. Helpers.multiply
    // re-boxes only an integral product as Long, so a fractional one is the native double product.
    javaLiteralFractionalProduct(left, right): boolean {
        const value = (node) => ((node !== undefined && isNumericLiteral(node) && !/^0[xXbBoO]/.test(node.text)) ? Number(node.text) : undefined);
        const a = value(left);
        const b = value(right);
        if (a === undefined || b === undefined || (!/[.eE]/.test(left.text) && !/[.eE]/.test(right.text))) {
            return false;
        }
        const product = a * b;
        return Number.isFinite(product) && !Number.isInteger(product);
    }

    // the native operator kind for a proven pair, or undefined. The helper's branch IS this operator:
    // `/` is always double division; `-` boxes long for long/long and double otherwise; `*` only on
    // long pairs (multiply re-boxes an integral double product as Long); `+` keeps the equal-kind rule.
    javaNativeArithmeticPairKind(isPlus, isMultiply, isDivide, leftKind, rightKind): string | undefined {
        if (leftKind === undefined || rightKind === undefined) {
            return undefined;
        }
        if (isDivide) {
            return 'double';
        }
        const hasDouble = (leftKind === 'double') || (rightKind === 'double');
        if (isMultiply) {
            return hasDouble ? undefined : 'long';
        }
        if (isPlus) {
            return (leftKind === rightKind) ? leftKind : undefined;
        }
        return hasDouble ? 'double' : 'long';
    }

    // hx10 J07: 'long' | 'double' for a nested `+` this printer already prints natively through
    // printWidenedNativeAdd, or undefined. Mirrors that printer's operand proof (javaWidenedNumericKind)
    // behind the family and concat tests printInlineHelperArithmetic applies before it calls it.
    javaJ07NestedAddKind(node): string | undefined {
        while (node?.kind === SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        if (node?.kind !== SyntaxKind.BinaryExpression || node.operatorToken?.kind !== SyntaxKind.PlusToken) {
            return undefined;
        }
        const leftFamily = this.javaScalarFamily(node.left);
        const rightFamily = this.javaScalarFamily(node.right);
        if (leftFamily !== 'number' || rightFamily !== 'number') {
            return undefined;
        }
        if (this.javaStringConcatIsProvable(node.left, node.right, leftFamily, rightFamily)) {
            return undefined;
        }
        return this.javaWidenedAddKind(node);
    }

    // the `- * /` operand kind: the printer's own proof first, then the nested-sum proof
    javaJ07ArithmeticKind(node, allowDeclaredLocals = true): string | undefined {
        const kind = this.javaProvableNumericKind(node, allowDeclaredLocals);
        return kind !== undefined ? kind : this.javaJ07NestedAddKind(node);
    }

    // ---- ordered comparison over declared numeric locals ----
    // Helpers.isGreaterThan answers its own predicate when an operand is null (GT: a != null && b == null;
    // LT = !GT && !EQ; GE = GT || EQ; LE = LT || EQ), so a Long/Integer/Double box compares natively
    // inside that exact null table. `>` is a toDouble compare for every numeric pair; `>= < <=` also go
    // through isEqual, so they stay native only for integral pairs (no NaN / BigDecimal rounding arm).

    // 'long' | 'double' for an operand the printer proves: a primitive-printing expression, or an
    // identifier whose printed declaration is a numeric type (boxed = may be null)
    javaComparisonOperand(node): { kind: string, boxed: boolean } | undefined {
        let inner = node;
        while (inner !== undefined && inner.kind === SyntaxKind.ParenthesizedExpression) {
            inner = inner.expression;
        }
        if (inner === undefined) {
            return undefined;
        }
        const primitive = this.javaPrimitiveOperandKind(inner);
        if (primitive !== undefined) {
            return { kind: primitive === 'double' ? 'double' : 'long', boxed: false };
        }
        if (!isIdentifier(inner) || !this.javaIdentifierPrintsDeclaredName(inner)) {
            return undefined;
        }
        if (this.javaLongParameterRead(inner)) {
            return { kind: 'long', boxed: !this.javaNullGuardAdmitsRead(inner) };
        }
        const declared = this.javaDeclaredNumericFamily(inner);
        if (declared === undefined) {
            return undefined;
        }
        const kind = (declared === 'Double' || declared === 'double') ? 'double' : 'long';
        return { kind, boxed: JAVA_BOXED_NUMERIC_TYPES.has(declared) };
    }

    printDeclaredNumericComparison(left, right, op): string | undefined {
        const l = this.javaComparisonOperand(left);
        const r = this.javaComparisonOperand(right);
        if (l === undefined || r === undefined) {
            return undefined;
        }
        if (op !== SyntaxKind.GreaterThanToken && (l.kind !== 'long' || r.kind !== 'long')) {
            return undefined;
        }
        const a = this.printNode(left, 0);
        const b = this.printNode(right, 0);
        const cmp = `${a} ${this.SupportedKindNames[op]} ${b}`;
        if (!l.boxed && !r.boxed) {
            return `(${cmp})`; // a guarded Long parameter unboxes like a primitive
        }
        const aNull = `${a} == null`;
        const aSet = `${a} != null`;
        const bNull = `${b} == null`;
        const bSet = `${b} != null`;
        // each arm below is the helper's null table, with the unreachable nulls folded away
        switch (op) {
        case SyntaxKind.GreaterThanToken:
            return `(${[l.boxed ? aSet : undefined, r.boxed ? `(${bNull} || ${cmp})` : cmp].filter((x) => x !== undefined).join(' && ')})`;
        case SyntaxKind.LessThanToken:
            return `(${[r.boxed ? bSet : undefined, l.boxed ? `(${aNull} || ${cmp})` : cmp].filter((x) => x !== undefined).join(' && ')})`;
        case SyntaxKind.GreaterThanEqualsToken:
            return `(${[r.boxed ? bNull : undefined, l.boxed ? `(${aSet} && ${cmp})` : cmp].filter((x) => x !== undefined).join(' || ')})`;
        case SyntaxKind.LessThanEqualsToken:
            return `(${[l.boxed ? aNull : undefined, r.boxed ? `(${bSet} && ${cmp})` : cmp].filter((x) => x !== undefined).join(' || ')})`;
        }
        return undefined;
    }

    // ---- widened native add (`+` only) ----
    // Helpers.add normalizes Integer to Long, boxes Long for integral operands and Double otherwise
    // (null in -> null out), so native `+` over proven numeric non-null operands gives the same box.

    // `this.milliseconds()` / `this.seconds()`: the hand-written Java declares both `public Long` over
    // a primitive time value, so the box is never null. Only a signature resolving into the base time
    // mixin or the Date.now lib chain qualifies; an unresolved call or venue override keeps the helper.
    javaBaseTimeLongCall(node) {
        const name = this.javaThisCallName(node);
        if (name !== 'milliseconds' && name !== 'seconds') {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        const declaration = checker.getResolvedSignature(node)?.declaration?.resolve();
        if (declaration === undefined) {
            return false;
        }
        const fileName = declaration.getSourceFile?.()?.fileName ?? '';
        // `milliseconds = now` where `now = Date.now` (ts/src/base/functions/time.ts) resolves
        // to the Date.now signature inside the typescript lib chain; `seconds` is declared
        // in that same base file.
        return /(^|[\\/])ts[\\/]src[\\/]base[\\/]functions[\\/]time\.ts$/.test(fileName)
            || /(^|[\\/])lib\.[^\\/]*\.d\.ts$/.test(fileName);
    }

    // `this.parseTimeframe(..)`: the hand-written java BaseExchange declares `public int
    // parseTimeframe(Object)` (java/lib/.../BaseExchange.java:1513) over the primitive-int
    // ts/src/base/functions/misc.ts arrow, so the call is a never-null Java int. A venue's
    javaBaseIntCall(node) {
        if (this.javaThisCallName(node) !== 'parseTimeframe') {
            return false;
        }
        let declaration;
        try {
            declaration = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
        } catch (e) {
            declaration = undefined;
        }
        if (declaration === undefined) {
            return false;
        }
        const fileName = declaration.getSourceFile?.()?.fileName ?? '';
        return /(^|[\\/])ts[\\/]src[\\/]base[\\/]functions[\\/]misc\.ts$/.test(fileName);
    }

    // the method name of a `this.<name>(...)` call, or undefined for any other node
    javaThisCallName(node) {
        const callee = node?.kind === SyntaxKind.CallExpression ? node.expression : undefined;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression || callee.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        return callee.name?.text;
    }

    // `for (var i = <int literal>; ...; i++)`: printForStatement rewrites the emitted
    // `Object i = 0` initializer to `var i = 0`, so javac types the counter int. The
    // counter is widened explicitly by javaPrintWidenedOperand, and no `=`/compound
    javaIntForCounter(node) {
        if (node?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const symbol = this.getChecker().getSymbolAtLocation(node);
        const declaration = symbol?.valueDeclaration?.resolve();
        if (declaration === undefined || !isVariableDeclaration(declaration)) {
            return false;
        }
        const declarationList = declaration.parent;
        if (declarationList === undefined || !isVariableDeclarationList(declarationList)
            || declarationList.declarations.length !== 1) {
            return false;
        }
        const forStatement: any = declarationList.parent;
        if (forStatement === undefined || forStatement.kind !== SyntaxKind.ForStatement
            || forStatement.initializer !== declarationList) {
            return false;
        }
        if (this.javaIntegerLiteralKind(declaration.initializer) !== 'int') {
            return false;
        }
        return this.javaCounterHasNoBoxWrite(node, symbol);
    }

    // no `=`/compound assignment anywhere in the enclosing function writes this counter;
    // `++`/`--` keep the primitive int, any other operator would not
    javaCounterHasNoBoxWrite(node, symbol) {
        let scope = node.parent;
        while (scope !== undefined && !isFunctionLike(scope) && scope.kind !== SyntaxKind.SourceFile) {
            scope = scope.parent;
        }
        if (scope === undefined) {
            return false;
        }
        let safe = true;
        const visit = (current) => {
            if (!safe || current === undefined) {
                return;
            }
            if (isIdentifier(current) && this.getChecker().getSymbolAtLocation(current) === symbol) {
                const parent = current.parent;
                if (parent !== undefined && isBinaryExpression(parent) && parent.left === current
                    && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(parent.operatorToken.kind)) {
                    safe = false;
                    return;
                }
            }
            current.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return safe;
    }

    // `x.length` on a String/List receiver prints `((String)x).length()` /
    // `((java.util.List<?>)x).size()` — a Java int on every path printJavaLength takes
    javaLengthIntRead(node) {
        if (node?.kind !== SyntaxKind.PropertyAccessExpression || node.name?.text !== 'length') {
            return false;
        }
        return this.javaLengthKind(node.expression) !== undefined;
    }

    // the Java numeric kind of one `+` operand: the literal proofs above plus the
    // non-null base-tier Long accessors, primitive int for-counters and String/List
    // length reads. Undefined keeps the helper.
    javaWidenedNumericKind(node) {
        if (node === undefined) {
            return undefined;
        }
        if (node.kind === SyntaxKind.ParenthesizedExpression) {
            return this.javaWidenedNumericKind(node.expression);
        }
        const literalKind = this.javaIntegerLiteralKind(node);
        if (literalKind !== undefined) {
            return literalKind;
        }
        if (isNumericLiteral(node)) {
            // hex/octal/binary literals keep the helper; fractional/exponent literals are
            // Java doubles and can hold NaN, which the helper's arithmetic propagates
            if (/^0[xXbBoO]/.test(node.text)) {
                return undefined;
            }
            return /[.eE]/.test(node.text) ? 'double' : undefined;
        }
        if (this.javaBaseTimeLongCall(node)) {
            return 'long';
        }
        if (this.javaBaseIntCall(node) || this.javaIntForCounter(node) || this.javaLengthIntRead(node)) {
            return 'int';
        }
        if (node.kind === SyntaxKind.Identifier) {
            // a declared numeric local/parameter (the embedding layer's declaration table,
            // or a native parameter type): an Integer declares as integral, and the helper
            // normalized it to Long anyway
            if (this.javaLongParameterRead(node) && this.javaNullGuardAdmitsRead(node)) {
                return 'long';
            }
            return this.javaDeclaredNumericLocalKind(node);
        }
        if (node.kind === SyntaxKind.BinaryExpression && node.operatorToken.kind === SyntaxKind.PlusToken) {
            return this.javaWidenedAddKind(node);
        }
        // a nested `- * /` keeps the printer's own literal rule (java-18's family)
        return this.javaNativeArithmeticKind(node);
    }

    // the kind of a nested native `+` this rule prints, or undefined when it keeps the helper
    javaWidenedAddKind(node) {
        const leftKind = this.javaWidenedNumericKind(node.left);
        const rightKind = this.javaWidenedNumericKind(node.right);
        if (leftKind === undefined || rightKind === undefined) {
            return undefined;
        }
        return (leftKind === 'double' || rightKind === 'double') ? 'double' : 'long';
    }

    // the native form of a numeric `+`, or undefined to keep Helpers.add
    printWidenedNativeAdd(left, right, leftText, rightText) {
        const leftKind = this.javaWidenedNumericKind(left);
        const rightKind = this.javaWidenedNumericKind(right);
        if (leftKind === undefined || rightKind === undefined) {
            return undefined;
        }
        const resultKind = (leftKind === 'double' || rightKind === 'double') ? 'double' : 'long';
        const leftOperand = this.javaPrintWidenedOperand(leftKind, resultKind, left, leftText);
        const rightOperand = this.javaPrintWidenedOperand(rightKind, resultKind, right, rightText);
        return `(${leftOperand} + ${rightOperand})`;
    }

    // `x + <int literal>` where the embedding layer reports x printed as the nullable box `Long x`:
    // Helpers.add's Long arm is the long sum and its null arm answers null, so the null test
    // keeps both. Only a plain name (read twice) qualifies.
    printBoxedLongLiteralAdd(left, right, leftText, rightText) {
        if (this.javaBoxedLongResolver === undefined || !isIdentifier(left) || !isNumericLiteral(right)
            || this.javaIntegerLiteralKind(right) === undefined || !/^\d{1,15}$/.test(rightText)
            || leftText !== left.text) {
            return undefined;
        }
        let boxed = false;
        try {
            boxed = this.javaBoxedLongResolver(left) === true;
        } catch (e) {
            boxed = false;
        }
        return boxed ? `(${leftText} == null ? null : (Object) (${leftText} + ${rightText}L))` : undefined;
    }

    // an int operand is widened to long explicitly: `i + 1` would box an Integer where
    // Helpers.add hands back a Long, and an all-int sum wraps where the helper's long
    // does not. Integer literals print long; a Double result needs no widening.
    javaPrintWidenedOperand(kind, resultKind, node, text) {
        if (kind === 'double') {
            return text;
        }
        if (kind === 'long' || isNumericLiteral(node)) {
            return this.javaPrintOperandAsLong(node, text);
        }
        if (resultKind === 'long') {
            return `((long) ${text})`;
        }
        return text;
    }

    // true when the receiver's printed Java would be a `cond ? a : b` (a parenthesised
    // conditional): those keep the helper so no added line carries a `?`
    javaSplitTernaryReceiver(node): boolean {
        if (node.kind === SyntaxKind.ParenthesizedExpression) {
            return this.javaSplitTernaryReceiver(node.expression);
        }
        return node.kind === SyntaxKind.ConditionalExpression;
    }

    // `s.split (<literal>)` -> the printer's own TS-array shape around Java's
    // String.split(Pattern.quote(...)): the plain-string receiver makes the helper's
    // String.valueOf/null branch unreachable and the result stays readable as List<Object>.
    javaNativeSplitCall(node, name, parsedArg): string | undefined {
        if (node === undefined || name === undefined || parsedArg === undefined) {
            return undefined;
        }
        const callee = node.expression;
        if (callee === undefined || callee.kind !== SyntaxKind.PropertyAccessExpression) {
            return undefined;
        }
        if (callee.name?.text !== 'split' || node.arguments?.length !== 1) {
            return undefined;
        }
        const receiver = callee.expression;
        const separator = node.arguments[0];
        if (receiver === undefined) {
            return undefined;
        }
        // a conditional receiver keeps the helper: the campaign's diff audit flags every
        // added line that carries a `?`, and such a line never goes native in this family
        if (this.javaSplitTernaryReceiver(receiver)) {
            return undefined;
        }
        // the receiver and the separator are plain TS `string`s (no alias, no union): the helper's
        // String.valueOf/null branches are unreachable and Pattern.quote takes the separator as is
        if (this.javaScalarFamily(receiver) !== 'string' || this.javaScalarFamily(separator) !== 'string') {
            return undefined;
        }
        return `${this.ARRAY_OPENING_TOKEN}${this.javaNativeSplitText(name, parsedArg)}${this.ARRAY_CLOSING_TOKEN}`;
    }

    javaNativeSplitText(name, parsedArg): string {
        return `((String)${name}).split(java.util.regex.Pattern.quote(${parsedArg}))`;
    }

    // `s.split (<literal>)[<int literal>]` on the native split: the helper's List branch answers
    // null off range (e.g. "/".split("/") is empty), which findFirst().orElse(null) keeps, with
    // no local to hoist and the receiver evaluated once.
    javaNativeSplitIndexRead(node, index: number): string | undefined {
        const call = node.expression;
        if (node.questionDotToken !== undefined || !isCallExpression(call) || call.questionDotToken !== undefined
            || !isPropertyAccessExpression(call.expression) || call.expression.questionDotToken !== undefined) {
            return undefined;
        }
        const receiver = call.expression.expression;
        const separator = call.arguments?.[0];
        if (separator === undefined) {
            return undefined;
        }
        const name = this.printNode(receiver, 0);
        const parsedArg = this.printNode(separator, 0).trimStart();
        if (this.javaNativeSplitCall(call, name, parsedArg) === undefined) {
            return undefined;
        }
        const array = this.javaNativeSplitText(name, parsedArg);
        const skip = index > 0 ? `.skip(${index})` : '';
        return `java.util.Arrays.stream(${array})${skip}.findFirst().orElse(null)`;
    }

    // integer literals print as Java `int`; the helpers normalize Integer to Long before
    // the arithmetic, so native integer arithmetic is emitted in long to keep the boxed
    // result identical
    javaPrintOperandAsLong(node, text) {
        if (!isNumericLiteral(node) || /[.eE]/.test(node.text)) {
            return text;
        }
        return /L$/.test(text) ? text : text + 'L';
    }

    // the native form of a helper-family binary operator, or undefined to keep the helper
    // `for (var i = <int literal>; ...; i++)` prints a primitive `var` counter (see
    // isJavaPrimitiveForCounter). Only ++/-- may write it: any other assignment in the
    // loop would print a different kind into the same slot (D2), so the proof bails.
    javaProvableCounterInt(node) {
        if (!node || node.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const symbol = this.getChecker().getSymbolAtLocation(node);
        const declaration: any = symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve();
        if (!declaration || declaration.kind !== SyntaxKind.VariableDeclaration) {
            return false;
        }
        if (this.javaIntegerLiteralKind(declaration.initializer) !== 'int') {
            return false;
        }
        const list = declaration.parent;
        const forStatement: any = list?.parent;
        if (!forStatement || forStatement.kind !== SyntaxKind.ForStatement || forStatement.initializer !== list) {
            return false;
        }
        const incrementor = forStatement.incrementor;
        if (!incrementor || incrementor.operand?.kind !== SyntaxKind.Identifier
            || incrementor.operand.text !== node.text) {
            return false;
        }
        if (incrementor.kind !== SyntaxKind.PostfixUnaryExpression && incrementor.kind !== SyntaxKind.PrefixUnaryExpression) {
            return false;
        }
        const name = node.text;
        let safe = true;
        const scan = (n) => {
            if (!safe || !n || n === incrementor) {
                return;
            }
            if (n.kind === SyntaxKind.BinaryExpression && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(n.operatorToken.kind)
                && n.left?.kind === SyntaxKind.Identifier && n.left.text === name) {
                safe = false;
                return;
            }
            if ((n.kind === SyntaxKind.PostfixUnaryExpression || n.kind === SyntaxKind.PrefixUnaryExpression)
                && n.operand?.kind === SyntaxKind.Identifier && n.operand.text === name) {
                return;
            }
            n.forEachChild(scan);
        };
        scan(forStatement.statement);
        if (!safe) {
            return false;
        }
        // the enclosing function may not write it either
        let enclosing = forStatement.parent;
        while (enclosing && !isFunctionLike(enclosing)) {
            enclosing = enclosing.parent;
        }
        if (enclosing) {
            const body = enclosing.body ?? enclosing;
            const scanOuter = (n) => {
                if (!safe || !n || n === forStatement || isFunctionLike(n)) {
                    return;
                }
                if (n.kind === SyntaxKind.BinaryExpression && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(n.operatorToken.kind)
                    && n.left?.kind === SyntaxKind.Identifier && n.left.text === name) {
                    safe = false;
                    return;
                }
                n.forEachChild(scanOuter);
            };
            scanOuter(body);
        }
        return safe;
    }

    // ---- declared-box arithmetic (hx11 RFM-J2 leaf C) ----
    // `Helpers.add/subtract/multiply/divide` on operands whose DECLARED Java type (the embedding layer's
    // javaDeclaredLocalTypeResolver, or a Long core parameter) is Long/long/Integer/int/Double/double, or an
    // integer literal. Every helper answers `null` for a null operand, so a boxed operand's null arm is
    // the explicit ternary; integral operands print widened (`((long) i)`, `1L`) because the helpers
    // normalize Integer to Long; a double operand promotes natively. `multiply` stays integral-only
    // (it re-boxes an integral double product as Long), `+ - *` on a double keep `double` boxes.

    // 'longbox' | 'longprim' | 'intbox' | 'intprim' | 'doublebox' | 'doubleprim' | 'intlit' | 'longlit'
    javaDeclaredBoxOperandKind(node, text: string): string | undefined {
        let inner = node;
        while (inner !== undefined && (isParenthesizedExpression(inner) || isAsExpression(inner)
            || inner.kind === SyntaxKind.NonNullExpression)) {
            inner = inner.expression;
        }
        if (inner === undefined) {
            return undefined;
        }
        if (isNumericLiteral(inner)) {
            const kind = this.javaIntegerLiteralKind(inner);
            return kind === undefined ? undefined : (kind === 'long' ? 'longlit' : 'intlit');
        }
        if (!isIdentifier(inner) || this.javaStripPrintedParens(text) !== String(inner.text)
            || !this.javaIdentifierPrintsDeclaredName(inner)) {
            return undefined;
        }
        const declaration = this.javaDeclarationOfIdentifier(inner);
        if (declaration !== undefined && !this.javaIdentifierKeepsDeclaredName(inner)) {
            return undefined; // a renamed capture (`finalX`) prints against another declaration
        }
        let declared: string | undefined;
        if (declaration !== undefined) {
            try {
                declared = this.javaDeclaredTypeOfDeclaration(declaration);
            } catch (e) {
                declared = undefined;
            }
            if (declared === undefined && this.javaLongParameterRead(inner)) {
                declared = 'Long'; // an unwritten default-valued `Int` parameter printed as the core's Long
            }
        } else if (typeof this.javaBindingElementTypeResolver === 'function') {
            const element: any = this.getChecker().getSymbolAtLocation(inner)?.valueDeclaration?.resolve();
            if (element?.kind === SyntaxKind.BindingElement && (element.name as any)?.text === inner.text) {
                try {
                    declared = this.javaBindingElementTypeResolver(element);
                } catch (e) {
                    declared = undefined;
                }
            }
        }
        const kinds: { [type: string]: string } = {
            Long: 'longbox', long: 'longprim', Integer: 'intbox', int: 'intprim', Double: 'doublebox', double: 'doubleprim'
        };
        const kind = declared === undefined ? undefined : kinds[declared.replace(/^final\s+/, '').trim()];
        // a read behind a dominating null test, and a `.length`-derived local (never null), are the
        // operands the null-guard / length text passes after the printer turn native WITHOUT a null arm:
        // leave them to those passes
        if (kind !== undefined && kind.endsWith('box') && declaration !== undefined
            && (this.javaNullGuardAdmitsRead(inner) || this.javaLocalIsLengthDerived(declaration))) {
            return undefined;
        }
        // the checker type must itself be a number (plain or `Int` / `Num` = number | undefined): an `any`
        // operand (`x.length` of an `any`, a `.length` switch local) is the shape of the passes that follow
        return kind !== undefined && this.javaNumberOrNullishType(inner) ? kind : undefined;
    }

    // `const n = x.length` (a Java int read, never null)
    javaLocalIsLengthDerived(declaration): boolean {
        const init = declaration?.kind === SyntaxKind.VariableDeclaration
            ? this.unwrapPrintTransparentExpression(declaration.initializer) : undefined;
        return init !== undefined && isPropertyAccessExpression(init) && init.name.text === 'length';
    }

    // number, number-literal, or a union of those with undefined / null / void
    javaNumberOrNullishType(node): boolean {
        let type: any;
        try {
            type = this.checkerOrUndefined()?.getTypeAtLocation(node);
        } catch (e) {
            return false;
        }
        if (type === undefined) {
            return false;
        }
        const isNumber = (t: any) => ((t?.flags ?? 0) & (TypeFlags.Number | TypeFlags.NumberLiteral)) !== 0;
        if (isNumber(type)) {
            return true;
        }
        const members: any[] = (((type.flags ?? 0) & TypeFlags.Union) !== 0 ? type.getTypes?.() : undefined) ?? [];
        return members.some(isNumber) && members.every((m) => isNumber(m)
            || ((m?.flags ?? 0) & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void)) !== 0);
    }

    javaStripPrintedParens(text: string): string {
        let value = text.trim();
        while (value.startsWith('(') && value.endsWith(')')) {
            let depth = 0;
            let closesAtEnd = true;
            for (let i = 0; i < value.length; i++) {
                if (value[i] === '(') {
                    depth++;
                } else if (value[i] === ')') {
                    depth--;
                    if (depth === 0 && i < value.length - 1) {
                        closesAtEnd = false;
                        break;
                    }
                }
            }
            if (!closesAtEnd) {
                break;
            }
            value = value.slice(1, -1).trim();
        }
        return value;
    }

    // the value is read as itself: a ternary arm (`c ? (a + b) : 1.5` would binary-promote the boxed
    // arm and unbox a null) or a member-access receiver keeps the helper's Object box
    javaArithmeticResultIsBoxSensitive(node): boolean {
        let child = node;
        let parent = node?.parent;
        while (parent !== undefined && isParenthesizedExpression(parent)) {
            child = parent;
            parent = parent.parent;
        }
        if (parent === undefined) {
            return false;
        }
        if (parent.kind === SyntaxKind.ConditionalExpression) {
            return parent.condition !== child;
        }
        return (isPropertyAccessExpression(parent) || isElementAccessExpression(parent)) && parent.expression === child;
    }

    printDeclaredBoxArithmetic(node, left, right, leftText: string, rightText: string, op): string | undefined {
        // `/` is not here: Helpers.divide is null-first like multiply, but the old text pass never fired on it
        // that the null-guard / `.length` passes after the printer did not already own (0 residual sites)
        const operator = op === SyntaxKind.PlusToken ? '+' : op === SyntaxKind.MinusToken ? '-'
            : op === SyntaxKind.AsteriskToken ? '*' : undefined;
        if (operator === undefined || this.javaArithmeticResultIsBoxSensitive(node)) {
            return undefined;
        }
        const leftKind = this.javaDeclaredBoxOperandKind(left, leftText);
        const rightKind = this.javaDeclaredBoxOperandKind(right, rightText);
        if (leftKind === undefined || rightKind === undefined) {
            return undefined;
        }
        const isLiteral = (kind: string) => kind === 'intlit' || kind === 'longlit';
        if (isLiteral(leftKind) && isLiteral(rightKind)) {
            return undefined; // two literals are no declared operand
        }
        const isDouble = (kind: string) => kind === 'doublebox' || kind === 'doubleprim';
        const hasDouble = isDouble(leftKind) || isDouble(rightKind);
        if (hasDouble && operator === '*') {
            return undefined; // Helpers.multiply re-boxes an integral double product as Long
        }
        // Helpers.add / subtract answer a null operand with `toDouble (null)` = 0.0 once the OTHER
        // operand is a Double (and with null otherwise): the null arm is not one ternary, so a boxed
        // operand of a double `+` / `-` keeps the helper. Helpers.divide is null-first.
        if (hasDouble && (operator === '+' || operator === '-') && (leftKind.endsWith('box') || rightKind.endsWith('box'))) {
            return undefined;
        }
        const texts = [this.javaStripPrintedParens(leftText), this.javaStripPrintedParens(rightText)];
        const kinds = [leftKind, rightKind];
        const asLong = (i: number) => {
            if (kinds[i] === 'longbox' || kinds[i] === 'longprim' || kinds[i] === 'longlit') {
                return texts[i];
            }
            return kinds[i] === 'intlit' ? `${texts[i]}L` : `((long) ${texts[i]})`;
        };
        const asDouble = (i: number) => (isDouble(kinds[i]) ? texts[i] : `((double) ${texts[i]})`);
        const wide = (i: number) => (hasDouble ? asDouble(i) : asLong(i));
        const expression = `(${wide(0)} ${operator} ${wide(1)})`;
        const boxes = kinds.map((kind, i) => (kind.endsWith('box') ? texts[i] : undefined))
            .filter((text, i, all) => text !== undefined && all.indexOf(text) === i);
        return boxes.length === 0 ? expression : `((${boxes.map((box) => `${box} == null`).join(' || ')}) ? null : ${expression})`;
    }

    printInlineHelperArithmetic(left, right, leftText, rightText, op) {
        const isPlus = op === SyntaxKind.PlusToken || op === SyntaxKind.PlusEqualsToken;
        const isMinus = op === SyntaxKind.MinusToken || op === SyntaxKind.MinusEqualsToken;
        const isMultiply = op === SyntaxKind.AsteriskToken;
        const isDivide = op === SyntaxKind.SlashToken;
        const isMod = op === SyntaxKind.PercentToken;
        if (!isPlus && !isMinus && !isMultiply && !isDivide && !isMod) {
            return undefined;
        }
        const leftFamily = this.javaScalarFamily(left);
        const rightFamily = this.javaScalarFamily(right);
        if (isPlus && this.javaStringConcatIsProvable(left, right, leftFamily, rightFamily)) {
            const concat = `(${leftText} + ${rightText})`;
            return op === SyntaxKind.PlusEqualsToken ? `${leftText} = ${concat}` : concat;
        }
        // compound assignments keep the helper: the left side is a local the printer
        // declares Object, so the native operator would not compile
        if (op === SyntaxKind.PlusEqualsToken || op === SyntaxKind.MinusEqualsToken) {
            return undefined;
        }
        // `this.milliseconds() - <long-provable>`: the hand-written base call hands back
        // a Long, and Helpers.subtract's Long - Long branch is plain long arithmetic with
        // the same box (Helpers.java), so the helper drops when the right side is long too
        if (op === SyntaxKind.MinusToken) {
            const anchoredKind = this.javaThisCallNumericKind(left);
            if (anchoredKind === 'long' && this.javaProvableNumericKind(right) === 'long') {
                return `(${leftText} - ${this.javaPrintOperandAsLong(right, rightText)})`;
            }
        }
        if (leftFamily !== 'number' || rightFamily !== 'number') {
            // a tuple element typed `Int` (nullable alias) has no plain-number family; the printed `Long` box decides
            return op === SyntaxKind.PlusToken ? this.printBoxedLongLiteralAdd(left, right, leftText, rightText) : undefined;
        }
        if (op === SyntaxKind.PlusToken) {
            // the widened rule: literals + the non-null numeric proofs this printer owns
            return this.printWidenedNativeAdd(left, right, leftText, rightText)
                ?? this.printBoxedLongLiteralAdd(left, right, leftText, rightText);
        }
        if (isMod) {
            // Helpers.mod normalizes both operands to double and returns their double
            // remainder: the same value once both operands print as a non-null Java number
            if (!this.javaProvableNumericDoubleOperand(left) || !this.javaProvableNumericDoubleOperand(right)) {
                return undefined;
            }
            return `(((double) ${leftText}) % ((double) ${rightText}))`;
        }
        if (isMultiply && this.javaLiteralFractionalProduct(left, right)) {
            return `(${leftText} * ${rightText})`;
        }
        // `+` keeps phase-1's literal-only rule (java-13/14 own Add): its operands must not
        // derive from a retyped local anywhere below
        const childAllows = !isPlus;
        let leftKind = this.javaProvableNumericKind(left, childAllows);
        let rightKind = this.javaProvableNumericKind(right, childAllows);
        let pairKind = this.javaNativeArithmeticPairKind(isPlus, isMultiply, isDivide, leftKind, rightKind);
        // hx10 J07: an unproven pair retries with the nested-sum operand kind, so a native `+`
        // this printer already prints is consumable by the enclosing `- * /`
        if (pairKind === undefined) {
            const nestedLeft = this.javaJ07ArithmeticKind(left, childAllows);
            const nestedRight = this.javaJ07ArithmeticKind(right, childAllows);
            const nestedPair = this.javaNativeArithmeticPairKind(isPlus, isMultiply, isDivide, nestedLeft, nestedRight);
            if (nestedPair !== undefined) {
                leftKind = nestedLeft;
                rightKind = nestedRight;
                pairKind = nestedPair;
            }
        }
        if (pairKind === undefined) {
            return undefined;
        }
        if (isDivide) {
            // TS `/` is always float division and Helpers.divide never returns a long
            return `(((double) ${leftText}) / ((double) ${rightText}))`;
        }
        const operator = isPlus ? '+' : (isMinus ? '-' : '*');
        const widenedLeft = this.javaPrintArithmeticOperand(leftKind, left, leftText);
        const widenedRight = this.javaPrintArithmeticOperand(rightKind, right, rightText);
        return `(${widenedLeft} ${operator} ${widenedRight})`;
    }

    // an Integer/int operand is widened to long before the operator: Helpers normalizes an
    // Integer to Long first, so the native long arithmetic reproduces both the value (no
    // int-width wrap) and the Long box the helper hands back
    javaPrintArithmeticOperand(kind, node, text) {
        if (kind === 'int') {
            return `((long) ${text})`;
        }
        return this.javaPrintOperandAsLong(node, text);
    }

    // Helpers.mathMin/mathMax take Object, tolerate null and return the ORIGINAL box; Math.min/max take
    // primitives, so the native call needs both operands primitive of one family: literals, `for`
    // counters, `.length`/`.size()`, native long arithmetic; the only NaN-free double is a literal.
    javaNativeMathMinMaxOperandKind(node) {
        if (this.javaIntegerLiteralKind(node) !== undefined || this.isJavaPrimitiveForCounter(node)
            || (isPropertyAccessExpression(node) && node.name.text === 'length'
                && this.javaLengthKind(node.expression) !== undefined)) {
            return 'integral';
        }
        if (isNumericLiteral(node)) {
            return this.javaProvableNumericKind(node) === 'double' ? 'double' : undefined;
        }
        return this.javaProvableNumericKind(node) === 'long' ? 'integral' : undefined;
    }

    // a primitive has no members, so a receiver position (and the printer's cast wrappers) keep the
    // helper - every other position boxes the primitive exactly like the helper's own box (Jackson,
    // isEqual and toString all read an Integer and a Long the same way)
    javaNativeMathMinMaxResultIsPlainValue(node) {
        let parent = node.parent;
        while (parent !== undefined && isParenthesizedExpression(parent)) {
            parent = parent.parent;
        }
        if (parent === undefined) {
            return false;
        }
        if ((isPropertyAccessExpression(parent) || isElementAccessExpression(parent)
            || isCallExpression(parent)) && parent.expression === node) {
            return false;
        }
        return parent.kind !== SyntaxKind.AsExpression
            && parent.kind !== SyntaxKind.TypeAssertionExpression
            && parent.kind !== SyntaxKind.NonNullExpression;
    }

    // the native form of Math.min/Math.max, or undefined to keep the helper
    printNativeMathMinMax(node, left, right, leftText, rightText, name) {
        if (!this.javaNativeMathMinMaxResultIsPlainValue(node)) {
            return undefined;
        }
        const kind = this.javaNativeMathMinMaxOperandKind(left);
        if (kind === undefined || kind !== this.javaNativeMathMinMaxOperandKind(right)) {
            return undefined;
        }
        return `Math.${name}(${leftText}, ${rightText})`;
    }

    // ---- helper-family inlining: `parseInt/parseFloat/toString/padStart` ----
    // parseInt catches NumberFormatException into null, parseFloat into 0.0, Helpers.toString maps
    // null to null, Helpers.padStart truncates: native form only where the fallback is unreachable.

    // `Helpers.toString(x)` is `x == null ? null : x.toString()`, so `String.valueOf(x)`
    // is exact for every argument that cannot be null. Only a numeric literal or a
    // nested `+ - * /` this rule prints natively qualifies: both are Java primitives.
    javaStringBoxText(node, text) {
        return this.javaProvableNumericKind(node) !== undefined ? `String.valueOf(${text})` : `Helpers.toString(${text})`;
    }

    // The runtime uses Long.parseLong (parseInt) / Double.parseDouble (parseFloat) inside a catch; a
    // literal the native parser ACCEPTS cannot reach the catch, so the native call cannot change the
    // answer (parseInt additionally needs the value in long range, else the helper answers null).
    javaScalarParseAccepts(callee, text) {
        if (callee === 'parseInt') {
            if (!/^[+-]?[0-9]+$/.test(text)) {
                return false;
            }
            const value = BigInt(text.replace(/^\+/, ''));
            return value >= BigInt('-9223372036854775808') && value <= BigInt('9223372036854775807');
        }
        // Double.parseDouble's grammar minus the suffix forms; NaN/Infinity are parsed
        // by both, whitespace and hex floats by neither of the two the same way.
        return /^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$/.test(text)
            || /^[+-]?Infinity$/.test(text)
            || text === 'NaN';
    }

    // RF-java-3: `parseInt(x)` / `parseFloat(x)` whose single operand prints as a java.lang.String
    // (a String-declared name, a `x as string` cast, or any form the embedding layer proves String)
    // calls the String-typed twin of the helper (same bodies, String parameter).
    printStringTypedParse(node, callee) {
        const args = node?.arguments;
        if (args === undefined || args.length !== 1) {
            return undefined;
        }
        let operand = args[0];
        while (isParenthesizedExpression(operand)) {
            operand = operand.expression;
        }
        const castToString = isAsExpression(operand) && operand.type?.kind === SyntaxKind.StringKeyword;
        const printed = this.printNode(args[0], 0);
        // `s.replace(a, b)` on a TS string receiver that the printer spelled as the native
        // String.replaceFirst / replace: the call answers a java.lang.String
        const nativeReplace = isCallExpression(operand) && isPropertyAccessExpression(operand.expression)
            && (operand.expression.name.text === 'replace' || operand.expression.name.text === 'replaceAll')
            && this.javaScalarFamily(operand.expression.expression) === 'string'
            && /\.replace(First|All)?\(/.test(printed);
        if (!castToString && !nativeReplace && !this.javaDeclaredStringType(operand) && !this.javaResolvedString(operand)) {
            return undefined;
        }
        return `io.github.ccxt.base.JsParse.${callee}(${printed})`;
    }

    // `parseInt(x)` / `parseFloat(x)` -> the native parse, or undefined to keep the helper
    printNativeScalarParse(node, callee) {
        const args = node?.arguments;
        if (args === undefined || args.length !== 1 || !isStringLiteral(args[0])) {
            return undefined;
        }
        if (!this.javaScalarParseAccepts(callee, args[0].text)) {
            return undefined;
        }
        const nativeName = callee === 'parseInt' ? 'Long.parseLong' : 'Double.parseDouble';
        return `${nativeName}(${this.printNode(args[0], 0)})`;
    }

    // The printed receiver of a `padStart` this rule can inline: already cast (`((String)x)`) by the
    // printer or the ccxt local-typing pass, or the checker proves a plain TS string, so the accessor
    // cast this rule adds cannot fire.
    javaPadStartReceiverText(receiver, name) {
        if (/^\(+\(String\)/.test(name)) {
            return name;
        }
        if (this.javaScalarFamily(receiver) === 'string') {
            return `((String)${name})`;
        }
        return undefined;
    }

    // `x.padStart(n, 'c')` with a non-negative integer literal length and single-char literal pad.
    // Helpers.padStart pads then answers the LAST `n` chars, so the native form keeps both halves:
    // String.format builds the pad from an empty `%<k>s` and the >= arm reproduces the truncation.
    printNativePadStart(node, name) {
        const args = node?.arguments;
        if (args === undefined || args.length !== 2 || name === undefined) {
            return undefined;
        }
        if (this.javaIntegerLiteralKind(args[0]) !== 'int' || !/^[0-9]+$/.test(args[0].text)) {
            return undefined;
        }
        if (!isStringLiteral(args[1]) || args[1].text.length === 0) {
            return undefined;
        }
        const receiver = node.expression?.expression;
        if (!this.sideEffectFreeReceiver(receiver)) {
            return undefined;
        }
        const receiverText = this.javaPadStartReceiverText(receiver, name);
        if (receiverText === undefined) {
            return undefined;
        }
        const length = args[0].text;
        const pad = `'${this.javaCharLiteral(args[1].text[0])}'`;
        const lengthCall = `${receiverText}.length()`;
        return `(${lengthCall} >= ${length} ? ${receiverText}.substring(${lengthCall} - ${length})`
            + ` : String.format("%" + (${length} - ${lengthCall}) + "s", "").replace(' ', ${pad}) + ${receiverText})`;
    }

    // one char literal for the `String.format(...).replace(' ', c)` pad, escaped
    javaCharLiteral(character) {
        if (character === "'" || character === '\\') {
            return `\\${character}`;
        }
        return character;
    }

    // ---- typed locals for native arithmetic ----
    // A local whose initializer prints as native arithmetic holds a String / Long / Double box, so the
    // declaration carries that type; every other use is scanned first (D2) as it changes resolution.

    javaUnwrapParentheses(node) {
        let current = node;
        while (current?.kind === SyntaxKind.ParenthesizedExpression) {
            current = current.expression;
        }
        return current;
    }

    // the Java type of the native arithmetic this printer prints for a `+ - * / +=`
    // node, or undefined when the node keeps the helper (its printed value is an
    // Object box). Mirrors printInlineHelperArithmetic operand-for-operand.
    javaNativeArithmeticType(node) {
        const value = this.javaUnwrapParentheses(node);
        if (value?.kind !== SyntaxKind.BinaryExpression) {
            return undefined;
        }
        const op = value.operatorToken.kind;
        if (op === SyntaxKind.PlusToken && this.javaNativeConcat(value)) {
            return 'String';
        }
        if (op === SyntaxKind.PlusEqualsToken) {
            // the inlined `x = (x + y)` shape needs the same operand pair the concat
            // branch of printInlineHelperArithmetic needs
            const isStringPair = this.javaScalarFamily(value.left) === 'string'
                && this.javaScalarFamily(value.right) === 'string'
                && (this.javaProvableString(value.left) || this.javaProvableString(value.right));
            return isStringPair ? 'String' : undefined;
        }
        const kind = this.javaNativeArithmeticKind(value);
        return kind === 'long' ? 'Long' : (kind === 'double' ? 'Double' : undefined);
    }

    // the enclosing function-like node: the D2 scan scope of a typed local
    javaEnclosingFunction(node) {
        let current = node?.parent;
        while (current !== undefined) {
            const kind = current.kind;
            if (kind === SyntaxKind.MethodDeclaration || kind === SyntaxKind.FunctionDeclaration
                || kind === SyntaxKind.FunctionExpression || kind === SyntaxKind.ArrowFunction
                || kind === SyntaxKind.GetAccessor || kind === SyntaxKind.SetAccessor
                || kind === SyntaxKind.Constructor) {
                return current;
            }
            current = current.parent;
        }
        return undefined;
    }

    // a reassignment may keep the narrowed declaration only when its printed value is the
    // same Java type (the helper's box stays an Object, so it keeps the box)
    javaArithmeticWriteIsSafe(right, javaType) {
        const value = this.javaUnwrapParentheses(right);
        if (value === undefined) {
            return false;
        }
        if (value.kind === SyntaxKind.NullKeyword) {
            return true; // `null` is assignable to every box
        }
        if (value.kind === SyntaxKind.Identifier && value.text === 'undefined') {
            return true;
        }
        return (javaType === 'String' && (value.kind === SyntaxKind.StringLiteral
            || value.kind === SyntaxKind.NoSubstitutionTemplateLiteral))
            || this.javaNativeArithmeticType(value) === javaType;
    }

    // the innermost block that scopes a declaration (Java locals live to the end of
    // their block; sibling blocks may reuse the name, nested ones may not)
    javaScopingBlock(node) {
        let current = node?.parent;
        let last = undefined;
        while (current !== undefined) {
            if (current.kind === SyntaxKind.Block || current.kind === SyntaxKind.SourceFile) {
                return current;
            }
            last = current;
            current = current.parent;
        }
        return last;
    }

    javaNodeContains(outer, inner) {
        return outer !== undefined && inner !== undefined && outer.pos <= inner.pos && inner.end <= outer.end;
    }

    // two same-named bindings may both keep their own printed type only in disjoint
    // blocks: a nested one would already be an illegal Java shadowing of the Object
    // declaration the corpus compiles with
    javaBindingsAreDisjoint(declaration, other) {
        const mine = this.javaScopingBlock(declaration);
        const theirs = this.javaScopingBlock(other);
        if (mine === undefined || theirs === undefined) {
            return false;
        }
        return !this.javaNodeContains(mine, theirs) && !this.javaNodeContains(theirs, mine);
    }

    // is this occurrence of the local compatible with the narrowed declaration?
    javaArithmeticLocalUseIsSafe(node, declaration, javaType) {
        const parent = node.parent;
        if (parent === undefined) {
            return false;
        }
        if ((parent.kind === SyntaxKind.PropertyAccessExpression || parent.kind === SyntaxKind.PropertyAssignment)
            && parent.name === node) {
            return true; // a member name, not a use of the local
        }
        if ((parent.kind === SyntaxKind.VariableDeclaration || parent.kind === SyntaxKind.Parameter
            || parent.kind === SyntaxKind.BindingElement) && parent.name === node) {
            // a second binding of the same source name: only a disjoint sibling block may
            // keep its own type (no shadowing of the narrowed declaration)
            return this.javaBindingsAreDisjoint(declaration, parent);
        }
        if (parent.kind === SyntaxKind.PostfixUnaryExpression || parent.kind === SyntaxKind.PrefixUnaryExpression) {
            return false; // ++/--/-x/+x print an unboxing or primitive operator
        }
        if (parent.kind === SyntaxKind.SpreadElement || parent.kind === SyntaxKind.DeleteExpression
            || parent.kind === SyntaxKind.ForOfStatement || parent.kind === SyntaxKind.ForInStatement) {
            return false;
        }
        if (parent.kind === SyntaxKind.TypeOfExpression) {
            // prints \`x instanceof String\`, the same test the Object declaration printed
            return javaType === 'String';
        }
        if (parent.kind === SyntaxKind.AsExpression || parent.kind === SyntaxKind.TypeAssertionExpression) {
            // \`x as string\` prints the identity ((String) x); any other asserted type
            // prints a cast the narrower declaration cannot satisfy
            return javaType === 'String' && parent.type?.kind === SyntaxKind.StringKeyword;
        }
        if (parent.kind === SyntaxKind.ConditionalExpression) {
            // a numeric arm next to a numeric arm makes the conditional numeric and javac
            // unboxes it (an NPE where the Object declaration carried null)
            return javaType === 'String';
        }
        if (parent.kind === SyntaxKind.ElementAccessExpression && parent.expression === node) {
            const grand = parent.parent;
            if (grand?.kind === SyntaxKind.DeleteExpression) {
                return false;
            }
            if (grand?.kind === SyntaxKind.BinaryExpression && grand.left === parent
                && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(grand.operatorToken.kind)) {
                return false; // `x[k] = v` prints a receiver cast the box cannot satisfy
            }
        }
        if (parent.kind === SyntaxKind.ArrayLiteralExpression) {
            const grand = parent.parent;
            if (grand?.kind === SyntaxKind.BinaryExpression && grand.left === parent
                && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(grand.operatorToken.kind)) {
                return false; // `[x, y] = f()` prints a destructuring write into the local
            }
        }
        if (parent.kind === SyntaxKind.BinaryExpression && parent.left === node) {
            const op = parent.operatorToken.kind;
            if (op === SyntaxKind.EqualsToken) {
                return this.javaArithmeticWriteIsSafe(parent.right, javaType);
            }
            if (op === SyntaxKind.PlusEqualsToken) {
                // `x += y` prints a native `x = (x + y)` or the Object-typed helper
                return this.javaNativeArithmeticType(parent) === javaType;
            }
            if (JAVA_ASSIGNMENT_OPERATOR_KINDS.has(op)) {
                return false; // every other compound assignment writes a helper result
            }
            if (op === SyntaxKind.PlusToken && javaType === 'String') {
                // the overload trap: once the local is String, a printed Helpers.add(local, y)
                // binds add(String, Object) instead of add(Object, Object), and the two
                // diverge for a non-string y. A printed native concat has no helper call.
                return this.javaNativeArithmeticType(parent) === 'String';
            }
        }
        return true;
    }

    // D2: the narrowed declaration needs every later use of the local in the enclosing
    // function to still compile and resolve the way the Object declaration did
    javaArithmeticLocalIsSafeToType(scope, declaration, javaType) {
        if (scope === undefined) {
            return false;
        }
        const sourceName = declaration.name.text;
        let safe = true;
        const visit = (n) => {
            if (!safe) {
                return;
            }
            if (n.kind === SyntaxKind.Identifier && n.text === sourceName && n !== declaration.name) {
                if (!this.javaArithmeticLocalUseIsSafe(n, declaration, javaType)) {
                    safe = false;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return safe;
    }

    // the Java type a declaration can carry because its initializer prints as native
    // arithmetic, or undefined to keep the Object declaration
    javaArithmeticLocalType(declaration) {
        if (!isIdentifier(declaration.name) || declaration.initializer === undefined) {
            return undefined;
        }
        const javaType = this.javaNativeArithmeticType(declaration.initializer);
        if (javaType === undefined) {
            return undefined;
        }
        const scope = this.javaEnclosingFunction(declaration);
        return this.javaArithmeticLocalIsSafeToType(scope, declaration, javaType)
            ? javaType : undefined;
    }

    // an operand `(double) <text>` can be applied to without changing what Helpers.mod
    // computes: a numeric literal or a native arithmetic node (javaProvableNumericKind,
    // already printed as a java number) or a primitive int loop counter
    javaProvableNumericDoubleOperand(node) {
        return this.javaProvableNumericKind(node) !== undefined || this.javaProvableCounterInt(node);
    }

    getFinalVarName(varName: string): string {
        varName = this.getOriginalVarName(varName);
        if (varName.startsWith('final')) {
            return varName;
        }
        return `final${this.capitalize(varName)}`;
    }

    getOriginalVarName(name: string): string {
        if (this.ReservedKeywordsReplacements[name]) {
            name = this.ReservedKeywordsReplacements[name];
        }
        return name;
    }

    // Resolves the trio of names used to wrap a reassigned async-method param
    // so the lambda body sees an effectively-final local. We base every name on
    // the keyword-remapped Java identifier — using the raw TS name when remapped
    // (e.g. params -> parameters) makes the wrapper text and the body diverge,
    // because identifier emission already routes through ReservedKeywordsReplacements.
    private getAsyncParamWrapperNames(paramName: string): { sigName: string; snapName: string; localName: string } {
        const javaName = this.getOriginalVarName(paramName);
        return {
            sigName: `${javaName}2`,
            snapName: `${javaName}3`,
            localName: javaName,
        };
    }

    private isAssignmentOperator(op: SyntaxKind): boolean {
        return op >= SyntaxKind.FirstAssignment && op <= SyntaxKind.LastAssignment;
    }

    private isIncDecOperator(op: SyntaxKind): boolean {
        return op === SyntaxKind.PlusPlusToken || op === SyntaxKind.MinusMinusToken;
    }

    // Walk the function body in source order and assign a version-aware finalName to
    // every identifier that appears inside an object literal property and refers to a
    // variable that's reassigned anywhere in this function. Each reassignment bumps the
    // per-variable version counter; usages of the same (var, version) share one finalName.
    //
    // Naming:
    //   - If only one version of a var is ever used in object literals, use `final<Var>`
    //     (matches prior behavior).
    //   - If multiple versions are used, name them `final<Var>`, `final<Var>_2`,
    //     `final<Var>_3` in source-order of the version they correspond to.
    analyzeFinalVars(fnBody: Node): void {
        this.usageToFinalName = new WeakMap();
        if (!fnBody) return;

        // Symbol identity: two identifiers are the same lexical variable iff they
        // resolve to the same declaration. This differentiates e.g. `i` in two
        // sibling for-loops (separate `let i` declarations = separate symbols).
        const symbolIdOf = (n: any): string => {
            try {
                const checker = this.getChecker();
                const sym = checker?.getSymbolAtLocation?.(n);
                const decl = sym?.declarations?.[0]?.resolve() ?? sym?.valueDeclaration?.resolve();
                if (decl) return `s:${decl.pos}:${decl.end}`;
            } catch {
                // checker may be unavailable in some contexts — fall through to name-based id
            }
            return `n:${n.text}`;
        };

        // Pass 1 — discover which symbols the printer will treat as reassigned.
        //
        // The printer's `printCustomBinaryExpressionIfAny` sets
        // `ReassignedVars[varKey] = true` for the LEFT identifier of *every*
        // BinaryExpression — not just assignment operators. So `timestamp + '#'`
        // or `x === 5` will both flag `timestamp`/`x` later during emit, even
        // though they're plain reads syntactically. The printer's substitution
        // path then uses ReassignedVars as a fallback trigger for the finalXxx
        // rewrite, so a literal capturing such an identifier ends up referring
        // to `finalTimestamp` even when the analyzer thinks the symbol isn't
        // reassigned.
        //
        // If the analyzer disagrees with the printer here, the printer's
        // fallback substitution uses the un-suffixed base name for *every* use
        // (including in sibling if/else branches), and any environment with
        // ancestor-scope dedup leak will suppress one of the two declarations.
        //
        // Mirror the printer's over-broad heuristic in the analyzer so the
        // version-bump machinery (a5c2036 / ac618b0 / 48a1786) can assign
        // distinct names to sibling and post-block uses.
        const reassignedSyms = new Set<string>();
        const discoverPotentialReassignments = (node: any) => {
            if (!node) return;
            if (node.kind === SyntaxKind.BinaryExpression) {
                if (node.left?.kind === SyntaxKind.Identifier) {
                    // Mirror printCustomBinaryExpressionIfAny: any BinaryExpression
                    // with an Identifier left flags it, regardless of operator.
                    reassignedSyms.add(symbolIdOf(node.left));
                } else if (
                    node.operatorToken.kind === SyntaxKind.EqualsToken &&
                    node.left?.kind === SyntaxKind.ArrayLiteralExpression
                ) {
                    // Tuple destructuring assignment: `[a, b] = expr`. The printer's
                    // ArrayLiteralExpression branch in printCustomBinaryExpressionIfAny
                    // flags each Identifier element in ReassignedVars, so mirror it
                    // here for version-bump coverage.
                    for (const elem of node.left.elements ?? []) {
                        if (elem?.kind === SyntaxKind.Identifier) {
                            reassignedSyms.add(symbolIdOf(elem));
                        }
                    }
                }
            }
            if ((node.kind === SyntaxKind.PrefixUnaryExpression ||
                 node.kind === SyntaxKind.PostfixUnaryExpression) &&
                this.isIncDecOperator(node.operator) &&
                node.operand?.kind === SyntaxKind.Identifier) {
                reassignedSyms.add(symbolIdOf(node.operand));
            }
            // Cross-call / cross-method state leak: ReassignedVars accumulates
            // across transpile calls and earlier-printed methods in the same
            // class+method context, so a var declared `const` in this function
            // body may still be flagged from a prior context. The printer's
            // substitution path consults ReassignedVars as a fallback; if the
            // analyzer disagrees, version-bump can't apply and sibling if/else
            // branches end up with the same base name.
            if (node.kind === SyntaxKind.Identifier) {
                const name = node.text as string | undefined;
                if (name && name !== 'undefined' && !name.startsWith?.('null')) {
                    if (this.ReassignedVars[this.getVarKey(node)]) {
                        reassignedSyms.add(symbolIdOf(node));
                    }
                }
                return;
            }
            node.forEachChild(discoverPotentialReassignments);
        };
        discoverPotentialReassignments(fnBody);

        if (reassignedSyms.size === 0) return;

        // Pass 2 — walk in source order, producing a stream of reassignment and usage
        // events keyed by symbol. Usages are identifiers that (a) sit inside an
        // object literal property initializer expression, (b) refer to a reassigned symbol.
        type Event =
            | { kind: 'reassign'; sym: string }
            | { kind: 'use'; sym: string; name: string; node: Node };
        const events: Event[] = [];

        const visitExprInObjLit = (n: any) => {
            if (!n) return;
            if (n.kind === SyntaxKind.Identifier) {
                const name = n.text as string;
                if (name && name !== 'undefined' && !name.startsWith?.('null')) {
                    const sym = symbolIdOf(n);
                    if (reassignedSyms.has(sym)) {
                        events.push({ kind: 'use', sym, name, node: n });
                    }
                }
                return;
            }
            if (n.kind === SyntaxKind.BinaryExpression) {
                visitExprInObjLit(n.left);
                visitExprInObjLit(n.right);
                return;
            }
            if (n.kind === SyntaxKind.ParenthesizedExpression) {
                visitExprInObjLit(n.expression);
                return;
            }
            if (n.kind === SyntaxKind.ConditionalExpression) {
                visitExprInObjLit(n.condition);
                visitExprInObjLit(n.whenTrue);
                visitExprInObjLit(n.whenFalse);
                return;
            }
            if (n.kind === SyntaxKind.CallExpression) {
                n.arguments?.forEach(visitExprInObjLit);
                if (n.expression?.kind === SyntaxKind.PropertyAccessExpression) {
                    visitExprInObjLit(n.expression.expression);
                }
                return;
            }
            if (n.kind === SyntaxKind.PrefixUnaryExpression) {
                visitExprInObjLit(n.operand);
                return;
            }
            if (n.kind === SyntaxKind.ElementAccessExpression) {
                let left = n.expression;
                while (left?.kind === SyntaxKind.ElementAccessExpression) {
                    left = left.expression;
                }
                visitExprInObjLit(left);
                visitExprInObjLit(n.argumentExpression);
                return;
            }
            if (n.kind === SyntaxKind.ObjectLiteralExpression) {
                n.properties?.forEach((p: any) => {
                    if (p.initializer) visitExprInObjLit(p.initializer);
                });
                return;
            }
            // Fallback for any other expression kind (ArrayLiteralExpression,
            // SpreadElement, TemplateExpression, AsExpression, NonNullExpression,
            // PropertyAccessExpression, TypeAssertion, etc.) — descend uniformly
            // so identifiers nested inside `[rawHash]`, `{...x}`, `` `${x}` ``, and
            // so on are still tagged. ObjectLiteralExpression is handled above so
            // it doesn't fall through to the generic descent (which would re-walk
            // the same prop initializers and double-count).
            n.forEachChild(visitExprInObjLit);
        };

        const walk = (node: any) => {
            if (!node) return;

            if (node.kind === SyntaxKind.BinaryExpression &&
                this.isAssignmentOperator(node.operatorToken.kind)) {
                walk(node.right);
                if (node.left?.kind === SyntaxKind.Identifier) {
                    const sym = symbolIdOf(node.left);
                    if (reassignedSyms.has(sym)) {
                        events.push({ kind: 'reassign', sym });
                    }
                } else {
                    walk(node.left);
                }
                return;
            }

            if ((node.kind === SyntaxKind.PrefixUnaryExpression ||
                 node.kind === SyntaxKind.PostfixUnaryExpression) &&
                this.isIncDecOperator(node.operator) &&
                node.operand?.kind === SyntaxKind.Identifier) {
                const sym = symbolIdOf(node.operand);
                if (reassignedSyms.has(sym)) {
                    events.push({ kind: 'reassign', sym });
                }
                return;
            }

            if (node.kind === SyntaxKind.ObjectLiteralExpression) {
                node.properties?.forEach((prop: any) => {
                    if (prop.initializer) {
                        visitExprInObjLit(prop.initializer);
                        walk(prop.initializer);
                    }
                });
                return;
            }

            // If/else branches introduce sibling scopes for declarations inside
            // them. Without intervention, the analyzer assigns the same per-symbol
            // version to uses across siblings and to uses after the branch.
            // Java permits sibling-scope name reuse when the inner block has
            // popped, but ancestor-scope dedup in buildFinalVarDeclarations +
            // any scope tracking leak in the consumer environment can suppress
            // the outer declaration, leaving an undeclared reference.
            //
            // The helper below records 'use' events inside a sub-block and emits
            // a phantom reassign on exit for every symbol used inside, so each
            // region gets a distinct per-symbol version → distinct finalXxx name.
            const walkBlockAndBump = (subNode: Node | undefined): Set<string> => {
                const usedInBlock = new Set<string>();
                if (!subNode) return usedInBlock;
                const eventsBefore = events.length;
                walk(subNode);
                for (let i = eventsBefore; i < events.length; i++) {
                    const e = events[i];
                    if (e.kind === 'use') usedInBlock.add(e.sym);
                }
                for (const sym of usedInBlock) {
                    events.push({ kind: 'reassign', sym });
                }
                return usedInBlock;
            };

            if (node.kind === SyntaxKind.IfStatement) {
                walk(node.expression);
                walkBlockAndBump(node.thenStatement);
                walkBlockAndBump(node.elseStatement);
                // After walking either branch we've already bumped for every
                // symbol used inside it, so post-if uses naturally land on a
                // version higher than either branch's uses.
                return;
            }

            // try / catch / finally: catch is a sibling scope to try; finally
            // executes after both. Treat each block the same way as if/else
            // branches so captures across them get distinct snapshot names.
            if (node.kind === SyntaxKind.TryStatement) {
                walkBlockAndBump(node.tryBlock);
                walkBlockAndBump(node.catchClause?.block);
                walkBlockAndBump(node.finallyBlock);
                return;
            }

            node.forEachChild(walk);
        };

        walk(fnBody);

        // Post-process: compute per-symbol versions and assign final names. The
        // final name is derived from the identifier's text, not the symbol — so
        // two distinct symbols named `i` both get `finalI` (each lives in its own
        // lexical scope, so scope-stack dedup allows both to be emitted).
        const counters = new Map<string, number>();
        const perSym = new Map<string, { name: string; byVer: Map<number, Node[]> }>();
        for (const e of events) {
            if (e.kind === 'reassign') {
                counters.set(e.sym, (counters.get(e.sym) ?? 0) + 1);
            } else {
                const v = counters.get(e.sym) ?? 0;
                if (!perSym.has(e.sym)) perSym.set(e.sym, { name: e.name, byVer: new Map() });
                const entry = perSym.get(e.sym)!;
                if (!entry.byVer.has(v)) entry.byVer.set(v, []);
                entry.byVer.get(v)!.push(e.node);
            }
        }

        for (const { name, byVer } of perSym.values()) {
            const versions = [...byVer.keys()].sort((a, b) => a - b);
            const baseName = this.getFinalVarName(name);
            versions.forEach((v, idx) => {
                const finalName = idx === 0 ? baseName : `${baseName}_${idx + 1}`;
                for (const n of byVer.get(v)!) {
                    this.usageToFinalName.set(n, finalName);
                }
            });
        }
    }

    // Undo every in-place identifier rewrite made during the current emit, newest
    // first so repeated rewrites of one node unwind to the original value.
    restoreFinalVarMutations(): void {
        for (let i = this.finalVarMutations.length - 1; i >= 0; i--) {
            const mutation = this.finalVarMutations[i];
            Object.defineProperty(mutation.node, 'text', { value: mutation.text, configurable: true, writable: true });
            if (mutation.ownGetFullText) {
                mutation.node.getFullText = mutation.getFullText;
            } else {
                delete mutation.node.getFullText;
            }
        }
        this.finalVarMutations = [];
    }

    printNode(node, identation = 0): string {
        if (node && node.kind === SyntaxKind.SourceFile) {
            // Everything below influences emitted text and outlives a single
            // transpile call (the transpiler instance and the parsed SourceFile are
            // both reused), so reset it per file: an emit must not be able to tell
            // whether it is the first or the tenth for the same input.
            this.restoreFinalVarMutations();
            this.ReassignedVars = {};
            this.varListFromObjectLiterals = {};
            this.usageToFinalName = new WeakMap();
            this.finalVarScopeStack = [];
            try {
                return super.printNode(node, identation);
            } finally {
                this.restoreFinalVarMutations();
            }
        }
        return super.printNode(node, identation);
    }

    // true when a property value reads a local the body reassigns (or the analyzer saw
    // reassigned ahead): a double-brace anonymous class could not capture it
    objectLiteralCapturesReassigned(node): boolean {
        return this.objectLiteralCapturedKeys(node).length > 0;
    }

    // ReassignedVars keys of the reassigned locals a literal's property values read
    objectLiteralCapturedKeys(node): string[] {
        const keys: string[] = [];
        const walk = (n) => {
            if (!n) return;
            if (n.kind === SyntaxKind.Identifier) {
                const name = n.text as string | undefined;
                const key = this.getVarKey(n);
                if (name && name !== 'undefined' && !name.startsWith('null') &&
                    (this.usageToFinalName.has(n) || this.ReassignedVars[key])) {
                    keys.push(key);
                }
                return;
            }
            n.forEachChild(walk);
        };
        for (const prop of node.properties) {
            walk(prop.initializer);
        }
        return keys;
    }

    printVariableDeclarationList(node, identation) {
        const declaration = node.declarations[0];

        if (
            this.removeVariableDeclarationForFunctionExpression &&
            declaration?.initializer &&
            isFunctionExpression(declaration.initializer)
        ) {
            return this.printNode(declaration.initializer, identation).trimEnd();
        }

        // array destructuring in variable declaration
        if (declaration?.name.kind === SyntaxKind.ArrayBindingPattern) {
            const arrayBindingPattern = declaration.name;
            const arrayBindingPatternElements = arrayBindingPattern.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) =>
                this.printNode(e.name, 0)
            );
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            const arrayBindingStatement =
                `${this.getIden(identation)}var ${syntheticName} = ${this.printNode(
                    declaration.initializer,
                    0
                )};\n`;

            return arrayBindingStatement + parsedArrayBindingElements.map((e, index) => {
                // a slot whose tuple element type is a json box that is only element-accessed
                const boxType = this.javaCheckedBoxLocalTypeCached(arrayBindingPatternElements[index]);
                if (boxType !== undefined) {
                    return this.getIden(identation) + `${boxType} ${e} = (${boxType}) ((java.util.List<Object>) ${syntheticName}).get(${index})`;
                }
                return this.getIden(identation) + `var ${e} = ((java.util.List<Object>) ${syntheticName}).get(${index})`;
            }).join(";\n");
        }

        const isNew =
            declaration?.initializer &&
            declaration.initializer.kind === SyntaxKind.NewExpression;
        let varToken = isNew ? "var " : this.VAR_TOKEN + " ";
        if (!isNew) {
            // a native-arithmetic initializer prints a String/Long/Double value: the
            // declaration can name that type instead of Object (D3, scanned by java-31)
            const arithmeticType = this.javaArithmeticLocalType(declaration);
            if (arithmeticType !== undefined) {
                varToken = arithmeticType + " ";
            } else {
                // a local fed a fresh plain map prints that map type, so its element writes bind
                // the native put instead of casting the Object box at the site (hx10w6 J04)
                const elementWriteType = this.javaElementWriteMapLocalType(declaration);
                if (elementWriteType !== undefined) {
                    varToken = elementWriteType + " ";
                }
                // a local bound to a base field the hand-written Java declares a plain
                // Map<String, Object> prints that type, so its element reads bind the accessor
                const baseFieldType = this.javaBaseMapFieldLocalType(declaration);
                if (baseFieldType !== undefined) {
                    varToken = baseFieldType + " ";
                }
            }
            // RF-java-2: Object.values() is an array and the helper returns a fresh non-null List<Object>
            const valuesType = this.javaObjectValuesLocalType(declaration);
            if (valuesType !== undefined) {
                varToken = valuesType + " ";
            }
            const wsClientType = this.javaWsClientLocalType(declaration);
            if (wsClientType !== undefined) {
                varToken = wsClientType + " ";
            }
            // `const subs = client.subscriptions`: the local holds the field's own Map type
            const wsClientAliasType = this.javaWsClientAliasLocalType(declaration);
            if (wsClientAliasType !== undefined) {
                varToken = wsClientAliasType + " ";
            }
            // the ws handler table and the local bound to one of its reads name their type,
            // so the dispatch is a plain virtual call
            const handlerType = this.javaHandlerDeclarationType(declaration);
            if (handlerType !== undefined) {
                varToken = handlerType + " ";
            }
        }

        // handle `let x;`
        if (!declaration.initializer) {
            return (
                this.getIden(identation) +
                "Object " +
                this.printNode(declaration.name) +
                " = " +
                this.UNDEFINED_TOKEN
            );
        }

        const parsedValue = this.printNode(declaration.initializer, identation).trimStart();
        if (parsedValue === this.UNDEFINED_TOKEN) {
            let specificVarToken = "Object";
            if (this.INFER_VAR_TYPE) {
                const variableType = this.getChecker().typeToString(
                    this.getChecker().getTypeAtLocation(declaration)
                );
                if (this.VariableTypeReplacements[variableType]) {
                    specificVarToken = this.VariableTypeReplacements[variableType];
                }
            }
            return (
                this.getIden(identation) +
                specificVarToken +
                " " +
                this.printNode(declaration.name) +
                " = " +
                parsedValue
            );
        }
        // `const x = await this.m(..)` whose awaited TS type is a json box that is only element-accessed:
        // the erased `.join()` is cast to the box, so the reads and writes on x print natively
        const awaitedBox = !isNew && declaration.initializer.kind === SyntaxKind.AwaitExpression
            ? this.javaCheckedBoxLocalTypeCached(declaration) : undefined;
        if (awaitedBox !== undefined) {
            return this.getIden(identation) + awaitedBox + " " + this.printNode(declaration.name) + " = (" + awaitedBox + ") " + parsedValue;
        }
        return (
            this.getIden(identation) +
            varToken +
            this.printNode(declaration.name) +
            " = " +
            parsedValue
        );
    }

    printThisKeyword(node, identation) {

        let current = node?.parent;
        while (current) {
            if (current.kind === SyntaxKind.PropertyAssignment &&
                !this.builderObjectLiterals.has(current.parent)) {
                const className = this.currentClassName;
                return `${this.capitalize(className)}.this`;
            }
            current = current?.parent;
        }
        // if this.x() is inside a object a object literal and we need to add the class name
        return this.THIS_TOKEN;
    }

    transformPropertyAcessExpressionIfNeeded(node) {
        const expression = node.expression;

        const leftSide = this.printNode(expression, 0);
        const rightSide = node.name.text;

        let rawExpression = undefined;

        switch (rightSide) {
        case "length": {
            const type = (this.getChecker() as Checker).getTypeAtLocation(
                expression
            );
            this.warnIfAnyType(node, (type as any).flags, leftSide, "length");
            rawExpression = this.printJavaLength(expression, leftSide);
            break;
        }
        case "push":
            rawExpression = `((java.util.List<Object>)${leftSide}).add`;
            break;
        }
        return rawExpression;
    }

    printCustomDefaultValueIfNeeded(node) {
        if (
            isArrayLiteralExpression(node) ||
            isObjectLiteralExpression(node) ||
            isStringLiteral(node) ||
            isBooleanLiteral(node) ||
            isNumericLiteral(node)
        ) {
            return this.UNDEFINED_TOKEN;
        }

        if (
            node?.text === "undefined" &&
            this.getChecker().getTypeAtLocation(node?.parent)?.flags ===
            TypeFlags.Number
        ) {
            return this.UNDEFINED_TOKEN;
        }

        return undefined;
    }

    // Unpacks one optional parameter. Native array access replaces Helpers.getArg
    // when the initializer is a pure literal; the null check keeps the helper's
    // contract that a null varargs array reads like an empty one.
    // The expression half is shared with the untyped front, which passes the same value to the
    // typed core as an argument instead of binding a local.
    printOptionalArgExpression(index, initializer) {
        const defaultValue = this.printNode(initializer, 0);
        if (!this.isPureInitializer(initializer)) {
            return `Helpers.getArg(optionalArgs, ${index}, ${defaultValue})`;
        }
        return `optionalArgs != null && optionalArgs.length > ${index} ? optionalArgs[${index}] : ${defaultValue}`;
    }

    printOptionalArgInit(paramName, index, initializer) {
        return `Object ${paramName} = ${this.printOptionalArgExpression(index, initializer)};`;
    }

    // Pure = evaluating the initializer has no effect and cannot throw, so
    // skipping it when the argument was supplied cannot change behavior.
    isPureInitializer(node) {
        switch (node?.kind) {
        case SyntaxKind.NullKeyword:
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NoSubstitutionTemplateLiteral:
        case SyntaxKind.NumericLiteral:
            return true;
        case SyntaxKind.Identifier:
            // `= undefined` prints as null; any other name could be a call result
            return node.text === 'undefined';
        case SyntaxKind.ArrayLiteralExpression:
            return node.elements.every((element) => this.isPureInitializer(element));
        case SyntaxKind.ObjectLiteralExpression:
            return node.properties.every((property) => isPropertyAssignment(property) && this.isPureInitializer(property.initializer));
        case SyntaxKind.ParenthesizedExpression:
        case SyntaxKind.AsExpression:
        case SyntaxKind.TypeAssertionExpression:
        case SyntaxKind.NonNullExpression:
            return this.isPureInitializer(node.expression);
        default:
            return false;
        }
    }

    // a literal-defaulted parameter is read as `Objects.requireNonNullElse(x, <default>)`: a dynamic
    // caller pads omitted slots with null, and the parameter stays final with no local copy
    javaDefaultedLocalNames: Map<any, string> = new Map();

    javaDefaultedParameterLocals(node): string[] {
        if (node.body === undefined) {
            return [];
        }
        const types = this.javaCoreParameterTypes(node);
        node.parameters.forEach((param, i) => {
            if (!this.javaIsLiteralDefault(param.initializer) || !isIdentifier(param.name)) {
                return;
            }
            const symbol = this.javaSymbolOf(param.name);
            if (symbol === undefined) {
                return;
            }
            const name = this.printNode(param.name, 0);
            const value = this.javaCoreDefaultArgument(param, types[i]);
            this.javaDefaultedLocalNames.set(symbol, `java.util.Objects.requireNonNullElse(${name}, ${value})`);
        });
        return [];
    }

    // a string, number or boolean literal default (null, `undefined` and `{}` / `[]` keep the parameter)
    javaIsLiteralDefault(initializer): boolean {
        let node = initializer;
        while (node !== undefined && (isParenthesizedExpression(node) || isAsExpression(node))) {
            node = node.expression;
        }
        if (node !== undefined && isPrefixUnaryExpression(node) && node.operator === SyntaxKind.MinusToken) {
            node = node.operand;
        }
        return node !== undefined && (isStringLiteralLikeNode(node) || isNumericLiteral(node)
            || node.kind === SyntaxKind.TrueKeyword || node.kind === SyntaxKind.FalseKeyword);
    }

    javaDefaultedLocalName(node): string | undefined {
        if (this.javaDefaultedLocalNames.size === 0 || isParameterDeclaration(node.parent)
            || (isPropertyAccessExpression(node.parent) && node.parent.name === node)
            || isPropertyAssignment(node.parent) && node.parent.name === node) {
            return undefined;
        }
        let symbol;
        try {
            symbol = this.getChecker().getSymbolAtLocation(node);
        } catch (e) {
            return undefined;
        }
        return symbol === undefined ? undefined : this.javaDefaultedLocalNames.get(symbol);
    }

    printFunctionBody(node, identation) {
        // Save/restore rather than clobber: a nested function re-enters this method
        // and must not destroy the enclosing body's analysis state on the way out.
        const savedVarList = this.varListFromObjectLiterals;
        const savedUsageToFinalName = this.usageToFinalName;
        const savedScopeStack = this.finalVarScopeStack;
        this.varListFromObjectLiterals = {};
        this.analyzeFinalVars(node.body);
        this.finalVarScopeStack = [new Set<string>()];
        const funcParams = node.parameters ?? [];
        const bodyStatements = node.body.statements;
        const isAsync = this.isAsyncFunction(node);
        // a method's default-valued parameters are parameters of its typed signature: no unpack locals
        const splitCore = isMethodDeclaration(node);
        const initParams = splitCore ? this.javaDefaultedParameterLocals(node) : [];
        const processedParts = [];
        try {
            processedParts.push(...this.javaPrintBodyStatements(bodyStatements, identation + 1));
        } finally {
            this.varListFromObjectLiterals = savedVarList;
            this.usageToFinalName = savedUsageToFinalName;
            this.finalVarScopeStack = savedScopeStack;
        }
        let firstStatement = processedParts[0] || '';
        const remainingString = processedParts.slice(1).join("\n");
        let offSetIndex = 0;
        funcParams.forEach((param, i) => {
            const initializer = param.initializer;
            if (initializer) {
                if (splitCore) {
                    if (!this.isPureInitializer(initializer) && !this.javaDefaultedLocalNames.has(this.javaSymbolOf(param.name))) {
                        const name = this.printNode(param.name, 0);
                        initParams.push(`if (${name} == null) { ${name} = ${this.printNode(initializer, 0)}; }`);
                    }
                    return; // the value arrives as a parameter of the typed signature
                }
                const index = i + offSetIndex;
                // index = index < 0 ? 0 : i - 1;
                const paramName = this.printNode(param.name, 0);
                initParams.push(this.printOptionalArgInit(paramName, index, initializer));
            } else {
                offSetIndex--;
            }
        });

        if (initParams.length > 0) {
            const defaultInitializers =
                    initParams.map((l) => this.getIden(identation + 1) + l).join("\n") +
                    "\n";
            const bodyParts = firstStatement.split("\n");
            const commentPart = bodyParts.filter((line) => this.isComment(line));
            const isComment = commentPart.length > 0;
            if (isComment) {
                const commentPartString = commentPart
                    .map((c) => this.getIden(identation + 1) + c.trim())
                    .join("\n");
                const firstStmNoComment = bodyParts
                    .filter((line) => !this.isComment(line))
                    .join("\n");
                firstStatement =
                        commentPartString + "\n" + defaultInitializers + firstStmNoComment;
            } else {
                firstStatement = defaultInitializers + firstStatement;
            }
        }
        const blockOpen = this.getBlockOpen(identation);
        const blockClose = this.getBlockClose(identation);
        firstStatement = remainingString.length > 0 ? firstStatement + "\n" : firstStatement;

        if (isAsync && isMethodDeclaration(node) && this.javaReassignsParameter(node)) {
            // unsupported: a lambda cannot capture a reassigned parameter; the TS source must not reassign it
            const where = `${node.getSourceFile().fileName}:${(node.name as any).text}`;
            this.javaReassigningMethods.push(where);
            const message = `[Java] async method reassigns a parameter (not effectively final, the TS source must use a new local): ${where}`;
            if (this.javaStrictEffectivelyFinal) {
                throw new Error(message);
            }
            Logger.warning(message);
        }
        if (isAsync) {
            const finalWrapperVars = isMethodDeclaration(node) ? '\n' : this.printFinalOutsideMethodVariableWrappersIfAny(node, identation) + "\n";
            const insideWrappers = isMethodDeclaration(node) ? '\n' : this.printInsideMethodVariableWrappersIfAny(node, identation + 1) + "\n";
            const body = (firstStatement + remainingString).split("\n").map(line => this.getIden(identation) + line).join("\n");
            // Check if last statement is a return — if not, add return null for supplyAsync lambda
            const failedFuture = bodyStatements.length === 1 && insideWrappers.trim() === '' ? this.javaFailedFutureOfThrow(bodyStatements[0], identation + 1) : undefined;
            if (failedFuture !== undefined) {
                return blockOpen + finalWrapperVars + failedFuture + blockClose;
            }
            const lastStatement = bodyStatements.length > 1 ? bodyStatements[bodyStatements.length - 1] : (bodyStatements.length > 0 ? bodyStatements[0] : undefined);
            const lastStmtIsReturn = lastStatement && (isReturnStatement(lastStatement) || this.allBranchesTerminate(lastStatement));
            const returnNull = lastStmtIsReturn ? "" : (this.getIden(identation + 2) + "return null;\n");
            const supplier = this.asyncSupplier || "java.util.concurrent.CompletableFuture.supplyAsync";
            const executorArg = (!this.asyncSupplier && this.asyncExecutor) ? `, ${this.asyncExecutor}` : "";
            const asyncBody = this.getIden(identation + 1) + `return ${supplier}(() -> {\n` +
                    insideWrappers +
                    body + "\n" +
                    returnNull +
                    this.getIden(identation + 1) + `}${executorArg});\n`;
            return blockOpen + finalWrapperVars + asyncBody + blockClose;

        }
        return blockOpen + firstStatement + remainingString + blockClose;
    }

    // An async body that is only `throw new X(..)` can complete its future exceptionally and
    // nothing else, so the native completion API stands in for the supplier lambda.
    javaFailedFutureOfThrow(statement: Node, identation: number): string | undefined {
        if (!isThrowStatement(statement) || statement.expression.kind !== SyntaxKind.NewExpression) {
            return undefined;
        }
        const thrown = (statement.expression as any).expression;
        if (thrown === undefined || !isIdentifier(thrown)) {
            return undefined;
        }
        const printed = this.printNode(statement, 0).trim();
        const head = `${this.THROW_TOKEN} ${this.NEW_TOKEN} `;
        if (!printed.startsWith(head)) {
            return undefined;
        }
        const value = printed.slice(this.THROW_TOKEN.length + 1).replace(/;\s*$/, "").trim();
        return this.getIden(identation) + `return java.util.concurrent.CompletableFuture.failedFuture(${value});\n`;
    }

    printBlock(node, identation, chainBlock = false) {
        // Track per-block scope for final var dedup: same final name must not be
        // declared twice in a single block (Java would error), but may shadow
        // across nested blocks. We push an empty scope on entry and pop on exit.
        const managed = this.finalVarScopeStack.length > 0;
        if (managed) this.finalVarScopeStack.push(new Set<string>());
        try {
            if (this.javaCounterPlan(node.statements, identation + 1) !== undefined) {
                const body = this.javaPrintBodyStatements(node.statements, identation + 1).join("\n");
                return this.getBlockOpen(identation) + body + this.getBlockClose(identation, chainBlock);
            }
            return super.printBlock(node, identation, chainBlock);
        } finally {
            if (managed) this.finalVarScopeStack.pop();
        }
    }

    printInstanceOfExpression(node, identation) {
        // const left = node.left.escapedText;
        const right = node.right.text;
        const left = this.printNode(node.left, 0);
        // const right = this.printNode(node.right, 0);
        return this.getIden(identation) + `Helpers.isInstance(${left}, ${right}.class)`;
    }

    printAwaitExpression(node, identation) {
        const expression = this.printNode(node.expression, identation);
        return `(${expression}).join()`;
    }

    printAsExpression(node, identation) {
        const type = node.type;

        if (type.kind === SyntaxKind.AnyKeyword) {
            return `((${this.VariableTypeReplacements['object']})${this.printNode(
                node.expression,
                identation
            )})`;
        }

        if (type.kind === SyntaxKind.StringKeyword) {
            return `((String)${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === SyntaxKind.ArrayType) {
            const element = type.elementType.kind === SyntaxKind.AnyKeyword ? 'Object'
                : type.elementType.kind === SyntaxKind.StringKeyword ? 'String' : undefined;
            if (element !== undefined) {
                return `(java.util.List<${element}>)(${this.printNode(node.expression, identation)})`;
            }
        }

        return this.printNode(node.expression, identation);
    }

    // every Java parameter is `Object` (base printParameterType), except the ones whose TS
    // annotation names a native-carriable alias (javaNativeParameterType)
    printParameterType(node) {
        const native = this.javaNativeParameterType(node);
        if (native !== undefined) {
            return native;
        }
        return super.printParameterType(node);
    }

    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        const initializer = node.initializer;

        const type = this.printParameterType(node) || "";

        if (defaultValue) {
            if (initializer) {
                const def = this.printCustomDefaultValueIfNeeded(initializer) || this.printNode(initializer, 0);
                return type + " " + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + def;
            }
            return type + " " + name;
        }
        return name;
    }

    // the typed core signature: every parameter prints its Java type, the default-valued ones
    // included (a Java signature cannot carry a default - the front supplies it)
    printCoreMethodParameters(node) {
        return node.parameters.map(param => (param.initializer !== undefined
            ? `${this.javaOptionalParameterJavaType(param)} ${this.printNode(param.name, 0)}`
            : this.printParameter(param))).join(", ");
    }

    // an async method's reassigned parameter prints under sigName (post keyword-remap),
    // freeing the original name for the lambda body to bind
    javaAsyncSignatureParameter(param, isAsyncMethod, printedParam) {
        if (isAsyncMethod && this.ReassignedVars[this.getVarKey(param)]) {
            const { localName, sigName } = this.getAsyncParamWrapperNames(param.name.text);
            return printedParam.replace(localName, sigName);
        }
        return printedParam;
    }

    // the async method body writes one of its parameters, or a non-pure default must be applied
    // by an `if (x == null) { x = init; }` inside the lambda (both break effective finality)
    javaReassignsParameter(node): boolean {
        const params = node.parameters ?? [];
        if (params.some((p) => p.initializer !== undefined && !this.isPureInitializer(p.initializer) && this.isAsyncFunction(node))) {
            return true;
        }
        const symbols = new Set<any>();
        params.forEach((p) => {
            const symbol = this.javaSymbolOf(p.name);
            if (symbol !== undefined) {
                symbols.add(symbol);
            }
        });
        return symbols.size > 0 && node.body !== undefined && this.javaWritesSymbol(node.body, symbols);
    }

    javaSymbolOf(node): any | undefined {
        return this.getChecker().getSymbolAtLocation(node);
    }

    // syntactic walk: assignment targets, ++/--, destructuring targets and for-in/of expression heads
    javaWritesSymbol(node, symbols: Set<any>): boolean {
        if (isBinaryExpression(node)) {
            const op = node.operatorToken.kind;
            if (op >= SyntaxKind.FirstAssignment && op <= SyntaxKind.LastAssignment
                && this.javaTargetWritesSymbol(node.left, symbols, op === SyntaxKind.EqualsToken)) {
                return true;
            }
        } else if ((isPrefixUnaryExpression(node) || isPostfixUnaryExpression(node))
            && (node.operator === SyntaxKind.PlusPlusToken || node.operator === SyntaxKind.MinusMinusToken)
            && this.javaTargetWritesSymbol(node.operand, symbols, false)) {
            return true;
        } else if ((isForInStatement(node) || isForOfStatement(node))
            && !isVariableDeclarationList(node.initializer)
            && this.javaTargetWritesSymbol(node.initializer, symbols, true)) {
            return true;
        }
        return node.forEachChild((child) => this.javaWritesSymbol(child, symbols) || undefined) === true;
    }

    javaTargetWritesSymbol(target, symbols: Set<any>, destructuring: boolean): boolean {
        if (isParenthesizedExpression(target) || isNonNullExpression(target) || isAsExpression(target)) {
            return this.javaTargetWritesSymbol(target.expression, symbols, destructuring);
        }
        if (isIdentifier(target)) {
            const symbol = this.javaSymbolOf(target);
            return symbol !== undefined && symbols.has(symbol);
        }
        if (!destructuring) {
            return false;
        }
        if (isArrayLiteralExpression(target)) {
            return target.elements.some((e) => this.javaTargetWritesSymbol(isSpreadElement(e) ? e.expression : e, symbols, true));
        }
        if (isObjectLiteralExpression(target)) {
            return target.properties.some((p) => {
                if (isShorthandPropertyAssignment(p)) {
                    return this.javaTargetWritesSymbol(p.name, symbols, true);
                }
                if (isPropertyAssignment(p)) {
                    return this.javaTargetWritesSymbol(p.initializer, symbols, true);
                }
                return isSpreadAssignment(p) && this.javaTargetWritesSymbol(p.expression, symbols, true);
            });
        }
        if (isBinaryExpression(target) && target.operatorToken.kind === SyntaxKind.EqualsToken) {
            return this.javaTargetWritesSymbol(target.left, symbols, true); // `[x = 1] = ...` default
        }
        return false;
    }

    // `file:method` of every async method whose body reassigns a parameter (unsupported in Java lambdas)
    javaReassigningMethods: string[] = [];
    // the embedding build turns a reassigned async parameter into a hard transpile error
    javaStrictEffectivelyFinal = false;

    printMethodParameters(node) {
        const isAsyncMethod = this.isAsyncFunction(node);
        const params = node.parameters.map(param => this.javaAsyncSignatureParameter(param, isAsyncMethod, this.printParameter(param)));
        const hasOptionalParameter = node.parameters.some(p => p.initializer !== undefined || p.questionToken !== undefined);
        if (!hasOptionalParameter) {
            return params.join(", ");
        }
        const paramsWithOptional = params.filter(param => param.indexOf('=') === -1);
        paramsWithOptional.push('Object... optionalArgs');
        return paramsWithOptional.join(", ");
    }

    printArrayLiteralExpression(node) {
        // For Java: new ArrayList<>(Arrays.asList(elem1, elem2, ...))
        const elements = node.elements.map((e) => this.printNode(e)).join(", ");
        return `${this.ARRAY_OPENING_TOKEN}${elements}${this.ARRAY_CLOSING_TOKEN}`;
    }


    printFinalOutsideMethodVariableWrappersIfAny(node, identation) {
        return this.javaAsyncParamWrapperLines(node, identation, (param, isOptionalParam, { sigName, snapName }) => {
            // a default-valued parameter of the split core keeps its type in the
            // snapshot (`final Long since3 = since2;`); the body local stays `Object`
            const snapType = this.javaTestTierWrapperType(param) ?? ((isOptionalParam && param.initializer !== undefined)
                ? this.javaOptionalParameterJavaType(param) : 'Object');
            return `final ${snapType} ${snapName} = ${sigName};`;
        });
    }

    printInsideMethodVariableWrappersIfAny(node, identation) {
        return this.javaAsyncParamWrapperLines(node, identation, (param, _isOptionalParam, { localName, snapName }) =>
            `${this.javaTestTierWrapperType(param) ?? this.javaAsyncParameterLocalType(param) ?? 'Object'} ${localName} = ${snapName};`);
    }

    // one line per reassigned parameter of an async method (optional ones only in a split core)
    javaAsyncParamWrapperLines(node, identation, printLine) {
        const parameters = node?.parameters;
        const finalVarWrappers = [];
        if (parameters) {
            const isAsyncMethod = this.isAsyncFunction(node);
            const splitCore = this.hasDefaultedTail(node);
            parameters.forEach(param => {
                const isOptionalParam = param.initializer !== undefined || param.questionToken !== undefined;
                if ((!isOptionalParam || splitCore) && isAsyncMethod && this.ReassignedVars[this.getVarKey(param)]) {
                    const names = this.getAsyncParamWrapperNames(param.name.text);
                    finalVarWrappers.push(this.getIden(identation + 1) + printLine(param, isOptionalParam, names));
                }
            });
        }
        return finalVarWrappers.join("\n");
    }

    printMethodDeclaration(node, identation) {
        const funcBody = this.printFunctionBody(node, identation); // print body first to get var reassignments filled
        // one typed signature: default-valued and `?` parameters are ordinary typed parameters
        let methodDef = this.printMethodDefinition(node, identation, (n) => this.printCoreMethodParameters(n));
        methodDef += funcBody;
        methodDef += this.printOverrideBridges(node, identation);

        return methodDef;
    }

    printMethodDefinition(node, identation, paramsPrinter = undefined) {
        const name = this.transformMethodNameIfNeeded(node.name.text);

        let returnType = this.printFunctionType(node);

        // quick fix
        if (returnType === 'java.util.concurrent.CompletableFuture') {
            returnType = 'java.util.concurrent.CompletableFuture<Object>';
        }

        // D-09: an internal (non-override) generated method whose every return already
        // prints the native type carries it in its signature (see javaNativeReturnType).
        // Only the boxed default is replaced - void/Promise/plain-string stay as printed.
        if (returnType === this.DEFAULT_RETURN_TYPE) {
            const native = this.javaNativeReturnType(node);
            if (native !== undefined) {
                returnType = native;
            }
        }

        const modifiers = this.METHOD_DEFAULT_ACCESS ? this.METHOD_DEFAULT_ACCESS + " " : "";
        const parsedArgs = paramsPrinter ? paramsPrinter(node) : this.printMethodParameters(node);

        returnType = returnType ? returnType + " " : returnType;

        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
        const signature = this.getIden(identation) + modifiers + returnType + methodToken + name + "(" + parsedArgs + ")";

        return this.printNodeCommentsIfAny(node, identation, signature);
    }

    // `Array.isArray(x)` prints `(x instanceof java.util.List)`: false for null, true for a List, same
    // as the helper for every Java-object operand. The helper stays where the operand prints as a Java
    // array (rest parameter: `getClass().isArray()` branch) or a final class not convertible to List.
    printArrayIsArrayCall(node, _identation, parsedArg = undefined) {
        const native = this.printNativeArrayIsArray(node, parsedArg);
        return native === undefined ? `Helpers.isArray(${parsedArg})` : native;
    }

    printNativeArrayIsArray(node, parsedArg) {
        const operand: any = node?.arguments?.[0];
        if (operand === undefined || parsedArg === undefined) {
            return undefined;
        }
        // the whole call is the value of an expression statement: a bare `true;`/`false;` is
        // not a Java statement, so that position keeps the helper call
        if (node.parent !== undefined && isExpressionStatement(node.parent)) {
            return undefined;
        }
        // a side-effect-free array literal prints as a fresh ArrayList (never null), so the
        // answer is true without evaluating anything the helper would have to keep
        if (isArrayLiteralExpression(operand)) {
            return this.javaArrayLiteralDropsNothing(operand) ? 'true' : undefined;
        }
        if (!this.javaPrimaryIsArrayOperand(operand)) {
            return undefined;
        }
        const type = this.javaOperandType(operand);
        // a plain identifier of a type that can never hold a List: the helper answers false
        // for null/undefined and for every scalar, and the reference stays untouched
        if (operand.kind === SyntaxKind.Identifier && this.javaNonArrayType(type)) {
            return 'false';
        }
        if (this.isVarargsArrayReference(operand)) {
            return undefined;
        }
        if (this.javaScalarType(type)) {
            return undefined;
        }
        return `(${parsedArg} instanceof java.util.List)`;
    }

    // Operand shapes whose print is a primary expression: `instanceof` binds tighter than the
    // low-precedence operators, so a ternary/binary operand would re-parse, and a constructor
    // or cast print can be a final Java class on which `instanceof List` is not convertible.
    javaPrimaryIsArrayOperand(node): boolean {
        const kind = node.kind;
        return kind === SyntaxKind.Identifier
            || kind === SyntaxKind.PropertyAccessExpression
            || kind === SyntaxKind.ElementAccessExpression
            || kind === SyntaxKind.CallExpression;
    }

    javaOperandType(operand) {
        return this.checkerOrUndefined()?.getTypeAtLocation(operand);
    }

    // literals and identifiers have nothing an array-literal wrapper could skip by dropping
    javaArrayLiteralDropsNothing(node, depth = 0): boolean {
        if (depth > 4) {
            return false;
        }
        return node.elements.every((element) => isStringLiteral(element)
            || isNumericLiteral(element)
            || element.kind === SyntaxKind.TrueKeyword
            || element.kind === SyntaxKind.FalseKeyword
            || element.kind === SyntaxKind.NullKeyword
            || element.kind === SyntaxKind.Identifier
            || (isArrayLiteralExpression(element) && this.javaArrayLiteralDropsNothing(element, depth + 1)));
    }

    // types whose Java print is a scalar final class (`instanceof java.util.List` is not
    // convertible on them): the scalar family, and unions made only of scalars/nulls
    javaScalarType(type): boolean {
        return this.javaTypeFlagsOnly(type, JAVA_SCALAR_TYPE_FLAGS);
    }

    // types that provably never hold a List: every scalar (Java String/Long/Double/Boolean
    // answer false) and the nullish types (JS Array.isArray(null) is false)
    javaNonArrayType(type): boolean {
        return this.javaTypeFlagsOnly(type, JAVA_SCALAR_TYPE_FLAGS | JAVA_NULLISH_TYPE_FLAGS);
    }

    // the type, or every member of its (nested) union, carries one of the mask's flags
    javaTypeFlagsOnly(type, mask: number, depth = 0): boolean {
        if (type === undefined || type === null || depth > 3) {
            return false;
        }
        const flags: any = type.flags;
        if (flags & TypeFlags.Union) {
            const parts: any[] = type.getTypes?.() ?? [];
            return parts.length > 0 && parts.every((part) => this.javaTypeFlagsOnly(part, mask, depth + 1));
        }
        return (flags & mask) !== 0;
    }

    // A checker-proven dict prints a Map on every path, so the key copy is native;
    // every other target keeps the helper — shared field maps need its synchronized
    // snapshot, the rest need its instanceof/null fallbacks.
    printObjectKeysCall(node, _identation, parsedArg = undefined) {
        return this.printNativeObjectKeysCall(node) ?? `Helpers.objectKeys(${parsedArg})`;
    }

    printNativeObjectKeysCall(node) {
        const argument = node?.arguments?.[0];
        if (argument === undefined) {
            return undefined;
        }
        // a ws Client map is initialised and final: the key copy is the helper's map branch
        if (this.javaWsClientMapReceiver(argument)) {
            return `new java.util.ArrayList<Object>(${this.printNode(argument, 0)}.keySet())`;
        }
        if (isPropertyAccessExpression(argument)) {
            return this.printNativeBaseMapFieldKeys(argument);
        }
        // a local the pass declares a Map needs no checkcast: the key copy binds on the
        // declaration's own type, exactly the helper's synchronized map branch
        if (this.javaDeclaredMapReceiver(argument)) {
            return `new java.util.ArrayList<Object>(${this.printNode(argument, 0)}.keySet())`;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const type = checker.getTypeAtLocation(argument);
        if (!this.isJavaMapStructureType(type)) {
            return undefined;
        }
        return `new java.util.ArrayList<Object>(((java.util.Map<String, Object>)${this.printNode(argument, 0)}).keySet())`;
    }

    // `Object.keys(this.<f>)` where f is a BaseExchange field the hand-written Java declares
    // Map<String, Object>: the key copy of that Map, an empty list for the null the field may hold
    // (the helper's non-Map branch). Owner stores and every other receiver keep the helper.
    printNativeBaseMapFieldKeys(access) {
        if (access.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const name = String(access.name.text);
        if (!JAVA_DECLARED_MAP_FIELD_NAMES.has(name) || this.javaOwnerStoreFields.has(name)) {
            return undefined;
        }
        let file = '';
        try {
            const symbol = this.checkerOrUndefined()?.getSymbolAtLocation(access.name);
            file = symbol?.valueDeclaration?.resolve()?.getSourceFile?.()?.fileName ?? '';
        } catch (e) {
            return undefined;
        }
        if (!/(^|[\\/])ts[\\/]src[\\/]base[\\/]Exchange(\.nooverloads\.\d+)?\.ts$/.test(file)) {
            return undefined;
        }
        const receiver = this.printNode(access, 0);
        return `(${receiver} == null ? new java.util.ArrayList<Object>() : new java.util.ArrayList<Object>(${receiver}.keySet()))`;
    }

    printObjectValuesCall(node, _identation, parsedArg = undefined) {
        const wsArgument = node?.arguments?.[0];
        if (wsArgument !== undefined && this.javaWsClientMapReceiver(wsArgument)) {
            return `new java.util.ArrayList<Object>(${this.printNode(wsArgument, 0)}.values())`;
        }
        return this.printNativeObjectValuesCall(node) ?? `Helpers.objectValues(${parsedArg})`;
    }

    // `Object.values(m)` where m is a local the printer declares `Map<String, Object>` and nothing
    // else writes: the helper's only surviving branch is the `Map.values()` copy (a declared map is
    // never the null / non-map fallback), so the copy binds on the declaration's own type
    printNativeObjectValuesCall(node) {
        const argument = node?.arguments?.[0];
        if (argument === undefined || node.arguments.length !== 1 || !isIdentifier(argument)) {
            return undefined;
        }
        const declaration: any = this.javaDeclarationOfIdentifier(argument);
        if (declaration === undefined || !isVariableDeclaration(declaration) || !declaration.initializer
            || !this.javaDeclaredMapReceiver(argument) || this.javaLocalHasWriteAtAll(declaration.name)) {
            return undefined;
        }
        return `new java.util.ArrayList<Object>(${this.printNode(argument, 0)}.values())`;
    }

    printJsonParseCall(_node, _identation, parsedArg = undefined) {
        return `Helpers.parseJson(${parsedArg})`;
    }

    printJsonStringifyCall(_node, _identation, parsedArg = undefined) {
        return `Helpers.json(${parsedArg})`;
    }

    // `await Promise.all ([e1, ..., en])` with every element checker-typed `Promise<...>`:
    // CompletableFuture.allOf waits for exactly those, so Helpers.promiseAll's reflective loop adds
    // nothing. Result used -> thenApply collecting values, only for `const` locals (no double runs).
    printNativePromiseAllCall(node) {
        const awaitNode = node?.parent;
        if (awaitNode?.kind !== SyntaxKind.AwaitExpression) {
            return undefined;
        }
        const listNode = node.arguments?.[0];
        if (listNode?.kind !== SyntaxKind.ArrayLiteralExpression) {
            return undefined;
        }
        const elements = listNode.elements as unknown as Expression[];
        const checker = this.getChecker();
        for (const element of elements) {
            if (element.kind === SyntaxKind.SpreadElement
                    || !this.isPromiseType(checker.getTypeAtLocation(element))) {
                return undefined;
            }
        }
        const printed = elements.map((element) => this.printNode(element));
        const futureCast = `((${this.PROMISE_TYPE_KEYWORD}<?>) `;
        const casted = printed.map((element) => `${futureCast}${element})`);
        const allOf = `${this.PROMISE_TYPE_KEYWORD}.allOf(${casted.join(", ")})`;
        if (awaitNode.parent?.kind === SyntaxKind.ExpressionStatement) {
            return allOf;
        }
        if (elements.length === 0
                || !elements.every((element) => this.isConstBoundIdentifier(element))
                || printed.indexOf('promiseAllValue') !== -1) {
            return undefined;
        }
        const collected = casted.map((element) => `${element}.join()`).join(", ");
        const collectList = `${this.ARRAY_OPENING_TOKEN}${collected}${this.ARRAY_CLOSING_TOKEN}`;
        return `${allOf}.thenApply(promiseAllValue -> ${collectList})`;
    }

    // a `const`-bound local is assigned exactly once, so the printed java local is
    // effectively final (a lambda can capture it) and re-reading it joins the same future
    isConstBoundIdentifier(node) {
        if (node.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration?.resolve();
        return declaration?.kind === SyntaxKind.VariableDeclaration
            && (getCombinedNodeFlags(declaration) & NodeFlags.Const) === NodeFlags.Const;
    }

    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return this.printNativePromiseAllCall(node) ?? `Helpers.promiseAll(${parsedArg})`;
    }

    printMathFloorCall(node, _identation, parsedArg = undefined) {
        return `(Math.floor(Double.parseDouble(${this.javaStringBoxText(node?.arguments?.[0], parsedArg)})))`;
    }

    printMathRoundCall(node, _identation, parsedArg = undefined) {
        return `Math.round(Double.parseDouble(${this.javaStringBoxText(node?.arguments?.[0], parsedArg)}))`;
    }

    printMathCeilCall(node, _identation, parsedArg = undefined) {
        return `Math.ceil(Double.parseDouble(${this.javaStringBoxText(node?.arguments?.[0], parsedArg)}))`;
    }

    printNumberIsIntegerCall(_node, _identation, parsedArg = undefined) {
        return `((${parsedArg} instanceof Integer) || (${parsedArg} instanceof Long))`;
    }

    printArrayPushCall(_node, _identation, name = undefined, parsedArg = undefined) {
        return `((java.util.List<Object>)${name}).add(${parsedArg})`;
    }

    printIncludesCall(_node, _identation, name = undefined, parsedArg = undefined) {
        return `${name}.contains(${parsedArg})`;
    }

    // Helpers.getIndexOf(str, target) is List.indexOf for a List receiver, String.indexOf for a String
    // receiver with a String target, -1 otherwise. Locals are `Object`/`var`, so the native call takes
    // the same checkcast as `.length()` / `containsKey`; the target takes one unless a printed String.
    javaNativeIndexOfCall(node, name, parsedArg) {
        if (node === undefined || name === undefined || parsedArg === undefined) {
            return undefined;
        }
        const receiver = node?.expression?.expression;
        if (receiver === undefined) {
            return undefined;
        }
        const checker: any = this.getChecker();
        let receiverType: any;
        try {
            receiverType = checker.getTypeAtLocation(receiver);
        } catch (e) {
            return undefined;
        }
        // a rest parameter is a Java array, not a List: the helper's `instanceof List` test fails there
        // and so must the native call. The wildcard receiver cast is the `.length()` family's and accepts
        // a List of any element type (a `List<Object>` cast fails on a `List<String>`-static receiver).
        if (this.isJavaListType(receiverType) && !this.isVarargsArrayReference(receiver)) {
            return `((java.util.List<?>)${name}).indexOf(${parsedArg})`;
        }
        // plain `string` only: the nullable aliases (`Str`) and every union can hold
        // undefined, which the helper absorbs as -1 but String.indexOf has no receiver for
        if (receiverType.getAliasSymbol?.() !== undefined || !this.isStringType(receiverType.flags)) {
            return undefined;
        }
        const arg = node.arguments?.[0];
        if (arg === undefined) {
            return undefined;
        }
        if (this.javaProvableString(arg)) {
            return `((String)${name}).indexOf(${parsedArg})`;
        }
        let argType: any;
        try {
            argType = checker.getTypeAtLocation(arg);
        } catch (e) {
            return undefined;
        }
        // a bare identifier / field target the checker types as a plain string: the cast is
        // the printer's own startsWith/endsWith argument shape
        if (argType.getAliasSymbol?.() === undefined && this.isStringType(argType.flags)
            && (isIdentifier(arg) || isPropertyAccessExpression(arg))) {
            return `((String)${name}).indexOf(((String)${parsedArg}))`;
        }
        return undefined;
    }

    printIndexOfCall(node, _identation, name = undefined, parsedArg = undefined) {
        return this.javaNativeIndexOfCall(node, name, parsedArg) ?? this.javaHx4J06NarrowedIndexOf(node, name, parsedArg) ?? `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
    }

    printSearchCall(_node, _identation, name = undefined, parsedArg = undefined) {
        return `((String)${name}).indexOf(${parsedArg})`;
    }

    printStartsWithCall(_node, _identation, name = undefined, parsedArg = undefined) {
        return `((String)${name}).startsWith(((String)${parsedArg}))`;
    }

    printEndsWithCall(_node, _identation, name = undefined, parsedArg = undefined) {
        return `((String)${name}).endsWith(((String)${parsedArg}))`;
    }

    printTrimCall(_node, _identation, name = undefined) {
        return `((String)${name}).trim()`;
    }

    printJoinCall(_node, _identation, name = undefined, parsedArg = undefined) {
        // assumes List<String>
        return `String.join((String)${parsedArg}, (java.util.List<String>)${name})`;
    }

    printSplitCall(node, _identation, name = undefined, parsedArg = undefined) {
        return this.javaNativeSplitCall(node, name, parsedArg) ?? `Helpers.split(${name}, ${parsedArg})`;
    }

    printConcatCall(_node, _identation, name = undefined, parsedArg = undefined) {
        return `Helpers.concat(${name}, ${parsedArg})`;
    }

    printToFixedCall(_node, _identation, name = undefined, parsedArg = undefined) {
        return `toFixed(${name}, ${parsedArg})`;
    }

    printToStringCall(_node, _identation, name = undefined) {
        return `String.valueOf(${name})`;
    }

    printToUpperCaseCall(_node, _identation, name = undefined) {
        return `((String)${name}).toUpperCase()`;
    }

    printToLowerCaseCall(_node, _identation, name = undefined) {
        return `((String)${name}).toLowerCase()`;
    }

    printShiftCall(_node, _identation, name = undefined) {
        return `((java.util.List<Object>)${name}).get(0)`;
    }

    printReverseCall(_node, _identation, name = undefined) {
        return `java.util.Collections.reverse((java.util.List<Object>)${name})`;
    }

    printPopCall(_node, _identation, name = undefined) {
        return `((java.util.List<Object>)${name}).get(((java.util.List<Object>)${name}).size()-1)`;
    }

    printAssertCall(_node, _identation, parsedArgs) {
        return `assert(${parsedArgs})`;
    }

    printSliceCall(node, _identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        const nativeCall = this.nativeSliceCallIfProvable(node, name) ?? this.javaTypedStringSliceCall(node, name, parsedArg, parsedArg2, _identation);
        if (nativeCall !== undefined) {
            return nativeCall;
        }
        if (parsedArg2 === undefined) {
            parsedArg2 = "null";
        }
        return `Helpers.slice(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    // Integer value of a slice bound that is an integer literal (`18`, `-64`); anything else keeps
    // the helper — the Java helper converts bounds with toInt, and a double cannot be clamped with the
    // integer Math.min/Math.max of the native form.
    javaSliceLiteralBound(node) {
        if (node === undefined) {
            return undefined;
        }
        if (isNumericLiteral(node)) {
            const text = String(node.text);
            if (text.indexOf('.') !== -1 || text.indexOf('e') !== -1 || text.indexOf('E') !== -1) {
                return undefined;
            }
            const value = Number(text);
            return value <= 2147483647 ? value : undefined;
        }
        if (isPrefixUnaryExpression(node) && node.operator === SyntaxKind.MinusToken) {
            const inner = this.javaSliceLiteralBound(node.operand);
            return inner === undefined ? undefined : -inner;
        }
        return undefined;
    }

    // JS slice clamps a literal bound into [0, length]: a non-negative bound is min
    // (bound, length), a negative one counts from the end (max (length - |bound|, 0)).
    // `0` stays `0` because the length of a String/List is never negative.
    javaSliceBoundExpression(value, length) {
        if (value === 0) {
            return '0';
        }
        return value > 0 ? `Math.min(${value}, ${length})` : `Math.max(${length} - ${-value}, 0)`;
    }

    // `x.slice (a, b)` -> substring/subList when the receiver provably prints as String/List AND every
    // bound is an integer literal: Java throws where JS clamps, so only literal bounds can be clamped.
    // The null guard keeps null -> null and needs a side-effect-free receiver (read up to three times).
    nativeSliceCallIfProvable(node, name) {
        const args = node?.arguments ?? [];
        if (args.length < 1 || args.length > 2) {
            return undefined;
        }
        const start = this.javaSliceLiteralBound(args[0]);
        if (start === undefined) {
            return undefined;
        }
        const hasEnd = args.length === 2;
        const end = hasEnd ? this.javaSliceLiteralBound(args[1]) : undefined;
        if (hasEnd && end === undefined) {
            return undefined;
        }
        const receiverExpression = isPropertyAccessExpression(node?.expression) ? node.expression.expression : undefined;
        if (!this.sideEffectFreeReceiver(receiverExpression)) {
            return undefined;
        }
        let kind: string;
        try {
            const type = this.getChecker().getTypeAtLocation(receiverExpression);
            if (this.isStringType(type.flags)) {
                kind = 'String';
            } else if (this.isJavaListType(type) && !this.isVarargsArrayReference(receiverExpression)) {
                kind = 'List';
            } else {
                return undefined;
            }
        } catch (e) {
            return undefined;
        }
        const cast = kind === 'String' ? `((String)${name})` : `((java.util.List<Object>)${name})`;
        const length = kind === 'String' ? `${cast}.length()` : `${cast}.size()`;
        const startText = this.javaSliceBoundExpression(start, length);
        const endText = hasEnd ? this.javaSliceBoundExpression(end, length) : length;
        // from <= to is proven per case: 0 is never above a clamp, an open end is the
        // length, and two literals clamp monotonically once they keep their order
        // (non-negative, or both counting from the end with |start| >= |end|).
        const ordered = start === 0 || !hasEnd
            || (start >= 0 && end >= 0 && start <= end)
            || (start < 0 && end < 0 && start <= end);
        const fromText = ordered ? startText : `Math.min(${startText}, ${endText})`;
        // an inverted pair yields an empty slice in JS, so the substrings collapse to
        // substring (to, to); a one-argument String slice drops the end entirely
        const argumentsText = hasEnd || kind === 'List' ? `${fromText}, ${endText}` : fromText;
        const method = kind === 'String' ? 'substring' : 'subList';
        return `(${name} == null ? null : ${cast}.${method}(${argumentsText}))`;
    }

    printReplaceCall(_node, _identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `Helpers.replace((String)${name}, (String)${parsedArg}, (String)${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        // Native when both arguments are plain string literals and the pattern is non-empty: the
        // helper's null / empty-pattern guards cannot fire for them, and `String.replace` is the
        // literal all-occurrences replacement. The null guard on the receiver keeps the helper's
        // null -> null behaviour; it is only emitted for a side-effect-free receiver (identifier
        // or property access), so a double read cannot change semantics.
        const pattern = this.stringLiteralArgument(node?.arguments?.[0]);
        const replacement = this.stringLiteralArgument(node?.arguments?.[1]);
        const receiver = this.sideEffectFreeReceiver(node?.expression);
        if (pattern !== undefined && replacement !== undefined && receiver) {
            return `(${name} == null ? null : ((String)${name}).replace(${pattern}, ${replacement}))`;
        }
        const typed = this.javaTypedStringReplaceAllCall(node, name, parsedArg, parsedArg2);
        if (typed !== undefined) {
            return typed;
        }
        return `Helpers.replaceAll((String)${name}, (String)${parsedArg}, (String)${parsedArg2})`;
    }

    // ---- RF-java-1: typed String slice / replaceAll (folded from build/hx10w2-J04.js) ----
    // integral printed types only: the helper's toInt truncation has no native analogue for a double
    javaIntegralDeclaredTypes: Set<string> = new Set(['long', 'int', 'short', 'byte', 'Long', 'Integer', 'Short', 'Byte']);

    // the native slice reads a bound up to three times: a longer line would pass the 400-char audit
    javaTypedSliceMaxLength = 300;

    javaUnwrapParens(node) {
        let current = node;
        while (current !== undefined && isParenthesizedExpression(current)) {
            current = current.expression;
        }
        return current;
    }

    javaIsAtomOperand(node): boolean {
        const n = this.javaUnwrapParens(node);
        return n !== undefined && (n.kind === SyntaxKind.Identifier || n.kind === SyntaxKind.PropertyAccessExpression
            || n.kind === SyntaxKind.ThisKeyword || n.kind === SyntaxKind.NumericLiteral);
    }

    // the printed text of this operand may appear more than once in the native form
    javaIsRepeatableBound(node): boolean {
        const n = this.javaUnwrapParens(node);
        if (n === undefined) {
            return false;
        }
        switch (n.kind) {
        case SyntaxKind.Identifier:
        case SyntaxKind.PropertyAccessExpression:
        case SyntaxKind.ThisKeyword:
        case SyntaxKind.NumericLiteral:
            return true;
        case SyntaxKind.PrefixUnaryExpression:
            return n.operator === SyntaxKind.MinusToken && this.javaIsRepeatableBound(n.operand);
        case SyntaxKind.BinaryExpression: {
            const op = n.operatorToken.kind;
            return (op === SyntaxKind.PlusToken || op === SyntaxKind.MinusToken || op === SyntaxKind.AsteriskToken)
                && this.javaIsRepeatableBound(n.left) && this.javaIsRepeatableBound(n.right);
        }
        default:
            return false;
        }
    }

    // the operand prints as an integral Java number: `+ - Math.min Math.max` and `(int)` compile on it
    javaPrintsIntegralNumber(node): boolean {
        const n = this.javaUnwrapParens(node);
        if (n === undefined) {
            return false;
        }
        switch (n.kind) {
        case SyntaxKind.NumericLiteral:
            return !/[.eE]/.test(n.text);
        case SyntaxKind.PrefixUnaryExpression:
            return n.operator === SyntaxKind.MinusToken && this.javaPrintsIntegralNumber(n.operand);
        case SyntaxKind.PropertyAccessExpression:
            // `x.length` prints the primitive int of the native length read
            return n.name?.text === 'length' && this.javaScalarFamily(n) === 'number';
        case SyntaxKind.BinaryExpression: {
            const op = n.operatorToken.kind;
            return (op === SyntaxKind.PlusToken || op === SyntaxKind.MinusToken || op === SyntaxKind.AsteriskToken)
                && this.javaPrintsIntegralNumber(n.left) && this.javaPrintsIntegralNumber(n.right);
        }
        }
        if (n.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const type = this.javaDeclaredTypeOf(n);
        return type !== undefined && this.javaIntegralDeclaredTypes.has(type.replace(/^final\s+/, '').trim());
    }

    // a slice bound as the integer the helper's toInt answers: an integral print is its own text, a
    // boxed number (an `Object` from indexOf, a Double) takes the helper's own intValue truncation
    javaSliceBoundOperand(node, printed): { text: string } | undefined {
        if (this.javaPrintsIntegralNumber(node)) {
            return { text: this.javaIsAtomOperand(node) ? printed : `(${printed})` };
        }
        const n = this.javaUnwrapParens(node);
        if (n === undefined || n.kind !== SyntaxKind.Identifier || this.javaScalarFamily(n) !== 'number') {
            return undefined;
        }
        const type = this.javaDeclaredTypeOf(n);
        if (type === undefined || !['Object', 'Double', 'Float', 'Number'].includes(type.replace(/^final\s+/, '').trim())) {
            return undefined;
        }
        return { text: `((Number)${printed}).intValue()` };
    }

    // the receiver prints as a Java String: a plain TS `string`, a String-declared local, a literal
    javaPrintsAsString(node): boolean {
        if (node === undefined) {
            return false;
        }
        return this.javaScalarFamily(node) === 'string' || this.javaProvableString(node) || this.javaDeclaredStringType(node) === true;
    }

    // `x.slice (a, b)` -> String.substring when the receiver prints String and every bound prints a
    // number; non-literal bounds are clamped like the helper (negative counts from the end)
    javaTypedStringSliceCall(node, name, parsedArg, parsedArg2, identation): string | undefined {
        const callee = node?.expression;
        if (name === undefined || callee === undefined || !isPropertyAccessExpression(callee) || callee.name?.text !== 'slice') {
            return undefined;
        }
        const args = node.arguments ?? [];
        if (args.length < 1 || args.length > 2) {
            return undefined;
        }
        const receiver = callee.expression;
        // the null guard reads the receiver twice
        if (receiver === undefined || !this.sideEffectFreeReceiver(receiver) || !this.javaPrintsAsString(receiver)) {
            return undefined;
        }
        const printedBounds = [parsedArg, parsedArg2];
        const bounds: { text: string }[] = [];
        for (let i = 0; i < args.length; i++) {
            if (!this.javaIsRepeatableBound(args[i])) {
                return undefined;
            }
            const bound = this.javaSliceBoundOperand(args[i], printedBounds[i]);
            if (bound === undefined) {
                return undefined;
            }
            bounds.push(bound);
        }
        // a declared String receiver needs no checkcast for its own length
        const recv = this.javaDeclaredStringType(receiver) === true ? name : `((String)${name})`;
        const length = `${recv}.length()`;
        // JS slice: a negative start counts from the end and never lands below 0
        const startText = () => {
            const value = this.javaSliceLiteralBound(args[0]);
            if (value === 0) {
                return '0';
            }
            const t = bounds[0].text;
            if (value !== undefined && value > 0) {
                return `Math.min(${value}, ${length})`;
            }
            if (value !== undefined) {
                return `Math.max(${length} - ${-value}, 0)`;
            }
            return `Math.min(Math.max(${t} < 0 ? ${length} + ${t} : ${t}, 0), ${length})`;
        };
        // the end clamps to the length but, like the helper, may land below 0 (both forms then throw)
        const endText = () => {
            const value = this.javaSliceLiteralBound(args[1]);
            if (value !== undefined && value >= 0) {
                return `Math.min(${value}, ${length})`;
            }
            if (value !== undefined) {
                return `${length} - ${-value}`;
            }
            const t = bounds[1].text;
            return `Math.min(${t} < 0 ? ${length} + ${t} : ${t}, ${length})`;
        };
        const open = args.length === 1;
        const to = open ? length : endText();
        // a literal 0 start never exceeds a clamped end, so the pair needs no ordering min
        const from = open ? startText() : (this.javaSliceLiteralBound(args[0]) === 0 ? '0' : `Math.min(${startText()}, ${to})`);
        const cast = (text) => (text === '0' ? '0' : `(int) ${text}`);
        const full = open
            ? `(${name} == null ? null : ${recv}.substring(${cast(from)}))`
            : `(${name} == null ? null : ${recv}.substring(${cast(from)}, (int) ${to}))`;
        // an open-end form shares its line with the surrounding expression: keep it short
        const budget = open ? 200 : Math.max(220, 392 - identation * 4 - 50);
        return full.length > budget ? undefined : full;
    }

    // `x.replaceAll (literal, replacement)` -> String.replace for a plain-string replacement
    javaTypedStringReplaceAllCall(node, name, parsedArg, parsedArg2): string | undefined {
        const args = node?.arguments;
        if (name === undefined || args === undefined || args.length !== 2) {
            return undefined;
        }
        // the all-literal pair is printed natively above; a literal pattern is required here
        if (!isStringLiteral(args[0]) || args[0].text === '') {
            return undefined;
        }
        if (isStringLiteralLikeNode(args[1]) || this.javaScalarFamily(args[1]) !== 'string') {
            return undefined;
        }
        return `(String)${name}.replace(${parsedArg}, ${parsedArg2})`;
    }

    // Printed form of a non-empty string-literal argument with no escapes, or undefined when the
    // argument is not a literal, prints with an escape sequence, or is the empty pattern.
    stringLiteralArgument(argument) {
        if (argument === undefined || !isStringLiteral(argument)) {
            return undefined;
        }
        const printed = this.printNode(argument, 0);
        return /^"[^"\\]+"$/.test(printed) ? printed : undefined;
    }

    // True for receivers that read a value without calling anything: `x`, `x.y`, `this.x`,
    // `(x as string)` and parenthesised forms of those. Guards the double read of the ternary.
    sideEffectFreeReceiver(expression) {
        if (expression === undefined) {
            return false;
        }
        if (isParenthesizedExpression(expression) || isAsExpression(expression) || isTypeAssertion(expression)) {
            return this.sideEffectFreeReceiver(expression.expression);
        }
        if (isIdentifier(expression) || expression.kind === SyntaxKind.ThisKeyword) {
            return true;
        }
        if (isPropertyAccessExpression(expression)) {
            return this.sideEffectFreeReceiver(expression.expression);
        }
        return false;
    }

    printPadEndCall(_node, _identation, name, parsedArg, parsedArg2) {
        // You can point this to a runtime helper if you have one
        return `Helpers.padEnd((String)${name}, ((Number)${parsedArg}).intValue(), ((String)${parsedArg2}).charAt(0))`;
    }

    printPadStartCall(node, _identation, name, parsedArg, parsedArg2) {
        return this.printNativePadStart(node, name) ?? `Helpers.padStart((String)${name}, ((Number)${parsedArg}).intValue(), ((String)${parsedArg2}).charAt(0))`;
    }

    printDateNowCall(_node, _identation) {
        return "System.currentTimeMillis()";
    }

    printLengthProperty(node, _identation, _name = undefined) {
        const leftSide = this.printNode(node.expression, 0);
        const type = (this.getChecker() as Checker).getTypeAtLocation(node.expression);
        this.warnIfAnyType(node, (type as any).flags, leftSide, "length");
        return this.printJavaLength(node.expression, leftSide);
    }

    // For ++/--, prefer native Java operators rather than the C# ref-helpers
    printPostFixUnaryExpression(node, identation) {
        const { operand, operator } = node;
        const leftSide = this.printNode(operand, 0);
        return this.PostFixOperators[operator] === "--" ? `${leftSide}--` : `${leftSide}++`;
    }

    // the identifier declared by a `for (var i = <int literal>; ...; i++)` header: the
    // printer writes that initializer as `var`, so javac infers a primitive int and the
    // ++/-- increment keeps it one
    javaPrimitiveCounter(node): boolean {
        if (node?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const symbol = this.getChecker().getSymbolAtLocation(node);
        const declaration: any = symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve();
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)) {
            return false;
        }
        if (declaration.name.text !== node.text || declaration.initializer === undefined) {
            return false;
        }
        const list: any = declaration.parent;
        if (list?.kind !== SyntaxKind.VariableDeclarationList || list.declarations.length !== 1) {
            return false;
        }
        const forStatement: any = list.parent;
        if (forStatement?.kind !== SyntaxKind.ForStatement || forStatement.initializer !== list) {
            return false;
        }
        if (this.javaIntegerLiteralKind(declaration.initializer) === undefined) {
            return false;
        }
        const incrementor = forStatement.incrementor;
        return incrementor?.kind === SyntaxKind.PostfixUnaryExpression
            && incrementor.operand?.kind === SyntaxKind.Identifier
            && incrementor.operand.text === node.text;
    }

    // `-x` prints as the plain Java operator when the operand is already primitive: a decimal literal,
    // a nested native `+ - * /`, a `for (var i = <int literal>` counter or a `.length` read.
    // Helpers.opNeg preserves the box and maps null to null, so every boxed local keeps the helper.
    javaNativeNegation(node): boolean {
        if (node === undefined) {
            return false;
        }
        if (node.kind === SyntaxKind.ParenthesizedExpression) {
            return this.javaNativeNegation(node.expression);
        }
        if (isNumericLiteral(node)) {
            return this.javaProvableNumericKind(node) !== undefined;
        }
        if (node.kind === SyntaxKind.BinaryExpression) {
            return this.javaNativeArithmeticKind(node) !== undefined;
        }
        if (this.javaPrimitiveCounter(node)) {
            return true;
        }
        return node.kind === SyntaxKind.PropertyAccessExpression
            && node.name.text === 'length'
            && this.javaLengthKind(node.expression) !== undefined;
    }

    printPrefixUnaryExpression(node, identation) {
        const { operand, operator } = node;
        if (operator === SyntaxKind.ExclamationToken) {
            return this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
        }
        const leftSide = this.printNode(operand, 0);
        if (operator === SyntaxKind.PlusToken) {
            return `+(${leftSide})`;
        } else if (operator === SyntaxKind.MinusToken) {
            if (this.javaNativeNegation(operand)) {
                return `-${leftSide}`;
            }
            return `Helpers.opNeg(${leftSide})`;
        }
        return super.printPrefixUnaryExpression(node, identation);
    }

    javaBooleanCondition(node) {
        if (node.kind === SyntaxKind.ParenthesizedExpression) {
            return this.javaBooleanCondition(node.expression);
        }
        if (node.kind === SyntaxKind.PrefixUnaryExpression) {
            return node.operator === SyntaxKind.ExclamationToken && this.javaBooleanCondition(node.operand);
        }
        if (node.kind !== SyntaxKind.BinaryExpression) {
            return false;
        }
        return this.javaBooleanOperators.includes(node.operatorToken.kind);
    }

    // `Precise.<relational>(a, b)` resolving to a static of the base `Precise` class: Precise.java
    // declares them `public static boolean`, so the call is a primitive boolean. The receiver name
    // alone is no proof (a shadowing local prints the same text), so the resolution is checked too.
    javaPreciseBooleanCall(node) {
        if (node.kind === SyntaxKind.ParenthesizedExpression) {
            return this.javaPreciseBooleanCall(node.expression);
        }
        // `!<relational call>` is a boolean too (the negation of a proven boolean)
        if (node.kind === SyntaxKind.PrefixUnaryExpression) {
            return node.operator === SyntaxKind.ExclamationToken && this.javaPreciseBooleanCall(node.operand);
        }
        if (node.kind !== SyntaxKind.CallExpression
            || node.expression.kind !== SyntaxKind.PropertyAccessExpression
            || node.expression.expression.kind !== SyntaxKind.Identifier
            || node.expression.expression.text !== 'Precise'
            || !JAVA_PRECISE_BOOLEAN_STATICS.has(node.expression.name.text)) {
            return false;
        }
        const declaration: any = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
        if (declaration === undefined
            || declaration.kind !== SyntaxKind.MethodDeclaration
            || declaration.parent?.kind !== SyntaxKind.ClassDeclaration
            || declaration.parent.name?.text !== 'Precise'
            || !declaration.modifiers?.some((modifier) => modifier.kind === SyntaxKind.StaticKeyword)) {
            return false;
        }
        // the relational statics answer a plain boolean (never null), which is what
        // Helpers.isTrue(Boolean) returns unchanged; a union (boolean | undefined) keeps the helper
        return (this.getChecker().getTypeAtLocation(node).flags & TypeFlags.Boolean) !== 0;
    }

    // the checker's view of a condition value: BooleanLike is the plain `boolean` (the `boolean |
    // undefined` of an accessor with a default is BooleanLiteral + Undefined and does not qualify),
    // while a union whose every member is boolean/nullish is the nullable box.
    javaBooleanValueKind(node): 'boolean' | 'nullableBoolean' | undefined {
        const type = this.getChecker().getTypeAtLocation(node);
        const flags = type?.flags ?? 0;
        if (flags & TypeFlags.BooleanLike) {
            return 'boolean';
        }
        if ((flags & TypeFlags.Union) === 0) {
            return undefined;
        }
        const members = (type as any).getTypes?.() ?? [];
        const booleanishMembers = TypeFlags.BooleanLike | TypeFlags.Null
            | TypeFlags.Undefined | TypeFlags.Void;
        const allBooleanish = members.length > 0
            && members.every((member) => (((member as any).flags ?? 0) & booleanishMembers) !== 0);
        return allBooleanish ? 'nullableBoolean' : undefined;
    }

    // mirrors printWrappedUnknownThisProperty: a `this.<name>(...)` call the checker cannot
    // resolve prints `Helpers.callDynamically(this, "<name>", ...)`, whose Java return is Object
    javaCalleeResolves(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const signature = checker.getResolvedSignature(node);
        return signature?.declaration !== undefined;
    }

    // the boolean the printed Java of a `this.<name>(...)` call already carries, from the
    // hand-written base declarations in JAVA_THIS_BOOLEAN_METHODS / the box proof in
    // JAVA_THIS_BOOLEAN_BOX_METHODS. undefined: not a direct boolean call, keep the wrapper.
    javaCallBooleanKind(node): 'boolean' | 'nullableBoolean' | undefined {
        if (node?.kind !== SyntaxKind.CallExpression) {
            return undefined;
        }
        const callee = node.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression
            || callee.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const kind = this.javaBooleanValueKind(node);
        if (kind === undefined || !this.javaCalleeResolves(node)) {
            return undefined;
        }
        const name = callee.name?.text as string;
        if (JAVA_THIS_BOOLEAN_METHODS.has(name)) {
            // the hand-written declaration is the only source of the primitive return: a
            // non-base `this.<name>(...)` is a different method, printed `Object`
            return kind === 'boolean' ? 'boolean' : undefined;
        }
        const defaultArgumentIndex = JAVA_THIS_BOOLEAN_BOX_METHODS[name];
        if (defaultArgumentIndex === undefined) {
            return undefined;
        }
        const defaultArgument = node.arguments?.[defaultArgumentIndex];
        // a nullish literal reaches the Java accessor as null (the printer drops a trailing
        // `undefined` in the optional tail), and null is what an absent argument yields
        const defaultIsNullish = defaultArgument === undefined
            || defaultArgument.kind === SyntaxKind.NullKeyword
            || (defaultArgument.kind === SyntaxKind.Identifier && defaultArgument.text === 'undefined');
        const defaultIsBoolean = defaultIsNullish
            || defaultArgument?.kind === SyntaxKind.TrueKeyword
            || defaultArgument?.kind === SyntaxKind.FalseKeyword;
        return defaultIsBoolean ? 'nullableBoolean' : undefined;
    }

    // the printer already emits these conditions as Java `boolean` (the comparison helpers,
    // `in`/`instanceof` and the logical operators all return/print primitive boolean), so
    // Helpers.isTrue would only re-test a value the checker proves is boolean
    javaConditionPrintsBoolean(node) {
        let inner = node;
        while (inner.kind === SyntaxKind.ParenthesizedExpression) {
            inner = inner.expression;
        }
        if (inner.kind === SyntaxKind.PrefixUnaryExpression && inner.operator === SyntaxKind.ExclamationToken) {
            return true; // printPrefixUnaryExpression prints `!` + printCondition(operand): a primitive boolean
        }
        if (this.javaBooleanCondition(node)) {
            // TS models `boolean` as the true|false union: the Boolean bit is set on plain
            // boolean and cleared on `boolean | undefined`-style unions, which keep the helper
            return (this.getChecker().getTypeAtLocation(node).flags & TypeFlags.Boolean) !== 0;
        }
        return this.javaPreciseBooleanCall(node);
    }

    // the checker proves this expression's TypeScript type is exactly `boolean` (or a boolean
    // literal type): no `any`, no `undefined`/`null` union, no nullable alias
    javaBooleanBoxType(type: any): boolean {
        if (type === undefined) {
            return false;
        }
        if (type.getAliasSymbol?.() !== undefined) {
            return false;
        }
        const flags = type.flags ?? 0;
        if ((flags & JAVA_BOOLEAN_EXCLUDED_TYPE_FLAGS) !== 0) {
            return false;
        }
        return (flags & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) !== 0;
    }

    javaTypeOfNode(node): any {
        return this.checkerOrUndefined()?.getTypeAtLocation(node);
    }

    // the DECLARED type of a declaration, not the narrowed type at a use site: TypeScript
    // narrows a `const ok: boolean = true` to the literal `true` and can even reach `never`
    // after a guarding `if (ok) return;`, which says nothing about the box the local holds
    javaTypeOfDeclaration(decl): any {
        if (decl === undefined) {
            return undefined;
        }
        return this.checkerOrUndefined()?.getTypeAtLocation(decl);
    }

    // the printed Java of this expression is a primitive `boolean` (or Boolean box): boolean literals,
    // `!`, logical / comparison / `in` operators, `Array.isArray(x)` (Helpers.isArray, `public static
    // boolean`) and hand-written `public boolean` base methods. `seen` breaks `a = b; b = a;` cycles.
    javaPrintsBooleanValue(node, seen: Set<any>, depth = 0): boolean {
        if (node === undefined) {
            return false;
        }
        switch (node.kind) {
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
            return true;
        case SyntaxKind.ParenthesizedExpression:
        case SyntaxKind.AsExpression:
        case SyntaxKind.NonNullExpression:
            return this.javaPrintsBooleanValue(node.expression, seen, depth);
        case SyntaxKind.PrefixUnaryExpression:
            return node.operator === SyntaxKind.ExclamationToken && this.javaPrintsBooleanValue(node.operand, seen, depth);
        case SyntaxKind.BinaryExpression:
            // the comparison and logical operators all print a Java primitive boolean (the
            // helpers they lower to are declared `public static boolean`), whatever the operands
            return JAVA_BOOLEAN_OPERATOR_KINDS.has(node.operatorToken.kind);
        case SyntaxKind.CallExpression:
            return this.javaPrintsBooleanCall(node, seen, depth);
        case SyntaxKind.ConditionalExpression:
            // both branches print a Java boolean value, so the whole `cond ? a : b` does:
            // the printed ternary yields a boolean (or its Boolean box once assigned)
            return this.javaPrintsBooleanValue(node.whenTrue, seen, depth)
                && this.javaPrintsBooleanValue(node.whenFalse, seen, depth);
        case SyntaxKind.PropertyAccessExpression:
            return this.javaBooleanBaseField(node) !== undefined;
        case SyntaxKind.Identifier:
            return this.javaBooleanBoxIdentifier(node, seen) !== undefined;
        }
        return false;
    }

    // the Java box of a `this.<name>(...)` call whose generated body returns a boolean on every path:
    // the TS return type is a boolean family and every `return` in the resolved declaration prints a
    // Java boolean or a proven Boolean-or-null box. `depth` and `seen` bound the recursion.
    javaCallReturnsBooleanBox(node, seen: Set<any>, depth: number): boolean {
        if (node?.kind !== SyntaxKind.CallExpression || depth > 2) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const declaration = checker.getResolvedSignature(node)?.declaration?.resolve();
        if (declaration === undefined || declaration.kind !== SyntaxKind.MethodDeclaration
            || declaration.body === undefined || seen.has(declaration)) {
            return false;
        }
        if (this.javaBooleanValueKind(node) === undefined) {
            return false; // the call's TS type is not a boolean family (any/undefined-able)
        }
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) {
            return false; // only a method of this class; a foreign class is not under the printer
        }
        const name = String(callee.name.text);
        if (JAVA_THIS_BOOLEAN_METHODS.has(name) || JAVA_THIS_BOOLEAN_BOX_METHODS[name] !== undefined) {
            return false; // the hand-written base tables are authoritative for these accessors
        }
        const next = new Set(seen);
        next.add(declaration);
        let returns = 0;
        let ok = true;
        const scan = (current: Node) => {
            if (!ok) {
                return;
            }
            if (current !== declaration && isFunctionLike(current)) {
                return; // a nested function's returns are not the method's
            }
            if (isReturnStatement(current)) {
                returns++;
                const expression = current.expression;
                if (expression === undefined || !this.javaPrintsBooleanValue(expression, next, depth + 1)) {
                    ok = false;
                    return;
                }
            }
            current.forEachChild(scan);
        };
        scan(declaration.body);
        return ok && returns > 0;
    }

    // `Array.isArray(x)` prints `Helpers.isArray(x)` (`public static boolean`), the relational
    // Precise statics print `public static boolean` and the hand-written `public boolean` base
    // methods print a primitive boolean. Everything else - including the generated
    javaPrintsBooleanCall(node, seen: Set<any> = new Set(), depth = 0): boolean {
        if (this.isArrayIsArrayCall(node)) {
            return true;
        }
        if (this.javaPreciseBooleanCall(node)) {
            return true;
        }
        if (this.javaStringAffixCall(node)) {
            return true;
        }
        const callee = node.expression;
        if (isPropertyAccessExpression(callee) && callee.expression.kind === SyntaxKind.ThisKeyword
            && JAVA_BOOLEAN_BASE_CALLS.has(String(callee.name.text))) {
            return true;
        }
        return this.javaCallReturnsBooleanBox(node, seen, depth);
    }

    // `s.startsWith(x)` / `s.endsWith(x)` on a checker-proven string receiver prints
    // `((String)s).startsWith(..)`, a primitive boolean (String.startsWith/endsWith)
    javaStringAffixCall(node): boolean {
        if (node?.kind !== SyntaxKind.CallExpression || (node.arguments?.length ?? 0) !== 1) {
            return false;
        }
        const callee: any = node.expression;
        if (!isPropertyAccessExpression(callee)) {
            return false;
        }
        const name = String(callee.name.text);
        if (name !== 'startsWith' && name !== 'endsWith') {
            return false;
        }
        const type = this.javaTypeOfNode(callee.expression);
        if (type === undefined || !this.isStringType(type.flags)) {
            return false;
        }
        return /^\(\(String\)[\s\S]*\.(startsWith|endsWith)\([\s\S]*\)$/.test(this.printNode(node, 0));
    }

    isArrayIsArrayCall(node): boolean {
        if (node === undefined || node.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const callee: any = node.expression;
        return isPropertyAccessExpression(callee)
            && String(callee.name.text) === 'isArray'
            && callee.expression.kind === SyntaxKind.Identifier
            && String((callee.expression as any).text) === 'Array'
            && (node.arguments?.length ?? 0) === 1;
    }

    // `this.<name>` read of a hand-written base field declared `boolean`, or undefined. The
    // TsChecker guard keeps a field the hand-written base declares Object (or String) out.
    javaBooleanBaseField(node): string | undefined {
        if (!isPropertyAccessExpression(node) || node.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const printed = this.printNode(node, 0);
        if (!JAVA_BOOLEAN_BASE_FIELDS.has(printed)) {
            return undefined;
        }
        const declaration = (this.checkerOrUndefined() as any).getSymbolAtLocation(node.name)?.valueDeclaration?.resolve();
        const type = this.javaTypeOfDeclaration(declaration) ?? this.javaTypeOfNode(node);
        return this.javaBooleanBoxType(type) ? printed : undefined;
    }

    // the Java name of an identifier that provably holds a Boolean box or null, so `Helpers.isTrue(x)`
    // IS `Boolean.TRUE.equals(x)`. Proof: the TS type (`boolean`, never `any`/`undefined`-able) plus
    // the D2 write scan: every write in the enclosing function must print a Java boolean value.
    javaBooleanBoxIdentifier(node, seen: Set<any>): string | undefined {
        if (node?.kind !== SyntaxKind.Identifier || seen.has(node)) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const decl = symbol?.valueDeclaration?.resolve();
        if (decl === undefined) {
            return undefined;
        }
        // only a local with its own initializer: a parameter (and the `optionalArgs[n]` prologue for an
        // optional one) is an `Object` box its CALLERS fill, so it is not proven boolean; a binding
        // element (`for (const b of ...)`, destructuring) is fed by the container, not a typed value.
        if (decl.kind !== SyntaxKind.VariableDeclaration) {
            return undefined;
        }
        let type;
        try {
            type = this.javaTypeOfDeclaration(decl);
        } catch (e) {
            type = undefined;
        }
        if (!this.javaBooleanBoxType(type)) {
            return undefined;
        }
        if (!this.javaBooleanWritesAreBoxed(symbol, decl, node, seen)) {
            return undefined;
        }
        return this.printNode(node, 0);
    }

    // every value written to the symbol prints a Java boolean. The scan runs over the function
    // the DECLARATION lives in (a local can only be written inside it or inside a closure nested
    // in it), so a write in an enclosing scope is never missed.
    javaBooleanWritesAreBoxed(symbol, decl, node, seen: Set<any>): boolean {
        const next = new Set(seen);
        next.add(node);
        return this.javaWritesAreBoxed(symbol, decl, next, (value) => this.javaPrintsBooleanValue(value, next), false);
    }

    // shared D2 write scan over the function the declaration lives in: the initializer and every
    // identifier write must pass `accepts`; `tuples` also checks `[ x, params ] = ...` destructures
    javaWritesAreBoxed(symbol, decl, next: Set<any>, accepts: (value: any) => boolean, tuples: boolean): boolean {
        let fn = decl.parent;
        while (fn !== undefined && !isFunctionLike(fn)) {
            fn = fn.parent;
        }
        if (fn === undefined) {
            return false;
        }
        if (decl.initializer !== undefined && !accepts(decl.initializer)) {
            return false;
        }
        let ok = true;
        const scan = (current: Node) => {
            if (!ok) {
                return;
            }
            if ((isForOfStatement(current) || isForInStatement(current))
                && isIdentifier(current.initializer)) {
                // `for (x of list)` re-fills the box from the container
                const loop = (this.checkerOrUndefined() as any).getSymbolAtLocation(current.initializer);
                if (loop === symbol) {
                    ok = false;
                    return;
                }
            }
            if (isBinaryExpression(current)
                && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(current.operatorToken.kind)) {
                if (isIdentifier(current.left)) {
                    const left = (this.checkerOrUndefined() as any).getSymbolAtLocation(current.left);
                    if (left === symbol && !accepts(current.right)) {
                        ok = false;
                        return;
                    }
                } else if (tuples && isArrayLiteralExpression(current.left)) {
                    // `[ x, params ] = this.handle*Bool (...)` binds element `index`
                    const index = current.left.elements.findIndex((element: any) => isIdentifier(element)
                        && (this.checkerOrUndefined() as any).getSymbolAtLocation(element) === symbol);
                    if (index !== -1 && !this.javaBooleanBoxTupleElement(current.right, index)) {
                        ok = false;
                        return;
                    }
                }
            }
            current.forEachChild(scan);
        };
        scan(fn);
        return ok;
    }

    // the declared Java type the ccxt-side declaration chain gave this local/param, via the
    // javaDeclaredLocalTypeResolver hook (build/java-local-types.js): `boolean` prints as the
    // primitive, so the identifier IS the condition; `Boolean` is the nullable box (isTrue = equals).
    javaDeclaredBooleanKind(node): 'boolean' | 'Boolean' | undefined {
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined || node.text !== declaration.name?.text) {
            return undefined; // a capture rename prints `final Object finalX = x`
        }
        let declared;
        try {
            declared = this.javaDeclaredTypeOfDeclaration(declaration);
        } catch (e) {
            return undefined;
        }
        return declared === 'boolean' || declared === 'Boolean' ? declared : undefined;
    }

    // a `boolean` / `Bool` (`boolean | undefined`) METHOD parameter the body never writes: its callers
    // are typed, so the Java slot holds a Boolean or null and `Helpers.isTrue (p)` is exactly
    // `Boolean.TRUE.equals (p)`. Returns the operand as the printer prints it (the bare name or its
    // literal-default read), undefined to keep the helper. A lambda parameter is typed by its
    // functional interface, not by a TS caller contract; a parameter the body writes is filled by
    // the body; every member of the checker type must be boolean or nullish.
    javaBooleanParameterBox(node): string | undefined {
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined || !isParameterDeclaration(declaration) || node.text !== (declaration.name as any)?.text
            || declaration.parent?.kind !== SyntaxKind.MethodDeclaration || this.javaParameterIsWritten(declaration)) {
            return undefined;
        }
        let type: any;
        try {
            type = this.getChecker().getTypeAtLocation(node);
        } catch (e) {
            return undefined;
        }
        if (type === undefined) {
            return undefined;
        }
        const booleanish = (t: any) => ((t?.flags ?? 0) & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) !== 0;
        if (!booleanish(type)) {
            const members: any[] = (((type.flags ?? 0) & TypeFlags.Union) !== 0 ? type.getTypes?.() : undefined) ?? [];
            if (!members.some(booleanish) || !members.every((m) => booleanish(m)
                || ((m?.flags ?? 0) & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void)) !== 0)) {
                return undefined;
            }
        }
        const printed = this.printNode(node, 0);
        return printed === node.text || printed === this.javaDefaultedLocalName(node) ? printed : undefined;
    }

    // the DECLARED type of the local is a nullable boolean: `Bool` (`boolean | undefined`) or an
    // equivalent union. Every member must be boolean or nullish - an `Int`/`Str`/`any` member can
    // hold a box the isTrue helper tests with its runtime truthiness, so the helper must stay.
    javaNullableBooleanDeclaration(declaration): boolean {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) {
            return false;
        }
        const type = this.javaTypeOfDeclaration(declaration);
        if (type === undefined) {
            return false;
        }
        const flags: number = type.flags ?? 0;
        if ((flags & (TypeFlags.Any | TypeFlags.Unknown)) !== 0) {
            return false;
        }
        if ((flags & TypeFlags.Boolean) !== 0) {
            return false; // the plain `boolean` is the strict box family's own proof
        }
        if ((flags & TypeFlags.Union) === 0) {
            return false;
        }
        const members: any[] = (type as any).getTypes?.() ?? [];
        if (members.length === 0) {
            return false;
        }
        const booleanish = (member: any) => (((member?.flags ?? 0) & JAVA_NULLABLE_BOOLEAN_MEMBER_FLAGS) !== 0);
        const hasBoolean = members.some((member: any) => (((member?.flags ?? 0) & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) !== 0));
        return hasBoolean && members.every(booleanish);
    }

    // a value the nullable-boolean write scan accepts: a Java boolean value this printer proves, a
    // nullish literal, or a safeBool-family accessor whose other paths return the caller's default
    // (Boolean or null). A Long/Int/String/List box would change what isTrue answers.
    javaPrintsBooleanBoxValue(node, seen: Set<any>): boolean {
        if (node === undefined) {
            return false;
        }
        if (node.kind === SyntaxKind.ParenthesizedExpression || node.kind === SyntaxKind.AsExpression
            || node.kind === SyntaxKind.NonNullExpression) {
            return this.javaPrintsBooleanBoxValue(node.expression, seen);
        }
        if (node.kind === SyntaxKind.NullKeyword) {
            return true;
        }
        if (node.kind === SyntaxKind.Identifier && node.text === 'undefined') {
            return true; // prints null
        }
        if (this.javaPrintsBooleanValue(node, seen)) {
            return true;
        }
        if (node.kind === SyntaxKind.Identifier && this.javaNullableBooleanBoxIdentifier(node, seen) !== undefined) {
            return true; // a local whose declared type is the nullable boolean and every write boxes
        }
        if (node.kind === SyntaxKind.Identifier && this.javaBooleanTupleBindingIdentifier(node, seen) !== undefined) {
            return true;
        }
        if (node.kind === SyntaxKind.CallExpression) {
            return this.javaCallBooleanKind(node) !== undefined;
        }
        return false;
    }

    // element `index` of a `[ x, params ] = this.handle*Bool (...)` destructure is a Boolean-or-null
    // box: those accessors return a safeBool result, never the raw member when not a Boolean. The
    // handleOptionAndParams family returns the raw member and is deliberately not a box proof.
    javaBooleanBoxTupleElement(node, index: number): boolean {
        if (node?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        const name = String(callee.name.text);
        if (!JAVA_BOOLEAN_BOX_TUPLE_METHODS.has(name)) {
            return false;
        }
        const declaration: any = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
        if (declaration?.name?.text !== name) {
            return false; // a same-named override is not the base accessor
        }
        return index === 0;
    }

    // `const [ x, p ] = this.handle*Bool (...)` binds x to element 0, a Boolean-or-null box; any
    // later identifier or tuple write must also be a proven box (the D2 scan over the function)
    javaBooleanTupleBindingIdentifier(node, seen: Set<any> = new Set()): string | undefined {
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const element = symbol?.valueDeclaration?.resolve();
        if (element === undefined || element.kind !== SyntaxKind.BindingElement || element.initializer !== undefined
            || element.dotDotDotToken !== undefined || element.name?.text !== node.text || seen.has(element)) {
            return undefined;
        }
        const pattern = element.parent;
        const declaration = pattern?.parent;
        if (pattern?.kind !== SyntaxKind.ArrayBindingPattern || declaration?.kind !== SyntaxKind.VariableDeclaration
            || !this.javaBooleanBoxTupleElement(declaration.initializer, pattern.elements.indexOf(element))) {
            return undefined;
        }
        const next = new Set(seen);
        next.add(element);
        const binding = { initializer: undefined, parent: declaration };
        if (!this.javaWritesAreBoxed(symbol, binding, next, (value) => this.javaPrintsBooleanBoxValue(value, next), true)) {
            return undefined;
        }
        return this.printNode(node, 0);
    }

    // the D2 scan over a nullable boolean local: every write prints a Java boolean value or a
    // proven Boolean-or-null box, so no path can leave a truthy non-boolean box in it
    javaBooleanNullableWritesAreBoxed(symbol, declaration, node, seen: Set<any>): boolean {
        const next = new Set(seen);
        next.add(node);
        next.add(declaration); // a write scan that reaches this declaration again stops
        return this.javaWritesAreBoxed(symbol, declaration, next, (value) => this.javaPrintsBooleanBoxValue(value, next), true);
    }

    // `Helpers.isTrue(x)` where the DECLARED type of x is a nullable boolean and every write is a
    // proven Boolean-or-null box: `Boolean.TRUE.equals(x)` is exactly what the helper answers on
    // such a box (null and FALSE test false, TRUE tests true)
    javaNullableBooleanBoxIdentifier(node, seen: Set<any> = new Set()): string | undefined {
        if (node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const declaration = symbol?.valueDeclaration?.resolve();
        if (declaration === undefined || declaration.name?.text !== node.text) {
            return undefined;
        }
        if (seen.has(declaration)) {
            return undefined; // a write graph that reaches this declaration again keeps the helper
        }
        if (!this.javaNullableBooleanDeclaration(declaration)) {
            return undefined;
        }
        if (!this.javaBooleanNullableWritesAreBoxed(symbol, declaration, node, seen)) {
            return undefined;
        }
        return this.printNode(node, 0);
    }

    // the native Java a falsy wrapper around this condition prints, or undefined to keep
    // `Helpers.isTrue(...)`: a hand-written boolean field prints bare; `Array.isArray(x)` prints
    // `Helpers.isArray(x)` (null -> false like helper); a proven Boolean box: `Boolean.TRUE.equals(x)`
    javaBooleanWrapperFreeCondition(node): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        if (node.kind === SyntaxKind.ParenthesizedExpression) {
            return this.javaBooleanWrapperFreeCondition(node.expression);
        }
        if (this.isArrayIsArrayCall(node)) {
            return `(${this.printNode(node.arguments[0], 0)} instanceof java.util.List)`;
        }
        if (this.javaStringAffixCall(node)) {
            return this.printNode(node, 0);
        }
        const field = this.javaBooleanBaseField(node);
        if (field !== undefined) {
            return field;
        }
        // a `this.<name>(...)` call whose generated body returns a boolean value on every path
        // prints a Boolean box; the bare declarations in JAVA_THIS_BOOLEAN_METHODS are printed
        // native by printCondition and are left to it
        if (node.kind === SyntaxKind.CallExpression && this.javaCallBooleanKind(node) === undefined
            && this.javaCallReturnsBooleanBox(node, new Set(), 0)) {
            return `Boolean.TRUE.equals(${this.printNode(node, 0)})`;
        }
        if (node.kind === SyntaxKind.Identifier) {
            // the ccxt-side declaration chain types a local/param `boolean`/`Boolean` inside
            // javaDeclaredLocalTypeResolver: a primitive declaration IS the condition, a box
            // needs the null-safe TRUE test the helper performs
            const declared = this.javaDeclaredBooleanKind(node);
            if (declared === 'boolean') {
                return this.printNode(node, 0);
            }
            if (declared === 'Boolean') {
                return `Boolean.TRUE.equals(${this.printNode(node, 0)})`;
            }
            const parameterBox = this.javaBooleanParameterBox(node);
            if (parameterBox !== undefined) {
                return `Boolean.TRUE.equals(${parameterBox})`;
            }
        }
        const box = this.javaBooleanBoxIdentifier(node, new Set()) ?? this.javaNullableBooleanBoxIdentifier(node)
            ?? this.javaBooleanTupleBindingIdentifier(node);
        return box === undefined ? undefined : `Boolean.TRUE.equals(${box})`;
    }

    printCondition(node, identation) {
        if (this.javaConditionPrintsBoolean(node)) {
            return this.getIden(identation) + this.printNode(node, 0);
        }
        let bareCall = node;
        while (bareCall.kind === SyntaxKind.ParenthesizedExpression) {
            bareCall = bareCall.expression;
        }
        if (bareCall.kind === SyntaxKind.CallExpression && this.javaCallPrintsNonNullBoolean(bareCall, 0)) {
            return this.getIden(identation) + this.printNode(node, 0); // a never-null Boolean unboxes safely
        }
        const wrapperFree = this.javaBooleanWrapperFreeCondition(node);
        if (wrapperFree !== undefined) {
            return this.getIden(identation) + wrapperFree;
        }
        const callKind = this.javaCallBooleanKind(bareCall);
        if (callKind === 'boolean') {
            return this.getIden(identation) + this.printNode(node, 0);
        }
        if (callKind === 'nullableBoolean') {
            // Helpers.isTrue(box) on a Boolean-or-null box is Boolean.TRUE.equals(box): null
            // and FALSE test false, TRUE tests true
            return this.getIden(identation) + `Boolean.TRUE.equals(${this.printNode(node, 0)})`;
        }
        return super.printCondition(node, identation);
    }

    printConditionalExpression(node, _identation) {
        const condition = this.printCondition(node.condition, 0);
        const whenTrue = this.printNode(node.whenTrue, 0);
        const whenFalse = this.printNode(node.whenFalse, 0);
        return `((${condition})) ? ${whenTrue} : ${whenFalse}`;
    }

    printDeleteExpression(node, _identation) {
        const object = this.printNode(node.expression.expression, 0);
        const key = this.printNode(node.expression.argumentExpression, 0);
        // a ws Client map (or a local bound to it) already binds `remove` with no receiver cast
        if (this.javaWsClientMapReceiver(node.expression.expression)) {
            return `${object}.remove((String)${key})`;
        }
        return `((java.util.Map<String,Object>)${object}).remove((String)${key})`;
    }

    printThrowStatement(node, identation) {
        if (node.expression.kind === SyntaxKind.Identifier) {
            // a bare rethrow (`throw e`) of a caught java.lang.Exception is a checked
            // exception, which the surrounding async lambdas cannot declare - keep
            // unchecked exceptions (ccxt errors extend RuntimeException) as-is and
            // wrap checked ones, preserving the original as the cause
            const name = this.printNode(node.expression, 0);
            return (
                this.getIden(identation) +
                `${this.THROW_TOKEN} (${name} instanceof RuntimeException ? (RuntimeException)${name} : new RuntimeException(${name}))${this.LINE_TERMINATOR}`
            );
        }
        if (node.expression.kind === SyntaxKind.NewExpression) {
            const expression = node.expression;
            const argumentsExp = expression?.arguments ?? [];
            const parsedArg = argumentsExp.map((n) => this.printNode(n, 0)).join(",") ?? "";
            const newExpression = this.printNode(expression.expression, 0);
            if (expression.expression.kind === SyntaxKind.Identifier) {
                const id = expression.expression;
                // java.lang.Error is a sibling of Exception under Throwable, so
                // `catch (Exception e)` won't catch it. Map JS/TS `Error` to
                // RuntimeException so standard catch blocks work.
                const exceptionName = id.text === "Error" ? "RuntimeException" : id.text;
                const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
                if (symbol) {
                    const declarations =
                        (this.getChecker().getDeclaredTypeOfSymbol(symbol).getSymbol()?.declarations ?? []).map((d) => d.resolve());
                    const isClassDeclaration = declarations.find(
                        (l) =>
                            l.kind === SyntaxKind.InterfaceDeclaration ||
                            l.kind === SyntaxKind.ClassDeclaration
                    );
                    if (isClassDeclaration) {
                        return (
                            this.getIden(identation) +
                            `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${exceptionName}((String)${parsedArg}) ${this.LINE_TERMINATOR}`
                        );
                    } else {
                        return (
                            this.getIden(identation) +
                            `Helpers.throwDynamicException(${exceptionName}, ${parsedArg});return null;`
                        );
                    }
                }
                return (
                    this.getIden(identation) +
                    `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${exceptionName}(${parsedArg}) ${this.LINE_TERMINATOR}`
                );
            } else if (expression.expression.kind === SyntaxKind.ElementAccessExpression) {
                return this.getIden(identation) + `Helpers.throwDynamicException(${newExpression}, ${parsedArg});`;
            }
            return super.printThrowStatement(node, identation);
        }
    }

    csModifiers = {};

    printPropertyAccessModifiers(node) {
        let modifiers = this.printModifiers(node);
        if (modifiers === "") {
            modifiers = this.defaultPropertyAccess;
        }
        // add type
        let typeText = "Object";
        if (node.type) {
            typeText = this.getType(node);
            if (!typeText) {
                if (node.type.kind === SyntaxKind.AnyKeyword) {
                    typeText = this.OBJECT_KEYWORD + " ";
                }
            }
        }
        return modifiers + " " + typeText + " ";
    }

    printModifiers(node) {
        let modifiers = node.modifiers;
        if (modifiers === undefined) {
            return "";
        }
        modifiers = modifiers.filter(mod => this.FuncModifiers[mod.kind] && mod.kind !== SyntaxKind.AsyncKeyword);
        return modifiers.map(modifier => this.FuncModifiers[modifier.kind]).join(" ");
    }

    // literals printed as `Helpers.newMap(k, v, ...)` (no anonymous class, so no capture rule)
    builderObjectLiterals: WeakSet<Node> = new WeakSet();

    printObjectLiteralExpression(node, identation) {
        const handlerTable = this.printJavaHandlerTable(node, identation);
        if (handlerTable !== undefined) {
            return handlerTable;
        }
        if (node.properties.length > 0 && node.properties.every((p) => isPropertyAssignment(p)) &&
            this.objectLiteralCapturesReassigned(node)) {
            this.builderObjectLiterals.add(node);
            return this.printObjectLiteralBuilder(node, identation);
        }
        this.builderObjectLiterals.delete(node);
        const objectBody = this.printObjectLiteralBody(node, identation);
        const formattedObjectBody = objectBody ? "\n" + objectBody + "\n" + this.getIden(identation) : objectBody;
        return  this.OBJECT_OPENING + formattedObjectBody + this.OBJECT_CLOSING;
    }

    printObjectLiteralBuilder(node, identation) {
        // a comparison inside the values must not mark a captured local as reassigned
        // (that flag drives the async-parameter copies and the typed-parameter write casts)
        const keys = this.objectLiteralCapturedKeys(node);
        const saved = keys.map((key) => this.ReassignedVars[key]);
        try {
            return this.printObjectLiteralBuilderText(node, identation);
        } finally {
            keys.forEach((key, i) => {
                if (saved[i] === undefined) {
                    delete this.ReassignedVars[key];
                } else {
                    this.ReassignedVars[key] = saved[i];
                }
            });
        }
    }

    printObjectLiteralBuilderText(node, identation) {
        const props = node.properties;
        const lines = props.map((prop, i) => {
            const name = this.printNode(prop.name, 0);
            const custom = this.printCustomRightSidePropertyAssignment(prop.initializer, identation + 1);
            const value = (custom ? custom : this.printNode(prop.initializer, identation + 1)).trim();
            let comment = this.printTraillingComment(prop, identation + 1);
            comment = comment ? " " + comment : "";
            const sep = i < props.length - 1 ? "," : "";
            return this.getIden(identation + 1) + name + ", " + value + sep + comment;
        });
        return "Helpers.newMap(\n" + lines.join("\n") + "\n" + this.getIden(identation) + ")";
    }

    printObjectLiteralBody(node, identation) {
        const body =  node.properties.map((p) => this.printNode(p, identation+1)).join("\n");
        // body = body.replaceAll('this.', `${name}.this.`);
        return body;
    }

    printForStatement(node, identation) {
        const initializer = this.printNode(node.initializer, 0).replace('Object ', 'var ');
        const condition = this.printNode(node.condition, 0);
        const incrementor = this.printNode(node.incrementor, 0);

        const forStm = this.getIden(identation) +
                this.FOR_TOKEN + " " +
                this.CONDITION_OPENING +
                initializer + "; " + condition + "; " + incrementor +
                this.CONDITION_CLOSE +
                this.printBlock(node.statement, identation);
        return this.printNodeCommentsIfAny(node, identation, forStm);
    }

    printReturnStatement(node, identation) {
        const leadingComment = this.printLeadingComments(node, identation);
        let trailingComment = this.printTraillingComment(node, identation);
        trailingComment = trailingComment ? " " + trailingComment : trailingComment;
        let exp =  node.expression;
        if (exp && exp.kind === SyntaxKind.AsExpression && (exp.expression.kind === SyntaxKind.ObjectLiteralExpression || SyntaxKind.CallExpression)) {
            exp = exp.expression; // go over something like return {} as SomeType
        }
        let rightPart = exp ? (' ' + this.printNode(exp, identation)) : '';
        rightPart = rightPart.trim();
        if (!rightPart) {
            // bare return; — check if inside async method (supplyAsync lambda needs return null)
            let parent = node.parent;
            while (parent) {
                if (isFunctionDeclaration(parent) || isMethodDeclaration(parent) || isFunctionExpression(parent) || isArrowFunction(parent)) {
                    if (this.isAsyncFunction(parent)) {
                        rightPart = 'null';
                    }
                    break;
                }
                parent = parent.parent;
            }
        }
        rightPart = rightPart ? ' ' + rightPart + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
        return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + rightPart + trailingComment;
    }

    private allBranchesTerminate(node: Node): boolean {
        if (isReturnStatement(node) || isThrowStatement(node)) {
            return true;
        }
        if (isBlock(node)) {
            const stmts = node.statements;
            return stmts.length > 0 && this.allBranchesTerminate(stmts[stmts.length - 1]);
        }
        if (isIfStatement(node)) {
            if (!node.elseStatement) {
                return false; // no else: not all paths covered
            }
            return this.allBranchesTerminate(node.thenStatement) && this.allBranchesTerminate(node.elseStatement);
        }
        return false;
    }
    // hx4 J01: `m[k] = v` on a local the printer declared `Map<String, Object>` whose every write is a
    // provably non-concurrent map (fresh literal/extend/omit, or a base safeDict* of non-field data):
    // the helper's map branch is then `m.put(k, v)` (null value included; its CHM removal never applies)
    javaHx4MapPutIsNative(baseExpr, keys: any[]): boolean {
        if (keys.length !== 1 || baseExpr === undefined || !isIdentifier(baseExpr) || !this.javaDeclaredMapReceiver(baseExpr)) {
            return false;
        }
        const key = keys[0];
        if (!isStringLiteralLikeNode(key) && !this.javaDeclaredStringType(key)
            && !this.isJavaStringType(this.getChecker().getTypeAtLocation(key))) {
            return false; // Map<String, Object>.put needs a String key (the helper takes any box)
        }
        const declaration: any = this.javaDeclarationOfIdentifier(baseExpr);
        if (declaration === undefined || declaration.kind !== SyntaxKind.VariableDeclaration || !declaration.initializer) {
            return false; // parameters may carry a caller's ConcurrentHashMap
        }
        const admits = (rhs) => this.javaHx4PlainMapSource(baseExpr, rhs);
        return admits(declaration.initializer) && !this.javaLocalIsReassigned(baseExpr, admits);
    }

    javaHx4PlainMapSource(container, value): boolean {
        const node = this.unwrapPrintTransparentExpression(value);
        if (node === undefined) {
            return false;
        }
        if (this.javaFreshHashMapValue(container, node)) {
            return true;
        }
        if (!isCallExpression(node) || !isPropertyAccessExpression(node.expression)
            || node.expression.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        const name = node.expression.name.text;
        const fileName = this.checkerOrUndefined()?.getResolvedSignature(node)?.declaration?.resolve()?.getSourceFile?.()?.fileName;
        if (typeof fileName !== 'string' || !JAVA_FRESH_EXTEND_FILE.test(fileName)) {
            return false; // a venue override may return anything
        }
        if (name === 'extend' || name === 'deepExtend' || name === 'omit') {
            return true; // Generic.Extend / deepExtend / Functions.omitMap build a fresh LinkedHashMap (or null)
        }
        if (name === 'safeDict' || name === 'safeDict2' || name === 'safeDictN') {
            // hands back an element of the source or the default: never a field map or a ws client map
            return node.arguments.length > 0 && this.javaHx4NonSharedSource(node.arguments[0], 0)
                && (node.arguments.length < (name === 'safeDict2' ? 4 : 3)
                    || this.javaHx4DefaultIsPlain(node.arguments[node.arguments.length - 1]));
        }
        return false;
    }

    javaHx4DefaultIsPlain(value): boolean {
        const node = this.unwrapPrintTransparentExpression(value);
        return node !== undefined && (isObjectLiteralExpression(node) || node.kind === SyntaxKind.UndefinedKeyword
            || (isIdentifier(node) && node.text === 'undefined') || node.kind === SyntaxKind.NullKeyword);
    }

    // data that can not hold one of the runtime's ConcurrentHashMaps (this.<field> top level, ws client
    // futures/subscriptions/rejections and their entries): a local/param/element chain not rooted at them
    javaHx4NonSharedSource(value, depth: number): boolean {
        const node = this.unwrapPrintTransparentExpression(value);
        if (node === undefined || depth > 40) {
            return false;
        }
        if (isElementAccessExpression(node)) {
            return this.javaHx4NonSharedSource(node.expression, depth + 1);
        }
        if (!isIdentifier(node)) {
            return false;
        }
        const declaration: any = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined) {
            return false;
        }
        if (declaration.kind === SyntaxKind.Parameter) {
            const type = this.getChecker().getTypeAtLocation(node);
            const text = (type?.getSymbol?.()?.escapedName ?? '') + '';
            return !/Client/.test(text) && !/^(client|subscriptions|futures|rejections)$/.test(node.text);
        }
        const known = this.javaHx4SourceVerdicts.get(declaration);
        if (known !== undefined) {
            return known; // `true` while in progress: a self-referencing write adds no new source
        }
        this.javaHx4SourceVerdicts.set(declaration, true);
        this.javaHx4InProgress.add(declaration);
        const writes: any[] = declaration.initializer ? [declaration.initializer] : [];
        const verdict = !this.javaLocalIsReassigned(node, (rhs) => { writes.push(rhs); return true; })
            && writes.every((w) => this.javaHx4NonSharedValue(w, depth + 1));
        this.javaHx4InProgress.delete(declaration);
        if (verdict && this.javaHx4InProgress.size > 0) {
            this.javaHx4SourceVerdicts.delete(declaration); // leaned on an unfinished verdict: recompute later
        } else {
            this.javaHx4SourceVerdicts.set(declaration, verdict);
        }
        return verdict;
    }

    javaHx4SourceVerdicts = new WeakMap<any, boolean>();
    javaHx4InProgress = new Set<any>();

    // a value expression that never reads a field map or a ws client's maps
    javaHx4NonSharedValue(value, depth: number): boolean {
        let shared = false;
        const walk = (n) => {
            if (shared || n === undefined) {
                return;
            }
            if (isPropertyAccessExpression(n)) {
                const called = n.parent !== undefined && isCallExpression(n.parent) && n.parent.expression === n;
                if ((!called && (n.expression.kind === SyntaxKind.ThisKeyword
                    || /^(subscriptions|futures|rejections|hashmap)$/.test(n.name.text)))
                    || (called && n.name.text === 'createSafeDictionary')) {
                    shared = true;
                    return;
                }
            }
            if (n.kind === SyntaxKind.ThisKeyword && !(n.parent !== undefined && isPropertyAccessExpression(n.parent))) {
                shared = true; // `this` handed to a call
                return;
            }
            if (isIdentifier(n) && n !== value && !(n.parent !== undefined && isPropertyAccessExpression(n.parent) && n.parent.name === n)) {
                const declaration: any = this.javaDeclarationOfIdentifier(n);
                if (declaration !== undefined && !this.javaHx4NonSharedSource(n, depth + 1)) {
                    shared = true;
                    return;
                }
            }
            n.forEachChild(walk);
        };
        walk(value);
        return !shared;
    }

    // `this.<field>` of a base field declared Object/Map whose Java type a file cannot change: the
    // field is a plain map in this class exactly when every `this.<field> =` in the source file builds
    // one (an object literal, a zero-arg base createSafeDictionary, a local holding a literal) or
    // nulls it. A read needs no assignment to be any other kind; a put also needs one plain build,
    // because the helper removes a null value from a ConcurrentHashMap.
    javaFileBuiltMapField(receiver, name: string, forWrite: boolean): boolean {
        if (!JAVA_FILE_BUILT_MAP_FIELDS.has(name) || receiver?.expression?.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        const file = receiver.getSourceFile?.();
        if (file === undefined) {
            return false;
        }
        let byField = this.javaFieldAssignmentKindsCache.get(file);
        if (byField === undefined) {
            const found = new Map<string, string[]>();
            const visit = (n) => {
                if (isBinaryExpression(n) && n.operatorToken.kind >= SyntaxKind.FirstAssignment
                    && n.operatorToken.kind <= SyntaxKind.LastAssignment
                    && isPropertyAccessExpression(n.left) && n.left.expression.kind === SyntaxKind.ThisKeyword) {
                    const field = n.left.name.text;
                    const kind = n.operatorToken.kind === SyntaxKind.EqualsToken ? this.javaAssignedMapKind(n.right, 0) : 'other';
                    found.set(field, [...(found.get(field) ?? []), kind]);
                }
                n.forEachChild(visit);
            };
            file.forEachChild(visit);
            byField = found;
            this.javaFieldAssignmentKindsCache.set(file, byField);
        }
        const kinds = byField.get(name) ?? [];
        if (kinds.some((k) => k === 'other')) {
            return false;
        }
        return forWrite ? kinds.some((k) => k === 'plain') : kinds.length > 0;
    }

    // 'plain': a java.util.HashMap the code builds; 'null': a null reset; 'other': anything else
    javaAssignedMapKind(value, depth: number): string {
        const node = this.unwrapPrintTransparentExpression(value);
        if (node === undefined) {
            return 'other';
        }
        if (node.kind === SyntaxKind.NullKeyword || node.kind === SyntaxKind.UndefinedKeyword
            || (isIdentifier(node) && node.text === 'undefined')) {
            return 'null';
        }
        if (isObjectLiteralExpression(node)) {
            return 'plain';
        }
        if (isCallExpression(node) && node.arguments.length === 0 && isPropertyAccessExpression(node.expression)
            && node.expression.expression.kind === SyntaxKind.ThisKeyword
            && node.expression.name.text === 'createSafeDictionary') {
            const fileName = this.checkerOrUndefined()?.getResolvedSignature(node)?.declaration?.resolve()?.getSourceFile?.()?.fileName;
            return typeof fileName === 'string' && JAVA_THIS_RETURN_TYPES_BASE_FILE.test(fileName) ? 'plain' : 'other';
        }
        if (isIdentifier(node) && depth < 2) {
            const declaration: any = this.javaDeclarationOfIdentifier(node);
            if (declaration !== undefined && isVariableDeclaration(declaration) && declaration.initializer
                && this.javaAssignedMapKind(declaration.initializer, depth + 1) === 'plain'
                && !this.javaLocalIsReassigned(node, (rhs) => this.javaAssignedMapKind(rhs, depth + 1) === 'plain')) {
                return 'plain';
            }
        }
        return 'other';
    }

    // hx4 J02: `this.<field>[k]` on the J02 base map fields. ConcurrentHashMap.get(null) throws
    // where the helper answers null, so a non-literal key is always null-tested; the receiver can
    // be null too. Key and receiver print twice, so both must be side-effect free.
    javaJ02FieldMapReadText(receiver, key): string | undefined {
        const name = receiver?.name?.text;
        if (typeof name === 'string' && Object.prototype.hasOwnProperty.call(JAVA_BASE_MAP_READ_FIELDS, name)) {
            return this.javaBaseMapFieldReadText(receiver, key, JAVA_BASE_MAP_READ_FIELDS[name]);
        }
        if (typeof name !== 'string'
            || (!Object.prototype.hasOwnProperty.call(JAVA_J02_MAP_FIELDS, name) && !this.javaFileBuiltMapField(receiver, name, false))) {
            return undefined;
        }
        const literal = isStringLiteralLikeNode(key);
        if (!literal && !this.javaRepeatableOperand(key)) {
            return undefined;
        }
        const target = this.printNode(receiver, 0);
        const keyText = this.printNode(key, 0);
        const keyGuard = literal ? '' : `${keyText} == null || `;
        return `(${keyGuard}${target} == null ? null : ((java.util.Map<?, ?>)${target}).get(${keyText}))`;
    }

    javaBaseMapFieldReadText(receiver, key, field: { declared: boolean, anyKey: boolean }): string | undefined {
        const operand = isAsExpression(key) && key.type?.kind === SyntaxKind.StringKeyword ? key.expression : key;
        const literal = isStringLiteralLikeNode(key);
        if (!literal) {
            if (!isIdentifier(operand) || !this.javaRepeatableOperand(operand)) {
                return undefined;
            }
            if (!field.anyKey && !this.isJavaStringType(this.getChecker().getTypeAtLocation(key))
                && !this.javaDeclaredStringType(operand)) {
                return undefined;
            }
        }
        const target = this.printNode(receiver, 0);
        const read = field.declared ? target : `((java.util.Map<?, ?>)${target})`;
        const guard = literal ? `${target} == null` : `${target} == null || ${this.printNode(operand, 0)} == null`;
        return `(${guard} ? null : ${read}.get(${this.printNode(key, 0)}))`;
    }

    // hx4 J05
    // `(a % N) <op> M` (N a non-zero integer literal, a an int/long operand, M an int literal): the
    // native mod prints a finite integral double |v| < |N|, where isEqual (IsInteger -> toLong) and
    // isGreaterThan (toDouble) both reduce to the plain double comparison against M.
    javaHx4J05IntegralModOperand(node): boolean {
        while (node !== undefined && node.kind === SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        if (node === undefined || !isBinaryExpression(node) || node.operatorToken.kind !== SyntaxKind.PercentToken) {
            return false;
        }
        if (this.javaScalarFamily(node.left) !== 'number' || this.javaScalarFamily(node.right) !== 'number') {
            return false;
        }
        const leftKind = this.javaProvableNumericKind(node.left);
        if (leftKind !== 'int' && leftKind !== 'long' && !this.javaProvableCounterInt(node.left)) {
            return false;
        }
        const divisor = node.right;
        if (this.javaIntegerLiteralKind(divisor) !== 'int' || Number(divisor.text) === 0) {
            return false;
        }
        return true;
    }

    printHx4J05ModComparison(left, right, op): string | undefined {
        const javaOps = {
            [SyntaxKind.EqualsEqualsToken]: '==', [SyntaxKind.EqualsEqualsEqualsToken]: '==',
            [SyntaxKind.ExclamationEqualsToken]: '!=', [SyntaxKind.ExclamationEqualsEqualsToken]: '!=',
            [SyntaxKind.LessThanToken]: '<', [SyntaxKind.LessThanEqualsToken]: '<=',
            [SyntaxKind.GreaterThanToken]: '>', [SyntaxKind.GreaterThanEqualsToken]: '>=',
        };
        const javaOp = javaOps[op];
        if (javaOp === undefined) {
            return undefined;
        }
        const modLeft = this.javaHx4J05IntegralModOperand(left);
        const modRight = !modLeft && this.javaHx4J05IntegralModOperand(right);
        if (!modLeft && !modRight) {
            return undefined;
        }
        if (this.javaEqualityLiteralKind(modLeft ? right : left) !== 'int') {
            return undefined;
        }
        const leftText = this.printNode(left, 0);
        const rightText = this.printNode(right, 0);
        // only when the mod side printed the native double remainder
        if (!/^\(+double\) /.test(modLeft ? leftText : rightText)) {
            return undefined;
        }
        return `(${leftText} ${javaOp} ${rightText})`;
    }

    // hx4 J06
    // `x.indexOf(t)` where a string/Str-declared x is narrowed to a union of string literals
    // (`===` tests): x is a non-null String, so String.indexOf is the helper's String arm
    javaHx4J06NarrowedIndexOf(node, name, parsedArg) {
        const receiver = node?.expression?.expression;
        const arg = node?.arguments?.[0];
        if (receiver === undefined || arg === undefined || name === undefined || parsedArg === undefined
            || !isIdentifier(receiver) || this.isVarargsArrayReference(receiver)) {
            return undefined;
        }
        let receiverType: any;
        try {
            receiverType = this.getChecker().getTypeAtLocation(receiver);
        } catch (e) {
            return undefined;
        }
        if (receiverType === undefined || (receiverType.flags & TypeFlags.Union) === 0
            || !receiverType.getTypes().every((member) => this.isStringType(member.flags))) {
            return undefined;
        }
        // a DECLARED literal union is no runtime proof: the declaration must carry plain `string`
        const symbol = this.getChecker().getSymbolAtLocation(receiver);
        const declaration: any = symbol?.valueDeclaration?.resolve?.() ?? symbol?.valueDeclaration;
        let declared: any;
        try {
            declared = declaration?.name === undefined ? undefined : this.getChecker().getTypeAtLocation(declaration.name);
        } catch (e) {
            declared = undefined;
        }
        const declaredMembers: any[] = declared === undefined ? [] : ((declared.flags & TypeFlags.Union) !== 0 ? declared.getTypes() : [declared]);
        if (!declaredMembers.some((member) => member.flags === TypeFlags.String)) {
            return undefined;
        }
        if (this.javaProvableString(arg)) {
            return `((String)${name}).indexOf(${parsedArg})`;
        }
        return undefined;
    }
}

// hx4 J02
// more hand-written BaseExchange map fields: every write in BaseExchange.java and ts/src is a
// HashMap / ConcurrentHashMap / Map-cast or null (markets_by_id = null, urls/fees from describe())
// base fields declared Object/Map whose plain-map type is proven per source file (javaFileBuiltMapField)
const JAVA_FILE_BUILT_MAP_FIELDS: Set<string> = new Set(['markets', 'positions']);

const JAVA_J02_MAP_FIELDS: { [name: string]: true } = {
    'tickers': true,
    'bidsasks': true,
    'trades': true,
    'fees': true,
    'urls': true,
    'markets_by_id': true,
};

// BaseExchange.java fields read by `this.<field>[k]` with the helper's null answers kept: `declared` =
// the field prints a Map (the read needs no cast; else every write is a Map cast, so the cast holds),
// `anyKey` = a hash-backed map answers null for any key, otherwise only a String key is read.
const JAVA_BASE_MAP_READ_FIELDS: { [name: string]: { declared: boolean, anyKey: boolean } } = {
    'has': { declared: true, anyKey: true },
    'features': { declared: true, anyKey: true },
    'currencies': { declared: true, anyKey: false },
    'requiredCredentials': { declared: false, anyKey: true },
};

// hx4 J09: isTrue / isInstance / toLongOrNull / toStringArg go native on proven operands.
// A call whose resolved declaration is a base-tier accessor/thrower (ts/src/base/Exchange.ts or the
// ts/src/base/functions mixins it re-exports) or a lib.*.d.ts built-in, and whose return type is not a
// Promise, runs synchronously: it prints no `.join()`, so it cannot raise a CompletionException.
const JAVA_SYNC_CALL_FILE = /(^|[\\/])ts[\\/]src[\\/]base[\\/](functions[\\/][^\\/]+|Exchange(\.nooverloads\.\d+)?)\.ts$|(^|[\\/])lib\.[^\\/]*\.d\.ts$/;

export interface JavaTranspiler {
    javaCounterPlan(statements, identation: number): Map<any, any> | undefined;
    javaPrintBodyStatements(statements, identation: number): string[];
    hx4J09BoxIdentifier(node, seen: Set<any>, depth: number): boolean;
    hx4J09BoxValue(node, seen: Set<any>, depth: number): boolean;
    hx4J09LiteralTupleElement(node, index: number): boolean;
    hx4J09CatchCannotWrap(node): boolean;
    hx4J09CoreArgument(type: string, printed: string, node): string | undefined;
    hx4J09CcxtErrorClass(node): boolean;
}

// a class declared in ts/src/base/errors.ts: its Java twin extends RuntimeException, so
// `catchVar instanceof X` compiles against the `Exception` catch parameter
JavaTranspiler.prototype.hx4J09CcxtErrorClass = function (node): boolean {
    const checker: any = this.checkerOrUndefined();
    let symbol: any;
    try {
        symbol = checker?.getSymbolAtLocation(node);
        if (symbol !== undefined && (symbol.flags & SymbolFlags.Alias)) {
            symbol = checker.getAliasedSymbol(symbol);
        }
    } catch (e) {
        return false;
    }
    const declaration: any = symbol?.declarations?.[0]?.resolve();
    return declaration?.kind === SyntaxKind.ClassDeclaration
        && /(^|[\\/])ts[\\/]src[\\/]base[\\/]errors\.ts$/.test(declaration.getSourceFile?.()?.fileName ?? '');
};

// a local whose declared TS type is boolean-family and whose every write (D2 scan, tuples
// included) is a Boolean-or-null box; a write cycle back to a local under proof is accepted
JavaTranspiler.prototype.hx4J09BoxIdentifier = function (node, seen: Set<any>, depth: number): boolean {
    const checker: any = this.checkerOrUndefined();
    if (checker === undefined || node?.kind !== SyntaxKind.Identifier || depth > 6) {
        return false;
    }
    const symbol = checker.getSymbolAtLocation(node);
    const decl: any = symbol?.valueDeclaration?.resolve();
    if (decl === undefined || decl.name?.text !== node.text) {
        return false;
    }
    if (seen.has(decl)) {
        return true;
    }
    const next = new Set(seen);
    next.add(decl);
    const accepts = (value) => this.hx4J09BoxValue(value, next, depth + 1);
    if (decl.kind === SyntaxKind.BindingElement) {
        const pattern = decl.parent;
        const declaration = pattern?.parent;
        if (decl.initializer !== undefined || decl.dotDotDotToken !== undefined
            || pattern?.kind !== SyntaxKind.ArrayBindingPattern || declaration?.kind !== SyntaxKind.VariableDeclaration) {
            return false;
        }
        const index = pattern.elements.indexOf(decl);
        if (!this.javaBooleanBoxTupleElement(declaration.initializer, index)
            && !this.hx4J09LiteralTupleElement(declaration.initializer, index)) {
            return false;
        }
        return this.javaWritesAreBoxed(symbol, { initializer: undefined, parent: declaration }, next, accepts, true);
    }
    if (decl.kind !== SyntaxKind.VariableDeclaration) {
        return false; // parameters are boxes their callers fill
    }
    let type;
    try {
        type = this.javaTypeOfDeclaration(decl);
    } catch (e) {
        return false;
    }
    if (!this.javaBooleanBoxType(type) && !this.javaNullableBooleanDeclaration(decl)) {
        return false;
    }
    return this.javaWritesAreBoxed(symbol, decl, next, accepts, true);
};

// a value whose printed Java is a Boolean, boolean or null
JavaTranspiler.prototype.hx4J09BoxValue = function (node, seen: Set<any>, depth: number): boolean {
    if (node === undefined) {
        return false;
    }
    if (node.kind === SyntaxKind.ParenthesizedExpression || node.kind === SyntaxKind.AsExpression
        || node.kind === SyntaxKind.NonNullExpression) {
        return this.hx4J09BoxValue(node.expression, seen, depth);
    }
    if (node.kind === SyntaxKind.NullKeyword || (node.kind === SyntaxKind.Identifier && node.text === 'undefined')) {
        return true;
    }
    if (node.kind === SyntaxKind.ConditionalExpression) {
        return this.hx4J09BoxValue(node.whenTrue, seen, depth) && this.hx4J09BoxValue(node.whenFalse, seen, depth);
    }
    if (node.kind === SyntaxKind.Identifier) {
        return this.hx4J09BoxIdentifier(node, seen, depth);
    }
    if (this.javaPrintsBooleanValue(node, new Set<any>())) {
        return true;
    }
    if (node.kind !== SyntaxKind.CallExpression) {
        return false;
    }
    if (this.javaCallBooleanKind(node) !== undefined) {
        return true;
    }
    // safeBool* with a non-literal default: the accessor returns a Boolean member or the default
    const callee = node.expression;
    if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) {
        return false;
    }
    const at = JAVA_THIS_BOOLEAN_BOX_METHODS[String(callee.name.text)];
    if (at === undefined || this.javaBooleanValueKind(node) === undefined || !this.javaCalleeResolves(node)) {
        return false;
    }
    const declaration: any = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
    if (declaration?.name?.text !== callee.name.text
        || !JAVA_THIS_RETURN_TYPES_BASE_FILE.test(declaration.getSourceFile?.()?.fileName ?? '')) {
        return false;
    }
    const fallback = node.arguments?.[at];
    return fallback !== undefined && this.hx4J09BoxValue(fallback, seen, depth);
};

// element `index` of a base-tier `this.m(..)` whose every return is an array literal with a
// Java boolean at that position (`handlePostOnly`: `[ true, p ]` / `[ false, p ]`)
JavaTranspiler.prototype.hx4J09LiteralTupleElement = function (node, index: number): boolean {
    if (node?.kind !== SyntaxKind.CallExpression || index < 0) {
        return false;
    }
    const callee = node.expression;
    if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) {
        return false;
    }
    let declaration: any;
    try {
        declaration = this.getChecker().getResolvedSignature(node)?.declaration?.resolve();
    } catch (e) {
        return false;
    }
    if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body === undefined
        || declaration.name?.text !== callee.name.text
        || !JAVA_THIS_RETURN_TYPES_BASE_FILE.test(declaration.getSourceFile?.()?.fileName ?? '')) {
        return false;
    }
    let returns = 0;
    let ok = true;
    const scan = (current: Node) => {
        if (!ok || (current !== declaration && isFunctionLike(current))) {
            return;
        }
        if (isReturnStatement(current)) {
            returns++;
            const value: any = current.expression;
            if (value === undefined || !isArrayLiteralExpression(value)
                || !this.javaPrintsBooleanValue(value.elements[index], new Set<any>())) {
                ok = false;
                return;
            }
        }
        current.forEachChild(scan);
    };
    scan(declaration.body);
    return ok && returns > 0;
};

// `e instanceof X` on a catch variable equals Helpers.isInstance (which first unwraps a
// CompletionException/ExecutionException) when the try block cannot raise a wrapped one:
// no await, every call a synchronous base-tier accessor/thrower
JavaTranspiler.prototype.hx4J09CatchCannotWrap = function (node): boolean {
    if (node?.kind !== SyntaxKind.Identifier) {
        return false;
    }
    const checker: any = this.checkerOrUndefined();
    const decl: any = checker?.getSymbolAtLocation(node)?.valueDeclaration?.resolve();
    const clause = decl?.parent;
    const tryStatement = clause?.parent;
    if (decl?.kind !== SyntaxKind.VariableDeclaration || clause?.kind !== SyntaxKind.CatchClause
        || tryStatement?.kind !== SyntaxKind.TryStatement || tryStatement.catchClause !== clause) {
        return false;
    }
    let ok = true;
    const scan = (current: any) => {
        if (!ok) {
            return;
        }
        if (isFunctionLike(current) || current.kind === SyntaxKind.AwaitExpression || current.kind === SyntaxKind.TryStatement) {
            ok = false;
            return;
        }
        if (current.kind === SyntaxKind.CallExpression) {
            const signature: any = checker.getResolvedSignature(current);
            const declaration: any = signature?.declaration?.resolve();
            if (declaration === undefined || !isPropertyAccessExpression(current.expression)
                || !JAVA_SYNC_CALL_FILE.test(declaration.getSourceFile?.()?.fileName ?? '')
                || this.hasAsyncModifier(declaration)
                || this.isPromiseType(checker.getReturnTypeOfSignature(signature))) {
                ok = false;
                return;
            }
        }
        current.forEachChild(scan);
    };
    scan(tryStatement.tryBlock);
    return ok;
};

// core-argument conversions a declaration already proves: a const `= undefined` local is
// null; a const `x.length` local the build layer declares Integer widens to the Long slot
JavaTranspiler.prototype.hx4J09CoreArgument = function (type: string, printed: string, node): string | undefined {
    if (node === undefined || !isIdentifier(node) || printed !== node.text || (type !== 'Long' && type !== 'String')) {
        return undefined;
    }
    const declaration: any = this.javaDeclarationOfIdentifier(node);
    if (declaration === undefined || !isVariableDeclaration(declaration) || (declaration.name as any)?.text !== node.text
        || (getCombinedNodeFlags(declaration) & NodeFlags.Const) === 0) {
        return undefined;
    }
    const initializer = declaration.initializer;
    if (initializer !== undefined && isIdentifier(initializer) && initializer.text === 'undefined') {
        return `(${type}) null`;
    }
    if (type === 'Long' && initializer !== undefined && isPropertyAccessExpression(initializer)
        && initializer.name.text === 'length' && this.javaDeclaredTypeOf(node) === 'Integer') {
        return `((long) ${printed})`;
    }
    return undefined;
};

{
    const proto: any = JavaTranspiler.prototype;
    const printCondition = proto.printCondition;
    proto.printCondition = function (node, identation) {
        const printed: string = printCondition.call(this, node, identation);
        let inner = node;
        while (inner?.kind === SyntaxKind.ParenthesizedExpression) {
            inner = inner.expression;
        }
        if (inner?.kind === SyntaxKind.Identifier && printed.trimStart().startsWith(this.FALSY_WRAPPER_OPEN)
            && this.hx4J09BoxIdentifier(inner, new Set<any>(), 0)) {
            return this.getIden(identation) + `Boolean.TRUE.equals(${this.printNode(inner, 0)})`;
        }
        return printed;
    };
    const printInstanceOfExpression = proto.printInstanceOfExpression;
    proto.printInstanceOfExpression = function (node, identation) {
        if (node.right?.kind === SyntaxKind.Identifier && this.hx4J09CcxtErrorClass(node.right)
            && this.hx4J09CatchCannotWrap(node.left)) {
            return this.getIden(identation) + `(${this.printNode(node.left, 0)} instanceof ${node.right.text})`;
        }
        return printInstanceOfExpression.call(this, node, identation);
    };
    const javaConvertToCoreType = proto.javaConvertToCoreType;
    proto.javaConvertToCoreType = function (type: string, printed: string, node) {
        return this.hx4J09CoreArgument(type, printed, node) ?? javaConvertToCoreType.call(this, type, printed, node);
    };
}

// hx4 J15: two declared numeric boxes compare by value, never by reference. Same-class integral
// boxes take Objects.equals (Helpers.isEqual's null table + toLong compare); a Double on either side
// compares doubleValue() (isEqual's toDouble: 0.0 == -0.0, NaN != NaN), other integral pairs longValue().
{
    const proto: any = JavaTranspiler.prototype;
    const printNativeEquality = proto.printNativeEqualityIfProvable;
    proto.printNativeEqualityIfProvable = function (node, leftText: string, rightText: string): string | undefined {
        const op = node?.operatorToken?.kind;
        const negated = op === SyntaxKind.ExclamationEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken;
        if (negated || op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken) {
            const left = this.javaDeclaredNumericFamily(node.left);
            const right = this.javaDeclaredNumericFamily(node.right);
            // a declared Boolean: isEqual answers false across classes and by value within Boolean
            const isBool = (n) => String(this.javaDeclaredTypeOf(n) ?? '').trim() === 'Boolean';
            if (isBool(node.left) || isBool(node.right)) {
                return `${negated ? '!' : ''}java.util.Objects.equals(${leftText}, ${rightText})`;
            }
            if (JAVA_BOXED_NUMERIC_TYPES.has(left) && JAVA_BOXED_NUMERIC_TYPES.has(right)) {
                let equal: string;
                if (left === right && left !== 'Double') {
                    equal = `java.util.Objects.equals(${leftText}, ${rightText})`;
                } else {
                    const unbox = (left === 'Double' || right === 'Double') ? 'doubleValue' : 'longValue';
                    equal = `(${leftText} == null ? ${rightText} == null : (${rightText} != null && ${leftText}.${unbox}() == ${rightText}.${unbox}()))`;
                }
                return negated ? `!${equal}` : equal;
            }
        }
        return printNativeEquality.call(this, node, leftText, rightText);
    };
}

// hx4 J16: an awaited implicit-API call (declared in ts/src/abstract/<id>.ts, body `this.request(..)`)
// hands back a fresh Jackson parse of the HTTP body: never a field map or a ws client map, whatever
// its arguments read, so J01's non-shared proof admits it as a put source.
const JAVA_J16_IMPLICIT_API_FILE = /(^|[\\/])ts[\\/]src[\\/]abstract[\\/][a-z0-9_]+\.ts$/;
{
    const proto: any = JavaTranspiler.prototype;
    const nonSharedValue = proto.javaHx4NonSharedValue;
    proto.javaHx4NonSharedValue = function (value, depth: number): boolean {
        return this.javaJ16ImplicitApiResponse(value) || nonSharedValue.call(this, value, depth);
    };
    proto.javaJ16ImplicitApiResponse = function (value): boolean {
        let node = this.unwrapPrintTransparentExpression(value);
        if (node?.kind !== SyntaxKind.AwaitExpression) {
            return false;
        }
        node = this.unwrapPrintTransparentExpression(node.expression);
        if (node === undefined || !isCallExpression(node) || !isPropertyAccessExpression(node.expression)
            || node.expression.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        let declaration: any;
        try {
            declaration = this.checkerOrUndefined()?.getResolvedSignature(node)?.declaration?.resolve();
        } catch (e) {
            return false;
        }
        const fileName = declaration?.getSourceFile?.()?.fileName;
        if (typeof fileName !== 'string' || !JAVA_J16_IMPLICIT_API_FILE.test(fileName) || !declaration.body) {
            return false;
        }
        const statements = declaration.body.statements ?? [];
        const ret = statements.length === 1 && isReturnStatement(statements[0]) ? statements[0].expression : undefined;
        return ret !== undefined && isCallExpression(ret) && isPropertyAccessExpression(ret.expression)
            && ret.expression.expression.kind === SyntaxKind.ThisKeyword && ret.expression.name.text === 'request';
    };
}

// hx11 w8: `a !== b` / `a === b` where one side is a never-rewritten const read off
// `this.crc32(..)` and the other a local declared `Long`. BaseExchange.crc32 returns a Long
// box on every path, so Objects.equals (Long.equals, null-safe) is isEqual's integral branch.
const JAVA_CRC32_BASE_FILE = /(^|[\\/])ts[\\/]src[\\/]base[\\/]functions[\\/]crypto\.ts$/;
{
    const proto: any = JavaTranspiler.prototype;
    const printNativeEquality = proto.printNativeEqualityIfProvable;
    proto.javaCrc32Local = function (node): boolean {
        if (node === undefined || !isIdentifier(node)) {
            return false;
        }
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration)
            || !isIdentifier(declaration.name) || declaration.name.text !== node.text) {
            return false;
        }
        const init = this.unwrapPrintTransparentExpression(declaration.initializer);
        if (init === undefined || !isCallExpression(init) || !isPropertyAccessExpression(init.expression)
            || init.expression.expression.kind !== SyntaxKind.ThisKeyword || init.expression.name.text !== 'crc32') {
            return false;
        }
        let fileName: any;
        try {
            fileName = this.checkerOrUndefined()?.getResolvedSignature(init)?.declaration?.resolve()?.getSourceFile?.()?.fileName;
        } catch (e) {
            return false;
        }
        return typeof fileName === 'string' && JAVA_CRC32_BASE_FILE.test(fileName)
            && !this.javaLocalIsReassigned(node);
    };
    proto.printNativeEqualityIfProvable = function (node, leftText: string, rightText: string): string | undefined {
        const op = node?.operatorToken?.kind;
        const negated = op === SyntaxKind.ExclamationEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken;
        if (negated || op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken) {
            const crcLeft = this.javaCrc32Local(node.left);
            const crcRight = this.javaCrc32Local(node.right);
            if ((crcLeft && this.javaDeclaredNumericFamily(node.right) === 'Long' && leftText === node.left.text && rightText === node.right.text)
                || (crcRight && this.javaDeclaredNumericFamily(node.left) === 'Long' && leftText === node.left.text && rightText === node.right.text)) {
                return `${negated ? '!' : ''}java.util.Objects.equals(${leftText}, ${rightText})`;
            }
        }
        return printNativeEquality.call(this, node, leftText, rightText);
    };
}

// Owner-store counters. The base class keeps `this.options` single-owner, so a request-id / nonce counter that
// lives in it is ONE owner task (BaseExchange.nextCounter / nextCounterAbove) instead of a lock bracket:
//   this.lockId (); <read-modify-write of this.options[k]>; this.unlockId ()  -> Long x = this.nextCounter("k", 1L)
//   BaseExchange.incrementingNonce (): lock / compare / store / unlock         -> Long r = this.nextCounterAbove("lastNonce", 1L, c)
// Every member is proven by its checker-resolved declaration (a member of the base class), never by printed text;
// a span whose shape is not proven prints as before.
{
    const proto: any = JavaTranspiler.prototype;
    const unparen = (node: any) => {
        while (node?.kind === SyntaxKind.ParenthesizedExpression) {
            node = node.expression;
        }
        return node;
    };
    const baseMemberDecl = (java: any, node: any, name: string) => {
        if (node?.kind !== SyntaxKind.PropertyAccessExpression || node.expression?.kind !== SyntaxKind.ThisKeyword
            || node.name?.text !== name) {
            return undefined;
        }
        let decl: any;
        try {
            decl = java.checkerOrUndefined()?.getSymbolAtLocation(node.name)?.valueDeclaration?.resolve();
        } catch (e) {
            return undefined;
        }
        return decl?.parent?.name?.text === JAVA_OWNER_CLASS ? decl : undefined;
    };
    const baseCall = (java: any, node: any, name: string, args: number) => {
        node = unparen(node);
        return node?.kind === SyntaxKind.CallExpression && (node.arguments?.length ?? 0) === args
            && baseMemberDecl(java, node.expression, name) !== undefined;
    };
    const callStatement = (java: any, stmt: any, name: string) =>
        stmt?.kind === SyntaxKind.ExpressionStatement && baseCall(java, stmt.expression, name, 0);
    const constDecl = (stmt: any) => {
        const list = stmt?.kind === SyntaxKind.VariableStatement ? stmt.declarationList : undefined;
        const d = list?.declarations;
        if (d?.length !== 1 || d[0].name?.kind !== SyntaxKind.Identifier || d[0].initializer === undefined
            || (getCombinedNodeFlags(d[0]) & NodeFlags.Const) === 0) {
            return undefined;
        }
        return d[0];
    };
    const literal = (node: any) => node?.kind === SyntaxKind.StringLiteral ? node : undefined;
    // `this.options['k'] = <ident>` -> [key literal, ident name]
    const optionWrite = (java: any, stmt: any) => {
        const e = stmt?.kind === SyntaxKind.ExpressionStatement ? stmt.expression : undefined;
        if (e?.kind !== SyntaxKind.BinaryExpression || e.operatorToken?.kind !== SyntaxKind.EqualsToken) {
            return undefined;
        }
        const target = e.left;
        if (target?.kind !== SyntaxKind.ElementAccessExpression || baseMemberDecl(java, target.expression, 'options') === undefined
            || literal(target.argumentExpression) === undefined || e.right?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        return [ target.argumentExpression, e.right.text ];
    };
    // `this.safeInteger (this.options, 'k', 0)` -> the key literal
    const counterRead = (java: any, node: any) => {
        node = unparen(node);
        if (!baseCall(java, node, 'safeInteger', 3)) {
            return undefined;
        }
        const [ options, key, fallback ] = node.arguments;
        if (baseMemberDecl(java, options, 'options') === undefined || literal(key) === undefined
            || fallback?.kind !== SyntaxKind.NumericLiteral || fallback.text !== '0') {
            return undefined;
        }
        return key;
    };
    const countIdentifier = (root: any, name: string) => {
        let n = 0;
        const visit = (node: any) => {
            if (node.kind === SyntaxKind.Identifier && node.text === name) {
                n++;
            }
            node.forEachChild(visit);
        };
        visit(root);
        return n;
    };
    const sumOfOne = (java: any, call: any) => {
        call = unparen(call);
        return baseCall(java, call, 'sum', 2) && call.arguments[1]?.kind === SyntaxKind.NumericLiteral
            && call.arguments[1].text === '1' ? call : undefined;
    };
    // the statements of a lock/unlock span as one counter: [declared name, key literal] or undefined
    const counterSpan = (java: any, body: any[], fn: any) => {
        if (body.length === 2) {
            const decl = constDecl(body[0]);
            const write = optionWrite(java, body[1]);
            const sum = decl !== undefined ? sumOfOne(java, decl.initializer) : undefined;
            const key = sum !== undefined ? counterRead(java, sum.arguments[0]) : undefined;
            if (key !== undefined && write !== undefined && write[0].text === key.text && write[1] === decl.name.text) {
                return [ decl.name, key ];
            }
            return undefined;
        }
        if (body.length === 3) {
            const seed = constDecl(body[0]);
            const next = constDecl(body[1]);
            const write = optionWrite(java, body[2]);
            const key = seed !== undefined ? counterRead(java, seed.initializer) : undefined;
            const sum = next !== undefined ? sumOfOne(java, next.initializer) : undefined;
            if (key !== undefined && sum !== undefined && write !== undefined && sum.arguments[0]?.kind === SyntaxKind.Identifier
                && sum.arguments[0].text === seed.name.text && write[0].text === key.text && write[1] === next.name.text
                && countIdentifier(fn, seed.name.text) === 2) { // the seed local is read by nothing but the increment
                return [ next.name, key ];
            }
        }
        return undefined;
    };
    // `incrementingNonce` of the base class: lock, compare nonce () with the stored last nonce, store, unlock, return
    const nonceShape = (java: any, method: any) => {
        if (method?.kind !== SyntaxKind.MethodDeclaration || method.name?.text !== 'incrementingNonce'
            || method.parent?.name?.text !== JAVA_OWNER_CLASS || method.parameters?.length !== 0) {
            return undefined;
        }
        const s = method.body?.statements;
        if (s === undefined || s.length !== 7) {
            return undefined;
        }
        const current = constDecl(s[0]);
        const last = constDecl(s[2]);
        const result = constDecl(s[3]);
        const write = optionWrite(java, s[4]);
        if (current === undefined || last === undefined || result === undefined || write === undefined
            || !baseCall(java, current.initializer, 'nonce', 0) || !callStatement(java, s[1], 'lockLastNonce')
            || !callStatement(java, s[5], 'unlockLastNonce')) {
            return undefined;
        }
        const key = counterRead(java, last.initializer);
        const cond = unparen(result.initializer);
        if (key?.text !== 'lastNonce' || write[0].text !== 'lastNonce' || write[1] !== result.name.text
            || cond?.kind !== SyntaxKind.ConditionalExpression) {
            return undefined;
        }
        const compare = unparen(cond.condition);
        const plusOne = unparen(cond.whenFalse);
        const isId = (n: any, name: string) => n?.kind === SyntaxKind.Identifier && n.text === name;
        if (compare?.kind !== SyntaxKind.BinaryExpression || compare.operatorToken?.kind !== SyntaxKind.GreaterThanToken
            || !isId(compare.left, current.name.text) || !isId(compare.right, last.name.text) || !isId(cond.whenTrue, current.name.text)
            || plusOne?.kind !== SyntaxKind.BinaryExpression || plusOne.operatorToken?.kind !== SyntaxKind.PlusToken
            || !isId(plusOne.left, last.name.text) || plusOne.right?.kind !== SyntaxKind.NumericLiteral || plusOne.right.text !== '1'
            || s[6].kind !== SyntaxKind.ReturnStatement || !isId(s[6].expression, result.name.text)
            || countIdentifier(method, last.name.text) !== 3) { // the stored value is read by the compare and the increment only
            return undefined;
        }
        return { current, result };
    };
    const bare = (java: any, stmt: any) => java.printLeadingComments(stmt, 0) === '' && java.printTraillingComment(stmt, 0) === '';

    // statement -> { counter: [name, key] } | { nonce: { current, result } } | { drop: true }
    proto.javaCounterPlan = function (statements, _identation: number): Map<any, any> | undefined {
        if (statements === undefined || statements.length === 0) {
            return undefined;
        }
        let fn: any = statements[0].parent;
        while (fn !== undefined && !isFunctionLike(fn)) {
            fn = fn.parent;
        }
        if (fn === undefined) {
            return undefined;
        }
        let plan: Map<any, any> | undefined;
        const set = (stmt: any, value: any) => { (plan ??= new Map()).set(stmt, value); };
        const nonce = fn.body?.statements === statements ? nonceShape(this, fn) : undefined;
        if (nonce !== undefined) {
            for (let i = 0; i < 6; i++) {
                if (!bare(this, statements[i])) {
                    return undefined;
                }
            }
            set(statements[1], { nonce });
            for (let i = 2; i < 6; i++) {
                set(statements[i], { drop: true });
            }
        }
        for (let i = 0; i < statements.length; i++) {
            if (!callStatement(this, statements[i], 'lockId')) {
                continue;
            }
            let end = i + 1;
            while (end < statements.length && !callStatement(this, statements[end], 'unlockId')) {
                end++;
            }
            if (end >= statements.length) {
                continue;
            }
            const body = Array.from(statements).slice(i + 1, end);
            const found = counterSpan(this, body, fn);
            if (found !== undefined && body.every((st: any) => bare(this, st)) && bare(this, statements[end])) {
                set(statements[i], { counter: found });
                for (let k = i + 1; k <= end; k++) {
                    set(statements[k], { drop: true });
                }
                i = end;
            }
        }
        return plan;
    };

    proto.javaPrintBodyStatements = function (statements, identation: number): string[] {
        const plan = this.javaCounterPlan(statements, identation);
        const parts: string[] = [];
        for (const stmt of statements) {
            const step = plan?.get(stmt);
            if (step === undefined) {
                parts.push(this.printNode(stmt, identation));
            } else if (step.counter !== undefined) {
                const [ name, key ] = step.counter;
                const line = this.getIden(identation) + `Long ${this.printNode(name, 0)} = this.nextCounter(${this.printNode(key, 0)}, 1L);`;
                parts.push(this.printNodeCommentsIfAny(stmt, identation, line));
            } else if (step.nonce !== undefined) {
                const { current, result } = step.nonce;
                const line = this.getIden(identation) + `Long ${this.printNode(result.name, 0)} = this.nextCounterAbove("lastNonce", 1L, ${this.printNode(current.name, 0)});`;
                parts.push(line);
            }
        }
        return parts;
    };
}
