import { BaseTranspiler } from "./baseTranspiler.js";
import { NodeFlags, SyntaxKind, type Expression, type Node } from "typescript/unstable/ast";
import { isArrayLiteralExpression, isArrayTypeNode, isTupleTypeNode, isArrowFunction, isAsExpression, isBinaryExpression, isBlock, isBooleanLiteral, isCallExpression, isBreakStatement, isClassDeclaration, isConditionalExpression, isContinueStatement, isElementAccessExpression, isExpressionStatement, isForInStatement, isForOfStatement, isFunctionDeclaration, isFunctionExpression, isIdentifier, isIfStatement, isMethodDeclaration, isNonNullExpression, isNumericLiteral, isObjectLiteralExpression, isParameterDeclaration, isParenthesizedExpression, isPostfixUnaryExpression, isPrefixUnaryExpression, isPropertyAccessExpression, isPropertyAssignment, isReturnStatement, isShorthandPropertyAssignment, isSourceFile, isSpreadAssignment, isSpreadElement, isStringLiteral, isStringLiteralLikeNode, isThrowStatement, isTypeAssertion, isTypeOfExpression, isTypeReferenceNode, isVariableDeclaration, isVariableDeclarationList } from "typescript/unstable/ast/is";
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
};

// hand-written base methods whose Java declaration carries a concrete numeric return type
// (BaseExchange.java: `public Long milliseconds()`), so a `this.<name>()` call holds that box on
// every path. Generated methods print `Object`; only this closed table is an arithmetic anchor.
const JAVA_THIS_RETURN_TYPES: { [name: string]: string } = {
    'milliseconds': 'long',
};

// files the table was audited against: the base class or its overload-stripped copy (build/stripOverloads.ts);
// elsewhere is a venue override printing its own signature. `extend`/`deepExtend` resolve to the generic helpers
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
    'positionsByType',
    'transformedApi',
    'urls',
    'userAgents',
]);

// public map fields of the hand-written WsClient.java: OwnerMap views over owner-thread LinkedHashMaps, so a
// read is the plain map get (null receiver/key answers null in both spellings);
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
    'positionsByType',
    'transformedApi',
]);

// printed operand text holding a Java box cast such as `(String) x` or `(Map<String, Object>) x`
const JAVA_BOX_CAST = /\((?:final\s+)?(?:[A-Z][\w.]*|(?:java|io|com)\.[\w.]+)(?:<[^()]*>)?\)/;

// class members that run on the owner executor (ws handlers); watch*/load*/setSandboxMode can write
// the same map from another thread, so a site inside them keeps the helper's monitor
const JAVA_OWNER_MEMBER_NAME = /^(?:handle[A-Z]\w*|parseWSBalances)$/;

// hand-written BaseExchange.java fields declared exactly `Map<String, Object>`: a local bound to one prints that
// type, so element reads bind the accessor with no cast. `Object` fields (currencies, fees, timeframes) are
// absent: assigning them to a Map needs a cast javaBaseMapFieldLocalType forbids.
const JAVA_DECLARED_MAP_FIELD_NAMES: Set<string> = new Set<string>([
    'markets', 'markets_by_id', 'has', 'features', 'options', 'balance',
    'tickers', 'fundingRates', 'bidsasks', 'trades', 'orderbooks', 'ohlcvs', 'positionsByType',
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

// the typed table a `method.call (this, client, message)` dispatches through: it maps each key to
// the handler's method name, and the dispatch is a switch of direct calls on that name
const JAVA_HANDLER_NAME_TYPE = 'String';
const JAVA_HANDLER_TABLE_TYPE = 'java.util.Map<String, String>';

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

// ws-tier cache calls (`x.append (v)`, `book.reset (s)`, ...): the hand-written ws classes declare these
// methods, so a receiver declared one of them binds natively; any other receiver dispatches reflectively
// Exchange.ts cache fields BaseExchange.java declares `Map<String, Object>`: Map calls bind with no receiver cast
const JAVA_BASE_DECLARED_MAP_CACHE_FIELDS: Set<string> = new Set(['tickers', 'bidsasks', 'fundingRates']);
const JAVA_WS_RECEIVER_TIER_FILE = /(^|\/)ts\/src\/(pro|prediction)\/[a-z0-9_]+\.ts$/;
const JAVA_WS_DYNAMIC_METHODS: Set<string> = new Set(['append', 'reset', 'storeArray', 'store']);
const JAVA_WS_DYNAMIC_FIELDS: Set<string> = new Set(['myTrades', 'positions', 'orders', 'trades', 'ohlcvs', 'tickers', 'orderbooks']);
// names that hold plain maps/lists or the Client, never a ws cache
const JAVA_WS_PLAIN_RECEIVERS: Set<string> = new Set(['new', 'var', 'for', 'if', 'else', 'return', 'try', 'catch', 'throw',
    'list', 'channel', 'response', 'request', 'message', 'data', 'params', 'options', 'config', 'entry', 'item', 'key', 'value',
    'client', 'exchange', 'string', 'array', 'map', 'set', 'ticker', 'trade', 'order', 'balance', 'position', 'currency', 'market']);
// methods each declared ws class binds (argument counts; `value` = callable outside statement position)
const JAVA_WS_TYPED_METHODS: { [cls: string]: { [method: string]: { argc: number[], value: boolean } } } = {
    'io.github.ccxt.ws.ArrayCache': { 'append': { argc: [1], value: false } },
    'io.github.ccxt.ws.WsOrderBook': { 'reset': { argc: [0, 1], value: false }, 'limit': { argc: [0], value: true } },
    'io.github.ccxt.ws.OrderBookSide': { 'store': { argc: [2, 3], value: false }, 'storeArray': { argc: [1], value: false }, 'limit': { argc: [0], value: false } },
};
// statement calls only one ws class declares: the reflective lookup binds exactly the cast call
const JAVA_WS_CAST_METHODS: { [method: string]: { cls: string, argc: number[] } } = {
    'append': { cls: 'io.github.ccxt.ws.ArrayCache', argc: [1] },
    'store': { cls: 'io.github.ccxt.ws.OrderBookSide', argc: [2, 3] },
    'storeArray': { cls: 'io.github.ccxt.ws.OrderBookSide', argc: [1] },
};

// TS parameter annotations (`Dict`, `Market`, `Currency`, `Str`, `OrderType`/`OrderSide`, `Bool`) print the native Java
// type on the declaring method. `Int`/`Num` stay `Object`: a TS `number` is an Integer, Long or
// Double box in generated code, so neither a `Long`/`Double` parameter nor a cast site is provable.
const JAVA_NATIVE_ALIAS_TYPES: { [name: string]: string } = {
    'Dict': 'java.util.Map<String, Object>',
    'Market': 'java.util.Map<String, Object>',
    'Currency': 'java.util.Map<String, Object>',
    'Str': 'String',
    'OrderType': 'String',
    'OrderSide': 'String',
};
const JAVA_NATIVE_PARAMETER_TYPES: { [name: string]: string } = { ...JAVA_NATIVE_ALIAS_TYPES, 'Bool': 'Boolean' };

// Java types of default-valued parameters; separate from the fixed-parameter table.
// `Num`/`Bool` stay Object: widening them changes payload strings or varargs spreading.
const JAVA_NATIVE_PARAMETER_TYPES_OPTIONAL: { [name: string]: string } = {
    ...JAVA_NATIVE_ALIAS_TYPES,
    'Int': 'Long',
    'Strings': 'java.util.List<String>',
};

// TS classes with a same-member hand-written Java class: a parameter annotated with one prints that Java type.
// Only the ws order book (exported as `OrderBook` and `WsOrderBook`, the checker keeps the class name); the
// class-declaration file below separates it from the unrelated `types.OrderBook` map.
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

// the base tier is generated too (spliced into BaseExchange.java);
// the base tiers print only the methods below this line of ts/src/base/(Prediction)Exchange.ts
const JAVA_TRANSPILE_DELIMITER = 'METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT';
// hand-written base methods whose Java runtime declares exactly the TS parameters (no varargs)
const JAVA_HANDWRITTEN_FULL_ARITY = new Set(['loadMarkets', 'fetchMarkets', 'fetchCurrencies', 'exceptionMessage']);
const JAVA_HANDWRITTEN_TIER_FILES = /(^|\/)ts\/src\/(?:base|static_dependencies)\//;
const JAVA_NATIVE_PARAMETER_BASE_FILES = /(^|[\\/])ts[\\/]src[\\/]base[\\/](Prediction)?Exchange(\.nooverloads[^/]*)?\.ts$/;

// ===== native return types =====
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
// request (`fetch`), skipping nodes the core prefetch already cached; other kinds go one by one
type JavaPrefetchFetch = (original: any, nodes: Node[]) => unknown[];
function prefetchByFile(checker: Checker, name: "getTypeAtLocation" | "getSymbolAtLocation" | "getResolvedSignature", kinds: Set<number>, fetch: JavaPrefetchFetch): void {
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
        const sf = node?.getSourceFile?.();
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
                const results = fetch(original, nodes);
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

function memoizeJavaCheckerCalls(checker: Checker): Checker {
    if ((checker as any).__javaMemoized) {
        return checker;
    }
    Object.defineProperty(checker, "__javaMemoized", { value: true });
    const byArray: JavaPrefetchFetch = (original, nodes) => original(nodes);
    prefetchByFile(checker, "getTypeAtLocation", JAVA_TYPE_PREFETCH_KINDS, byArray);
    prefetchByFile(checker, "getSymbolAtLocation", JAVA_SYMBOL_PREFETCH_KINDS, byArray);
    // getResolvedSignature has no array form: pipeline the calls through one API#batch over the checker's client
    const client = (checker as any).client;
    if (client !== undefined) {
        prefetchByFile(checker, "getResolvedSignature", new Set<number>([SyntaxKind.CallExpression]),
            (original, nodes) => API.prototype.batch.call({ client }, ...nodes.map((c) => original.gen(c))) as unknown[]);
    }
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

// more hand-written BaseExchange map fields: every write in BaseExchange.java and ts/src is a
// HashMap / ConcurrentHashMap / Map-cast or null (markets_by_id = null, urls/fees from describe())
// base fields declared Object/Map whose plain-map type is proven per source file (javaFileBuiltMapField)
const JAVA_FILE_BUILT_MAP_FIELDS: Set<string> = new Set(['markets', 'positions']);

const JAVA_HASH_MAP_FIELDS: { [name: string]: true } = {
    'tickers': true,
    'bidsasks': true,
    'trades': true,
    'positionsByType': true,
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

// isTrue / isInstance / toLongOrNull / toStringArg go native on proven operands. A non-Promise call resolving to a
// base-tier accessor/thrower (Exchange.ts, base/functions mixins) or a lib.*.d.ts built-in runs synchronously:
// it prints no `.join()`, so it cannot raise a CompletionException.
const JAVA_SYNC_CALL_FILE = /(^|[\\/])ts[\\/]src[\\/]base[\\/](functions[\\/][^\\/]+|Exchange(\.nooverloads\.\d+)?)\.ts$|(^|[\\/])lib\.[^\\/]*\.d\.ts$/;

// ts/src/abstract/<id>.ts: the implicit-API declarations
const JAVA_IMPLICIT_API_FILE = /(^|[\\/])ts[\\/]src[\\/]abstract[\\/][a-z0-9_]+\.ts$/;
// ts/src/base/functions/crypto.ts: the crc32 the hand-written BaseExchange boxes as Long
const JAVA_CRC32_BASE_FILE = /(^|[\\/])ts[\\/]src[\\/]base[\\/]functions[\\/]crypto\.ts$/;

// unwrap `( ... )` around an expression
function unwrapParens(node: any): any {
    while (node?.kind === SyntaxKind.ParenthesizedExpression) {
        node = node.expression;
    }
    return node;
}

// ---- owner-store counter shapes (see javaCounterPlan) ----
const baseMemberDecl = (java: any, node: any, name: string) => {
    if (node?.kind !== SyntaxKind.PropertyAccessExpression || node.expression?.kind !== SyntaxKind.ThisKeyword
        || node.name?.text !== name) {
        return undefined;
    }
    const decl: any = java.javaTry(() => java.checkerOrUndefined()?.getSymbolAtLocation(node.name)?.valueDeclaration?.resolve());
    return decl?.parent?.name?.text === JAVA_OWNER_CLASS ? decl : undefined;
};
const baseCall = (java: any, node: any, name: string, args: number) => {
    node = unwrapParens(node);
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
    node = unwrapParens(node);
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
    call = unwrapParens(call);
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
    const cond = unwrapParens(result.initializer);
    if (key?.text !== 'lastNonce' || write[0].text !== 'lastNonce' || write[1] !== result.name.text
        || cond?.kind !== SyntaxKind.ConditionalExpression) {
        return undefined;
    }
    const compare = unwrapParens(cond.condition);
    const plusOne = unwrapParens(cond.whenFalse);
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

export class JavaTranspiler extends BaseTranspiler {
    // ===== instance state and caches =====
    // override lookups repeat per method on every printed call and hook; the answer is fixed per node
    private methodOverrideCache = new WeakMap<Node, Node | typeof JAVA_MEMO_UNDEFINED>();
    // BaseTranspiler.getMethodOverride answered from a per-class ancestor chain of
    // name -> last method maps (the furthest ancestor declaring the name wins, as there)
    private overrideChainCache = new WeakMap<Node, Map<string, Node>[] | null>();
    private javaFieldAssignmentKindsCache = new WeakMap<object, Map<string, string[]>>();
    // optional proof of the concrete printed Java type of an expression, installed by the embedding
    // build layer for the locals it retypes (ccxt: build/java-local-types.js); it must match the
    // declared type or the operator will not compile. Only `String` is consumed (native `+` anchor).
    javaExpressionTypeResolver?: (node) => string | undefined;
    // optional proof, installed by the embedding build layer, that a local's final printed declaration
    // is the nullable box `Long <name> = `; consumed only by the `x + <int literal>` null-propagating add.
    javaBoxedLongResolver?: (node) => boolean;
    private _baseExchangeMethodsByName = new WeakMap<object, Map<string, any[]>>();
    binaryExpressionsWrappers;
    varListFromObjectLiterals = {};
    // binary operators whose printed Java is a primitive boolean: Helpers.isEqual (and the
    // negated `!Helpers.isEqual` / `<` / `>` / `<=` / `>=` family), Helpers.inOp,
    // Helpers.isInstance and the native `&&` / `||`
    javaBooleanOperators = Array.from(JAVA_BOOLEAN_OPERATOR_KINDS);
    // per-function analyzeFinalVars results, consumed while printing that function body
    usageToFinalName: WeakMap<Node, string> = new WeakMap();
    // emitted-finalName sets, one per enclosing block: buildFinalVarDeclarations skips a name an ancestor declared
    finalVarScopeStack: Array<Set<string>> = [];
    // identifiers rewritten in place to their finalXxx name during the current emit; undone when it
    // ends, since the cached SourceFile is reused and a second emit would no longer resolve `x`
    finalVarMutations: Array<{ node: any; text: any; ownGetFullText: boolean; getFullText: any }> = [];
    // second supplyAsync argument for async methods ('' = the common-pool single-argument form)
    asyncExecutor = '';
    // static method emitted in place of CompletableFuture.supplyAsync (it owns the executor choice)
    asyncSupplier = '';
    // regex over source file names whose async methods print a sync core plus a one-line wrapper ('' = off)
    asyncCoreSplit = '';
    javaAsyncCores: Map<any, { name: string; coreBody: string; wrapperBody: string }> = new Map();
    // typed ws handler tables: `const methods = { 'ticker': this.handleTicker }` and its single
    // `method.call (this, client, message)` read are proven together (method references + virtual call)
    javaHandlerTables: Map<any, any> = new Map();
    javaHandlerCalls: Map<any, any> = new Map();
    javaHandlerReads: Set<string> = new Set();
    javaHandlerScannedFiles: WeakSet<object> = new WeakSet();
    javaCheckedBoxLocalTypeCache: WeakMap<Node, string | typeof JAVA_MEMO_UNDEFINED> = new WeakMap();
    javaLongLimitLiteralLocalCache: WeakMap<Node, boolean> = new WeakMap();
    javaHandBackVisiting = new Set<any>();
    javaVenueCalleeInProgress: Set<Node> = new Set();
    javaVenueCalleeDeclarations: WeakMap<Node, Node> = new WeakMap();
    // javaOptionalParameterType walks the heritage chain, and every element access consults it
    javaOptionalParameterTypeCache: WeakMap<Node, string | typeof JAVA_MEMO_UNDEFINED> = new WeakMap();
    // method declarations (first per name) of the `Exchange` class of ts/src/base/Exchange.ts, read off the
    // program the warp ran on. A prediction venue's method with one of these names overrides
    // the tier body javaTranspiler.ts injects into PredictionExchange.java.
    private _exchangeTierMethods: Map<string, any> | undefined = undefined;
    // the names the enclosing method body assigns with a compound operator (`x += ..`),
    // by method node; a plain assignment is handled by javaParameterAssignmentCast
    javaMethodAssignedNames: WeakMap<Node, Set<string>> = new WeakMap();
    // memo/cycle guard for javaNativeReturnType (mutually recursive return chains)
    javaReturnTypeCache: WeakMap<Node, string | undefined> = new WeakMap();
    javaReturnTypeInProgress: Set<Node> = new Set();
    // the build layer answers a printed local's type from what THIS worker has printed so far, so
    // an unproven answer may only be provisional: caching it freezes the first worker's view
    javaReturnTypeUsedDeclaredLocals = false;
    // whole-repo facts about a method name one program cannot show, answered by the build layer: ts/src
    // declaration count, non-call mentions, hand-written Java mentions, and the arguments of every
    // `this.name (..)` call outside `ownFile`. With no consumer installed nothing changes.
    javaRepoMethodUses: ((name: string, ownFile: string) => { declared: number, mentions: number, handWritten: boolean, calls: Node[][] } | undefined) | undefined;
    // every `this.<name> (..)` call expression of a source file, collected once per file
    private javaThisCallIndex = new WeakMap<object, Map<string, any[]>>();
    // The declared Java type of a local is known to the pass that rewrites the declaration
    // text (build/java-local-types.js): it records every local it typed here. Reads consult
    // it; with no consumer installed the table is empty and every read keeps the helper.
    javaDeclaredLocalTypeResolver: ((declaration: Node) => string | undefined) | undefined;
    // the type the embedding layer's destructuring pass gave a `const [ a, p ] = ...` element
    javaBindingElementTypeResolver: ((declaration: Node) => string | undefined) | undefined;
    // BaseExchange.java single-owner store fields (`options = new SynchronizedOptions ()`) whose
    // `put(key, null)` removes the key like the helper's element write; named by the build layer
    // from the hand-written header, empty = every site keeps the helper.
    javaOwnerStoreFields: ReadonlySet<string> = new Set<string>();
    // `this.<owner store>` keys the hand-written base hands over through an owner field instead
    // of a store entry (loadMarketsHelper sets it, the same chain clears it). Value = [accessor with a
    // null default, accessor with an empty-map default]; filled by the build layer from the header.
    javaOwnerStoreHandoffs: { [key: string]: [string, string] } = {};
    // BaseExchange.java fields declared `Map<String, Object> f = new HashMap<>()` that the header only
    // ever reassigns to a fresh HashMap: `m.put(k, v)` stores a null value like the helper does.
    // Named by the build layer from the header; empty = every site keeps the helper.
    javaPlainCacheFields: ReadonlySet<string> = new Set<string>();
    // every `public Map<String, Object> f` field of the hand-written BaseExchange.java header, named by
    // the build layer; empty = every nested describe () read keeps the helper.
    javaHeaderMapFields: ReadonlySet<string> = new Set<string>();
    // describe () literal of the class: root field -> nested object literals (a non-object value is a leaf)
    javaDescribeTreeCache: WeakMap<object, any> = new WeakMap<object, any>();
    // a literal-defaulted parameter is read as `Objects.requireNonNullElse(x, <default>)`: a dynamic
    // caller pads omitted slots with null, and the parameter stays final with no local copy
    javaDefaultedLocalNames: Map<any, string> = new Map();
    // `file:method` of every async method whose body reassigns a parameter (unsupported in Java lambdas)
    javaReassigningMethods: string[] = [];
    // the embedding build turns a reassigned async parameter into a hard transpile error
    javaStrictEffectivelyFinal = false;
    // ---- typed String slice / replaceAll ----
    // integral printed types only: the helper's toInt truncation has no native analogue for a double
    javaIntegralDeclaredTypes: Set<string> = new Set(['long', 'int', 'short', 'byte', 'Long', 'Integer', 'Short', 'Byte']);
    // the native slice reads a bound up to three times: a longer line would pass the 400-char audit
    javaTypedSliceMaxLength = 300;
    csModifiers = {};
    // literals printed as `Helpers.newMap(k, v, ...)` (no anonymous class, so no capture rule)
    builderObjectLiterals: WeakSet<Node> = new WeakSet();
    javaNonSharedSourceVerdicts = new WeakMap<any, boolean>();
    javaMapSourceInProgress = new Set<any>();

    // ===== configuration, checker access and node printing entry points =====
    getChecker(): Checker {
        return memoizeJavaCheckerCalls(super.getChecker());
    }

    // the declaration (or its source file name) of the signature a call resolves to; pass `this.getChecker()` to throw outside a context
    javaCalleeDeclaration(node: any, checker: Checker | undefined = this.checkerOrUndefined()): any {
        return checker?.getResolvedSignature(node)?.declaration?.resolve();
    }

    javaCalleeFileName(node: any, checker: Checker | undefined = this.checkerOrUndefined()): string | undefined {
        return this.javaCalleeDeclaration(node, checker)?.getSourceFile?.()?.fileName;
    }

    checkerOrUndefined(): Checker | undefined {
        const checker = super.checkerOrUndefined();
        return checker === undefined ? undefined : memoizeJavaCheckerCalls(checker);
    }

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
        this.asyncCoreSplit = config['asyncCoreSplit'] ?? '';
    }

    initConfig() {
        this.LeftPropertyAccessReplacements = {};
        // Java list/string methods (lowerCamelCase)
        this.RightPropertyAccessReplacements = {
            push: "add", indexOf: "indexOf", toUpperCase: "toUpperCase", toLowerCase: "toLowerCase", toString: "toString",
        };
        this.FullPropertyAccessReplacements = {
            "JSON.parse": "parseJson",
            "console.log": "System.out.println",
            "Number.MAX_SAFE_INTEGER": "Long.MAX_VALUE",
            "Math.min": "Math.min", "Math.max": "Math.max", "Math.log": "Math.log",
            "Math.abs": "Math.abs", "Math.floor": "Math.floor", "Math.pow": "Math.pow",
        };
        this.CallExpressionReplacements = { 'parseInt': "Helpers.parseInt", "parseFloat": "Helpers.parseFloat" };
        this.ReservedKeywordsReplacements = {
            string: "str", object: "obj", params: "parameters", internal: "intern", event: "eventVar",
            fixed: "fixedVar", final: "finalVar", native: "nativeVar",
        };
        this.VariableTypeReplacements = {
            string: "String", Str: "String", number: "double", Int: "long", Num: "double",
            Dict: "java.util.Map<String, Object>", Strings: "java.util.List<String>", List: "java.util.List<Object>",
            boolean: "boolean", object: "Object",
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

    printNumericLiteral(node) {
        const javaMax = 2147483647;
        const nodeText = node.text;
        if (Number(nodeText) > javaMax && Number.isInteger(Number(nodeText)) && node.text.indexOf('e') === -1) {
            return `${nodeText}L`;
        }
        return node.text;
    }

    printIdentifier(node) {
        const idValue = this.getOriginalVarName(node.text);
        if (idValue === "undefined") {
            return this.UNDEFINED_TOKEN;
        }
        const defaulted = this.javaDefaultedLocalName(node);
        if (defaulted !== undefined) {
            return defaulted;
        }
        // class references print `X.class`; the syntactic parent checks run first to skip the checker lookup
        const parent = node?.parent;
        const isLeftSide = parent?.name === node || parent?.left === node;
        if (!isLeftSide && parent?.kind !== SyntaxKind.PropertyAccessExpression && parent?.kind !== SyntaxKind.ElementAccessExpression
            && parent?.kind !== SyntaxKind.ThrowStatement && parent?.kind !== SyntaxKind.NewExpression) {
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

    printConstructorDeclaration(node, identation) {
        const classNode = node.parent;
        const className = this.printNode(classNode.name, 0);
        const args = this.printMethodParameters(node);
        const constructorBody = this.printFunctionBody(node, identation);
        return this.getIden(identation) + className + "(" + args + ")" + constructorBody;
    }

    printNode(node, identation = 0): string {
        if (node && node.kind === SyntaxKind.SourceFile) {
            // per-file state that influences emitted text outlives a transpile call (instance
            // and SourceFile are reused): reset it so every emit of an input is identical
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

    // ===== method overrides, heritage chains and override bridges =====
    getMethodOverride(node: Node): Node {
        if (node === undefined || node === null) {
            return super.getMethodOverride(node);
        }
        return this.javaMemo(this.methodOverrideCache, node, () => this.javaMethodOverrideFromIndex(node));
    }

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

    // the implementation declaration of a resolved method (an overload signature has no body)
    javaMethodImplementation(declaration) {
        if (declaration === undefined || !isMethodDeclaration(declaration)) {
            return undefined;
        }
        if (declaration.body !== undefined) {
            return declaration;
        }
        return this.javaTry(() => {
            const symbol = this.getChecker().getSymbolAtLocation(declaration.name);
            return symbol?.declarations?.map((d) => d.resolve()).find((d) => isMethodDeclaration(d) && d.body !== undefined);
        });
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

    baseExchangeMethodsByName(): Map<string, any[]> {
        const program = this.getProgram();
        return this.javaMemo(this._baseExchangeMethodsByName, program, () => this.javaBaseExchangeMethods(program));
    }

    javaBaseExchangeMethods(program): Map<string, any[]> {
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
        return names;
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
        let ancestor = this.javaTry(() => this.getMethodOverride(node));
        while (ancestor !== undefined) {
            if (this.hasDefaultedTail(ancestor)) {
                const ancestorTypes = this.javaCoreParameterTypes(ancestor);
                const key = ancestorTypes.map((t) => this.javaErasure(t)).join(',');
                if (key !== ownKey && !seen.has(key)) {
                    seen.add(key);
                    out += this.printOverrideBridge(node, ancestor, ancestorTypes, ownTypes, identation);
                }
            }
            ancestor = this.javaTry(() => this.getMethodOverride(ancestor));
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

    exchangeTierMethods(): Map<string, any> {
        if (this._exchangeTierMethods !== undefined) {
            return this._exchangeTierMethods;
        }
        const names = new Map<string, any>();
        try {
            const program = this.getProgram();
            const fileName = program.getSourceFileNames().find((f) => JAVA_NATIVE_PARAMETER_BASE_FILES.test(f));
            const file = fileName !== undefined ? program.getSourceFile(fileName) : undefined;
            this.javaTreeSome(file, (node) => {
                if (isClassDeclaration(node) && node.name?.text === 'Exchange') {
                    for (const member of node.members) {
                        const key = (member as any).name?.getText().trim();
                        if (isMethodDeclaration(member) && key !== undefined && !names.has(key)) {
                            names.set(key, member);
                        }
                    }
                }
                return undefined;
            });
        } catch (e) {
            // no program yet: the heritage walk above already answered
        }
        this._exchangeTierMethods = names;
        return names;
    }

    // ===== call expressions, call arguments and core-type conversions =====

    printArgsForCallExpression(node, identation) {
        const fullArity = this.javaFullArityArguments(this.javaFullArityCallee(node), node.arguments ?? [], identation);
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
            // the trailing nullish may only be dropped in the OPTIONAL tail of the resolved
            // signature: an explicit undefined for a required parameter keeps the arity
            let inOptionalTail = false;
            if (isNullish) {
                const signature = this.getChecker().getResolvedSignature(node);
                const declaration: any = signature?.declaration?.resolve();
                if (declaration !== undefined) {
                    // parameters with no default, no question token and no rest are required positionally
                    inOptionalTail = args.length > (declaration.parameters ?? [])
                        .filter((p) => p.initializer === undefined && p.questionToken === undefined && p.dotDotDotToken === undefined).length;
                }
            }
            if (isNullish && inOptionalTail) {
                // drop one trailing nullish: a bare trailing null is ambiguous to javac against
                // `Object... optionals`, and the helpers treat a null and an empty varargs alike
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
        return args.map((a, i) => this.javaCheckcastArgument(a, this.printNode(a, identation).trim(), parameterTypes[i])).join(", ");
    }

    // an argument into a slot printed with the native `type`; the checkcast carries its own
    // parentheses: a bare `(T) cond ? a : b` binds the condition, not the whole argument
    javaCheckcastArgument(arg, printed: string, type: string | undefined): string {
        return type === undefined || this.javaNativeArgumentAlreadyTyped(arg, type) ? printed : `(${type}) (${printed})`;
    }

    javaHasOptionalParameter(method): boolean {
        return (method?.parameters ?? []).some((p) => p.initializer !== undefined || p.questionToken !== undefined);
    }

    // the printed method a non-super `x.m(..)` call resolves to
    javaFullArityCallee(node) {
        const callee = node.expression;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression
            || callee.expression?.kind === SyntaxKind.SuperKeyword) {
            return undefined;
        }
        return this.javaTry(() => this.javaMethodImplementation(this.javaCalleeDeclaration(node, this.getChecker()))
            ?? this.javaAnyReceiverBaseMethod(callee));
    }

    // a printed method with optional parameters whose every parameter the arguments can fill positionally
    javaFullArityFits(method, args): boolean {
        if (!this.javaIsPrintedMethod(method) || !this.javaHasOptionalParameter(method)) {
            return false;
        }
        const params = method.parameters;
        return args.length <= params.length && !params.some((p) => p.dotDotDotToken !== undefined)
            && !args.some((a) => a.kind === SyntaxKind.SpreadElement);
    }

    // a call into a printed method with optional parameters passes every parameter: omitted or
    // `undefined` slots take the TS default, fixed slots keep the native checkcast
    javaFullArityArguments(method, args, identation): string | undefined {
        if (!this.javaFullArityFits(method, args)) {
            return undefined;
        }
        const params = method.parameters;
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
            return this.javaCheckcastArgument(arg, printed, this.javaNativeParameterType(p));
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
        const method = this.javaMethodImplementation(this.javaReferencedDeclaration(reference));
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
        const declaration = this.javaTry(() => this.javaMethodImplementation(this.javaCalleeDeclaration(node, this.getChecker())));
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
        const declaration = this.javaTry(() => this.getChecker().getSymbolAtLocation(arg)?.valueDeclaration?.resolve());
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
    // core-argument conversions a declaration already proves: a const `= undefined` local is
    // null; a const `x.length` local the build layer declares Integer widens to the Long slot
    javaCoreArgument(type: string, printed: string, node): string | undefined {
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
        // a const int literal the build layer declared Integer: a non-null box, Long.valueOf widens it
        const literal = initializer !== undefined && isPrefixUnaryExpression(initializer) && initializer.operator === SyntaxKind.MinusToken
            ? initializer.operand : initializer;
        if (type === 'Long' && literal !== undefined && isNumericLiteral(literal) && /^\d+$/.test(literal.text)
            && this.javaDeclaredTypeOf(node) === 'Integer') {
            return `Long.valueOf(${printed})`;
        }
        return undefined;
    }

    // the Long core slot an argument lands in: the printed method's defaulted parameter the
    // full-arity call path converts with javaConvertToCoreType
    javaArgumentFeedsLongCoreSlot(arg): boolean {
        const call: any = arg.parent;
        if (call === undefined || !isCallExpression(call) || !call.arguments.includes(arg)) {
            return false;
        }
        const method = this.javaFullArityCallee(call);
        if (!this.javaFullArityFits(method, call.arguments)) {
            return false;
        }
        const i = call.arguments.indexOf(arg);
        return method.parameters[i].initializer !== undefined && this.javaCoreParameterTypes(method)[i] === 'Long';
    }

    // `const x = <int literal>` whose every use is an argument into a Long core slot: the
    // declaration carries the Long box the slot takes (Helpers.toLongOrNull of an Integer is the
    // same Long value), so the arguments pass the local itself
    javaLongLimitLiteralLocal(declaration): boolean {
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || (declaration.parent as any)?.declarations?.length !== 1
            || declaration.parent?.parent?.kind === SyntaxKind.ForStatement) {
            return false;
        }
        const intLiteral = (n) => n !== undefined && isNumericLiteral(n) && /^\d+$/.test(n.text) && this.printNumericLiteral(n) === n.text;
        if (!intLiteral(declaration.initializer)) {
            return false;
        }
        const scope = this.javaEnclosingFunction(declaration);
        const checker: any = this.checkerOrUndefined();
        if (scope === undefined || checker === undefined) {
            return false;
        }
        const name = declaration.name.text;
        const symbol = checker.getSymbolAtLocation(declaration.name);
        if (symbol === undefined) {
            return false;
        }
        let fed = false;
        const rejected = this.javaTreeSome(scope, (n) => {
            if (!isIdentifier(n) || n === declaration.name || n.text !== name || checker.getSymbolAtLocation(n) !== symbol) {
                return undefined;
            }
            const parent: any = n.parent;
            let ok = true;
            if (this.javaArgumentFeedsLongCoreSlot(n)) {
                fed = true;
            } else if (isBinaryExpression(parent) && parent.left === n) {
                // a later write: another int literal (printed with the L suffix)
                ok = parent.operatorToken.kind === SyntaxKind.EqualsToken && intLiteral(parent.right);
            } else {
                // `m[k] = Math.min(x, local)`: the helper hands back one of its operands as a
                // serialized map value, where an Integer and a Long box serialize the same
                const call: any = parent;
                const write: any = call?.parent;
                ok = isCallExpression(call) && call.arguments.includes(n) && call.arguments.length === 2
                    && isPropertyAccessExpression(call.expression) && isIdentifier(call.expression.expression)
                    && call.expression.expression.text === 'Math' && call.expression.name.text === 'min'
                    && isBinaryExpression(write) && write.right === call && write.operatorToken.kind === SyntaxKind.EqualsToken
                    && isElementAccessExpression(write.left);
            }
            return !ok;
        });
        return !rejected && fed;
    }

    javaLongLimitLiteralLocalCached(declaration): boolean {
        if (declaration === undefined || !isVariableDeclaration(declaration)) {
            return false;
        }
        return this.javaMemo(this.javaLongLimitLiteralLocalCache, declaration, () => this.javaTry(() => this.javaLongLimitLiteralLocal(declaration), false));
    }

    javaConvertToCoreType(type: string, printed: string, node): string {
        const proven = this.javaCoreArgument(type, printed, node);
        if (proven !== undefined) {
            return proven;
        }
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
            const declared = () => this.javaDeclaredTypeOf(element);
            const proven = element !== undefined && element.kind !== SyntaxKind.NullKeyword && !this.javaIsUndefinedLiteral(element)
                && (this.javaArgumentHasType(element, 'String') || JAVA_DECLARED_STRING_TYPE.test(declared() ?? '')
                    || this.javaProvableString(element));
            if (!proven) {
                return undefined;
            }
            elements.push(this.printNode(element, 0));
        }
        return `new java.util.ArrayList<String>(java.util.Arrays.asList(${elements.join(', ')}))`;
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
        const parameters = (this.javaReferencedDeclaration(reference) as any)?.parameters;
        return parameters === undefined ? undefined : this.javaArgumentNativeTypes(node, parameters, 1);
    }

    // a statement `this.spawn(this.m, a..)` into a printed async method is `this.m(a..)`: the method
    // already hands its body to the async supplier and returns at once, so the spawn lambda adds nothing
    javaSpawnAsyncDirectCall(node, identation): string | undefined {
        const callee = node.expression;
        if (!isExpressionStatement(node.parent) || callee?.kind !== SyntaxKind.PropertyAccessExpression
            || callee.expression?.kind !== SyntaxKind.ThisKeyword || callee.name?.text !== 'spawn') {
            return undefined;
        }
        const args = node.arguments ?? [];
        const reference = args[0];
        if (reference?.kind !== SyntaxKind.PropertyAccessExpression || reference.expression?.kind !== SyntaxKind.ThisKeyword
            || args.some((a) => a.kind === SyntaxKind.SpreadElement)) {
            return undefined;
        }
        const method = this.javaMethodImplementation(this.javaReferencedDeclaration(reference));
        // base-tier targets are excluded: the build layer swaps some for hand-written sync bodies
        if (method === undefined || !this.javaIsPrintedMethod(method) || !this.hasAsyncModifier(method)
            || /(^|\/)ts\/src\/base\//.test(method.getSourceFile().fileName.replace(/\\/g, '/'))
            || ((method as any).modifiers ?? []).some((m) => m.kind === SyntaxKind.StaticKeyword)) {
            return undefined;
        }
        const rest = args.slice(1);
        const types = this.javaSpawnCallParameterTypes(node) ?? [];
        const forwarded = this.javaFullArityArguments(method, rest, identation)
            ?? rest.map((a, i) => this.javaCheckcastArgument(a, this.printNode(a, identation).trim(), types[i + 1])).join(', ');
        return `this.${this.transformMethodNameIfNeeded(reference.name.text)}(${forwarded})`;
    }

    // the declaration a `this.m` reference names (value declaration first)
    javaReferencedDeclaration(reference) {
        return this.javaTry(() => {
            const symbol = this.getChecker().getSymbolAtLocation(reference.name);
            return symbol?.valueDeclaration?.resolve() ?? symbol?.declarations?.[0]?.resolve();
        });
    }

    // per argument of the call, the native type of the parameter `offset` slots before it
    javaArgumentNativeTypes(node, parameters, offset: number): (string | undefined)[] {
        return (node.arguments ?? []).map((a, i) => {
            const param = i < offset ? undefined : parameters[i - offset];
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
        // ral-84j1: an element-read local the embedding layer declares with the parameter's json-box type
        if (type === JAVA_NATIVE_RETURN_MAP_TYPE && isIdentifier(arg)
            && String(this.javaDeclaredElementLocalType(arg, arg.text) ?? '').replace(/\s+/g, '').replace(/^java\.util\./, '') === 'Map<String,Object>') {
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
        // ral-84j1: an element-read local the embedding layer declares a Java String
        return this.javaProvableString(arg) || (isIdentifier(arg) && this.javaDeclaredStringElementLocal(arg, arg.text));
    }

    // the native printed type of each argument position of a call, when the resolved
    // signature declares that parameter natively
    javaNativeCallParameterTypes(node): (string | undefined)[] {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return [];
        }
        const declaration = this.javaCalleeDeclaration(node, checker);
        const parameters = (declaration as any)?.parameters;
        return parameters === undefined ? [] : this.javaArgumentNativeTypes(node, parameters, 0);
    }

    printExpressionStatement(node, identation) {
        const h30j04 = this.h30J04FieldStoreStatement(node, identation); if (h30j04 !== undefined) return h30j04;
        const handlerDispatch = this.printJavaHandlerDispatch(node.expression, identation);
        if (handlerDispatch !== undefined) {
            return this.printNodeCommentsIfAny(node, identation, handlerDispatch);
        }
        return super.printExpressionStatement(node, identation);
    }

    printCallExpression(node, identation) {
        return javaFeeTierLiteral(node) ?? this.printJavaWsReceiverCall(node, identation) ?? this.javaSpawnAsyncDirectCall(node, identation) ?? super.printCallExpression(node, identation);
    }

    printDynamicCall(node, identation) {
        // reflection helper: the Java runtime provides callDynamically(Object, String, Object[])
        const elementAccess = node.expression;
        if (elementAccess?.kind === SyntaxKind.ElementAccessExpression) {
            const parsedArg = node.arguments?.map((n) => this.printNode(n, identation).trimStart()).join(", ") ?? "";
            const target = this.printNode(elementAccess.expression, 0);
            const propName = this.printNode(elementAccess.argumentExpression, 0);
            return `${this.DYNAMIC_CALL_OPEN}${target}, ${propName}, new Object[] { ${parsedArg} })`;
        }
        return undefined;
    }

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
                    const min = expressionText === "Math.min";
                    return this.printNativeMathMinMax(node, args[0], args[1], parsedArg1, parsedArg2, min ? "min" : "max")
                        ?? `${min ? "Helpers.mathMin(" : "Helpers.mathMax("}${parsedArg1}, ${parsedArg2})`;
                }
                case "Math.pow":
                    // both arguments are Double.parseDouble results, so Helpers.mathPow always
                    // takes its Number branch and returns the same double java.lang.Math.pow does
                    return `Math.pow(Double.parseDouble(${this.javaStringBoxText(args[0], parsedArg1)}), Double.parseDouble(${this.javaStringBoxText(args[1], parsedArg2)}))`;
                }
            }
            // wrap unknown property this.X calls
            const leftSide = node.expression?.expression;
            const leftSideText = leftSide ? this.printNode(leftSide, 0) : undefined;
            if (leftSideText === this.THIS_TOKEN || leftSide.getFullText().indexOf("(this as any)") > -1) {
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

    javaThisCallsInFile(file, name: string): any[] {
        const index = this.javaMemo(this.javaThisCallIndex, file, () => {
            const calls = new Map<string, any[]>();
            this.javaTreeSome(file, (n) => {
                if (isCallExpression(n) && isPropertyAccessExpression(n.expression)
                    && n.expression.expression.kind === SyntaxKind.ThisKeyword) {
                    const key = String(n.expression.name.text);
                    calls.set(key, (calls.get(key) ?? []).concat([n]));
                }
                return undefined;
            });
            return calls;
        });
        return index.get(name) ?? [];
    }

    // the Java kind a `this.<name>(...)` call provably prints with (JAVA_THIS_RETURN_TYPES), or
    // undefined. The signature must resolve to the base tier or the Date.now lib signature of the
    // functions/time.ts mixin; a venue override prints its own (usually Object) signature.
    javaThisCallNumericKind(node): string | undefined {
        const name = this.javaThisCallName(node);
        const kind = typeof name === 'string' ? JAVA_THIS_RETURN_TYPES[name] : undefined;
        if (kind === undefined) {
            return undefined;
        }
        const declaration = this.javaCalleeDeclaration(node);
        const fileName = declaration?.getSourceFile?.().fileName;
        if (typeof fileName !== 'string') {
            return undefined;
        }
        if (!JAVA_THIS_RETURN_TYPES_BASE_FILE.test(fileName) && !JAVA_THIS_RETURN_TYPES_LIB_FILE.test(fileName)) {
            return undefined;
        }
        return kind;
    }

    // the method name of a `this.<name>(...)` call, or undefined for any other node
    javaThisCallName(node) {
        const callee = node?.kind === SyntaxKind.CallExpression ? node.expression : undefined;
        if (callee?.kind !== SyntaxKind.PropertyAccessExpression || callee.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        return callee.name?.text;
    }

    // mirrors printWrappedUnknownThisProperty: a `this.<name>(...)` call the checker cannot
    // resolve prints `Helpers.callDynamically(this, "<name>", ...)`, whose Java return is Object
    javaCalleeResolves(node): boolean {
        return this.checkerOrUndefined()?.getResolvedSignature(node)?.declaration !== undefined;
    }

    // The native Java type a parameter prints with when its TS annotation is a base/types.ts alias in
    // JAVA_NATIVE_PARAMETER_TYPES. Fixed parameters of generated-tier methods only, and every
    // declaration up the heritage chain must print the same type: Java overrides are invariant.
    javaNativeParameterType(node): string | undefined {
        const type = this.javaFixedParameterPrintedType(node);
        if (type === undefined) {
            return undefined;
        }
        // a parameter the enclosing body assigns with a compound operator keeps the box — `url += '/x'`
        // prints `url = Helpers.add(url, ..)`, whose result is an Object. A plain `x = ..` or a
        // destructuring target is cast at the write site instead (javaParameterAssignmentCast).
        if (this.javaParameterIsCompoundAssigned(node)) {
            return undefined;
        }
        try {
            const method: any = node.parent;
            const index = method.parameters.indexOf(node);
            const agrees = (m) => this.javaFixedParameterPrintedType(m.parameters?.[index]) === type;
            const override = this.getMethodOverride(method);
            if (override === undefined
                && JAVA_NATIVE_PARAMETER_PREDICTION_FILES.test(node.getSourceFile().fileName)
                && method.name !== undefined) {
                // a venue method overriding the Exchange-tier body PredictionExchange.java carries
                // must print that tier parameter's type (Java overrides are invariant)
                const tier = this.exchangeTierMethods().get(method.name.getText().trim());
                if (tier !== undefined && !agrees(tier)) {
                    return undefined;
                }
            }
            return this.javaOverridesAgree(override, agrees) ? type : undefined;
        } catch (e) {
            return undefined; // an unresolvable heritage keeps the box
        }
    }

    // `override` and every ancestor above it pass `agrees` (Java overrides are invariant)
    javaOverridesAgree(override, agrees: (method) => boolean): boolean {
        for (let m = override; m !== undefined; m = this.getMethodOverride(m)) {
            if (!agrees(m)) {
                return false;
            }
        }
        return true;
    }

    // a fixed parameter's annotation proof, else the type it inherits from the nearest ancestor that
    // names one (no heritage agreement check)
    javaFixedParameterPrintedType(node): string | undefined {
        if (node === undefined || !isParameterDeclaration(node)
            || node.initializer !== undefined || node.dotDotDotToken !== undefined) {
            return undefined;
        }
        return this.javaNativeParameterTypeOf(node)
            ?? this.javaAncestorParameterType(node, (p) => this.javaNativeParameterTypeOf(p), (m) => this.getMethodOverride(m));
    }

    // the first type `typeOf` proves for this parameter's position up the heritage chain (`next` steps one ancestor)
    javaAncestorParameterType(node, typeOf: (param) => string | undefined, next: (method) => any): string | undefined {
        const method: any = node.parent;
        const index = method?.parameters?.indexOf(node) ?? -1;
        if (index < 0) {
            return undefined;
        }
        let override = next(method);
        while (override !== undefined) {
            const baseParam = (override as any).parameters?.[index];
            const type = baseParam === undefined ? undefined : typeOf(baseParam);
            if (type !== undefined) {
                return type;
            }
            override = next(override);
        }
        return undefined;
    }

    // Default-valued parameters are real parameters of the typed core that carries the body;
    // the untyped `Object... optionalArgs` front delegates to it.
    javaOptionalParameterJavaType(node): string {
        return this.javaOptionalParameterType(node) ?? 'Object';
    }

    // a bare `params = {}` inherits the nearest ancestor's native type, dict family only (any other
    // alias pairs with a default of its own kind); the family walk still vetoes disagreeing chains
    javaInheritedOptionalParameterType(node): string | undefined {
        if (node.initializer === undefined || !isObjectLiteralExpression(node.initializer)
            || node.initializer.properties.length > 0) {
            return undefined;
        }
        const type = this.javaAncestorParameterType(node, (p) => this.javaOptionalParameterTypeOf(p),
            (m) => this.javaTry(() => this.getMethodOverride(m)));
        return type === JAVA_NATIVE_DICT_PARAMETER_TYPE ? type : undefined;
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
            const agrees = (m) => this.javaOptionalParameterFamilyAgrees(method, m, index, own);
            return this.javaOverridesAgree(this.getMethodOverride(method), agrees) ? own : undefined;
        } catch (e) {
            return undefined; // an unresolvable heritage keeps the box
        }
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
        const slot = this.javaParameterSlot(node, method, false);
        if (slot === undefined) {
            return undefined;
        }
        const { checker, type } = slot;
        const symbol = this.javaParameterAliasSymbol(node, type, checker);
        const name = symbol?.name;
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

    // Java overrides are invariant: every ancestor declaration must match the parameter count,
    // the first default-valued index and this position's type, otherwise the position stays Object.
    javaOptionalParameterFamilyAgrees(method, override, index, type: string): boolean {
        const baseParams = override?.parameters;
        if (baseParams === undefined || baseParams.length !== method.parameters.length) {
            return false;
        }
        const firstDefault = (params) => params.findIndex((p) => p.initializer !== undefined || p.questionToken !== undefined);
        if (firstDefault(baseParams) !== firstDefault(method.parameters)) {
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
        return this.javaWriteSiteSome(method.body, { write: (target, site) => same(target)
            || (isBinaryExpression(site) && isArrayLiteralExpression(target) && target.elements.some(same)) });
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

    javaParameterIsTypeofTested(node): boolean {
        const method = node.parent;
        const name = (node.name as any)?.text;
        return method?.body !== undefined && name !== undefined && this.javaTreeSome(method.body, (n) =>
            (isTypeOfExpression(n) && isIdentifier(n.expression) && n.expression.text === name) || undefined);
    }

    javaParameterIsCompoundAssigned(node): boolean {
        const method = node.parent;
        const name = (node.name as any)?.text;
        if (method?.body === undefined || name === undefined) {
            return false;
        }
        const assigned = this.javaMemo(this.javaMethodAssignedNames, method, () => {
            const names = new Set<string>();
            this.javaTreeSome(method.body, (n) => {
                if (isBinaryExpression(n) && n.operatorToken.kind !== SyntaxKind.EqualsToken
                    && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(n.operatorToken.kind)) {
                    const left = n.left;
                    if (isIdentifier(left) && left.text !== undefined) {
                        names.add(left.text as string);
                    }
                }
                return undefined;
            });
            return names;
        });
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
        const typed = this.javaNativeArgumentAlreadyTyped(right, native);
        const printed = this.printNode(right, identation);
        // the checkcast carries its own parentheses: a bare `(T) cond ? a : b` binds the condition
        const helper = { 'Long': 'Helpers.toLongOrNull', [JAVA_STRING_LIST_TYPE]: 'Helpers.toStringListArg' }[native];
        return `${leftText} = ${typed ? printed : (helper !== undefined ? `${helper}(${printed})` : `(${native}) (${printed})`)}`;
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

    // the checker and type of a parameter slot the printer declares (not hand-written, not excluded)
    javaParameterSlot(node, method, testTier: boolean): { checker: any, type: any } | undefined {
        if (!JAVA_NATIVE_PARAMETER_BASE_FILES.test(node.getSourceFile().fileName)
            && !JAVA_NATIVE_PARAMETER_GENERATED_FILES.test(node.getSourceFile().fileName) && !testTier) {
            return undefined; // a hand-written java class declares this method, not the printer
        }
        const checker: any = this.checkerOrUndefined();
        const type = checker?.getTypeAtLocation(node);
        if (type === undefined) {
            return undefined;
        }
        const excluded = JAVA_NATIVE_PARAMETER_EXCLUDED_POSITIONS[(method.name as any)?.text];
        if (excluded !== undefined && excluded.includes(method.parameters.indexOf(node))) {
            return undefined;
        }
        return { checker, type };
    }

    // the annotation proof alone, without the heritage check
    javaNativeParameterTypeOf(node): string | undefined {
        if (node === undefined || !isParameterDeclaration(node)
            || node.initializer !== undefined || node.dotDotDotToken !== undefined) {
            return undefined;
        }
        const method = node.parent;
        const testTier = JAVA_TEST_TIER_FILES.test(node.getSourceFile().fileName.replace(/\\/g, '/'));
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
        const slot = this.javaParameterSlot(node, method, testTier);
        if (slot === undefined) {
            return undefined;
        }
        const { checker, type } = slot;
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
        if (aliasType === undefined) { // a class declaration is its own proof (see javaNativeParameterClassType)
            return this.javaNativeParameterClassType(name, symbol) ?? this.javaPlainParameterTypeOf(node, type, checker);
        }
        const declaration = symbol?.declarations?.[0]?.resolve();
        const fileName = declaration?.getSourceFile?.()?.fileName;
        return JAVA_NATIVE_PARAMETER_SOURCE_FILES.test(fileName ?? '') ? aliasType : this.javaPlainParameterTypeOf(node, type, checker);
    }

    // a fixed plain `any[]` / `number[]` base-tier parameter prints `java.util.List<Object>` when the body never
    // writes it, no ancestor declares the method, the name is declared once and only called as `this.name (..)`,
    // and every caller (at least one) hands a value that prints as a bare List (no checkcast, cannot throw)
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
            && this.javaPrintsListArgument(args[position], producerDeclared));
        const listInside = internal.every((call) => {
            const arg = call.arguments?.[position];
            return arg !== undefined && !isSpreadElement(arg) && this.javaPrintsListArgument(arg);
        });
        return listOutside && listInside ? JAVA_NATIVE_RETURN_LIST_TYPE : undefined;
    }

    // an argument already printing a `java.util.List<Object>`: an array literal without spread or a base
    // list producer call (JAVA_LIST_ARGUMENT_BASE_METHODS) resolved by signature, or with `producerDeclared`
    // (no program) declared once in the repo
    javaPrintsListArgument(arg, producerDeclared?: (name: string) => boolean): boolean {
        const node = this.unwrapParenthesized(arg);
        if (isArrayLiteralExpression(node)) {
            return !node.elements.some((e) => isSpreadElement(e) || e.kind === SyntaxKind.OmittedExpression);
        }
        if (isCallExpression(node)) {
            const callee = node.expression;
            if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword
                || !JAVA_LIST_ARGUMENT_BASE_METHODS.has(String(callee.name.text))) {
                return false;
            }
            if (producerDeclared !== undefined) {
                return producerDeclared(String(callee.name.text));
            }
            return this.javaTry(() => {
                const fileName = this.javaCalleeFileName(node, this.getChecker());
                return fileName !== undefined && JAVA_LIST_ARGUMENT_BASE_FILES.test(fileName.replace(/\\/g, '/'));
            }, false);
        }
        if (producerDeclared === undefined && isIdentifier(node) && this.printNode(node, 0) === node.text) {
            const declared = this.javaDeclaredTypeOf(node);
            return declared !== undefined
                && declared.replace(/^final\s+/, '').replace(/\s+/g, '').replace(/^java\.util\./, '') === 'List<Object>';
        }
        return false;
    }

    // the Java class a class-typed annotation names: a JAVA_NATIVE_PARAMETER_CLASS_TYPES name whose
    // symbol resolves to a CLASS declaration in JAVA_NATIVE_PARAMETER_CLASS_FILES
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
        return undefined;
    }

    // unpacks one optional parameter: a pure initializer reads the varargs array natively (a null
    // array reads like an empty one, as in Helpers.getArg)
    printOptionalArgExpression(index, initializer) {
        const defaultValue = this.printNode(initializer, 0);
        if (!this.isPureInitializer(initializer)) {
            return `Helpers.getArg(optionalArgs, ${index}, ${defaultValue})`;
        }
        return `optionalArgs != null && optionalArgs.length > ${index} ? optionalArgs[${index}] : ${defaultValue}`;
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

    javaDefaultedParameterLocals(node): string[] {
        const types = this.javaCoreParameterTypes(node);
        node.parameters.forEach((param, i) => {
            // a string, number or boolean literal default (null, `undefined` and `{}` / `[]` keep the parameter)
            let value = param.initializer;
            while (value !== undefined && (isParenthesizedExpression(value) || isAsExpression(value))) {
                value = value.expression;
            }
            if (value !== undefined && isPrefixUnaryExpression(value) && value.operator === SyntaxKind.MinusToken) {
                value = value.operand;
            }
            const literal = value !== undefined && (isStringLiteralLikeNode(value) || isNumericLiteral(value)
                || value.kind === SyntaxKind.TrueKeyword || value.kind === SyntaxKind.FalseKeyword);
            if (!literal || !isIdentifier(param.name)) {
                return;
            }
            const symbol = this.javaSymbolOf(param.name);
            if (symbol === undefined) {
                return;
            }
            const name = this.printNode(param.name, 0);
            this.javaDefaultedLocalNames.set(symbol, `java.util.Objects.requireNonNullElse(${name}, ${this.javaCoreDefaultArgument(param, types[i])})`);
        });
        return [];
    }

    javaDefaultedLocalName(node): string | undefined {
        if (this.javaDefaultedLocalNames.size === 0 || isParameterDeclaration(node.parent)
            || (isPropertyAccessExpression(node.parent) && node.parent.name === node)
            || isPropertyAssignment(node.parent) && node.parent.name === node) {
            return undefined;
        }
        const symbol = this.javaTry(() => this.getChecker().getSymbolAtLocation(node));
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
        let processedParts;
        try {
            processedParts = this.javaPrintBodyStatements(bodyStatements, identation + 1);
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
                const paramName = this.printNode(param.name, 0);
                initParams.push(`Object ${paramName} = ${this.printOptionalArgExpression(i + offSetIndex, initializer)};`);
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
            if (commentPart.length > 0) {
                const commentPartString = commentPart.map((c) => this.getIden(identation + 1) + c.trim()).join("\n");
                const firstStmNoComment = bodyParts.filter((line) => !this.isComment(line)).join("\n");
                firstStatement = commentPartString + "\n" + defaultInitializers + firstStmNoComment;
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
            this.javaStashAsyncCore(node, identation, supplier, executorArg, blockOpen + "\n" + firstStatement + remainingString + "\n" + returnNull.replace(/^ {4}/, '') + blockClose, blockClose);
            const asyncBody = this.getIden(identation + 1) + `return ${supplier}(() -> {\n` +
                    insideWrappers +
                    body + "\n" +
                    returnNull +
                    this.getIden(identation + 1) + `}${executorArg});\n`;
            return blockOpen + finalWrapperVars + asyncBody + blockClose;
        }
        return blockOpen + firstStatement + remainingString + blockClose;
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

    printMethodDeclaration(node, identation) {
        const funcBody = this.printFunctionBody(node, identation); // print body first to get var reassignments filled
        // one typed signature: default-valued and `?` parameters are ordinary typed parameters
        let methodDef = this.printMethodDefinition(node, identation, (n) => this.printCoreMethodParameters(n));
        methodDef += this.javaAsyncCoreSplit(node, identation, methodDef, funcBody);
        methodDef += this.printOverrideBridges(node, identation);

        return methodDef;
    }

    // an async method prints a private sync `<name>Core` holding the body, and the public method hands it to
    // the same supplier in one line: same executor and thread; overrides and super calls resolve as before
    javaStashAsyncCore(node, identation, supplier: string, executorArg: string, coreBody: string, blockClose: string) {
        if (!isMethodDeclaration(node) || !this.asyncCoreSplit || !new RegExp(this.asyncCoreSplit).test(node.getSourceFile().fileName.replace(/\\/g, '/'))
            || (node.modifiers ?? []).some((m) => m.kind === SyntaxKind.StaticKeyword) || !isIdentifier(node.name)) {
            return;
        }
        const name = this.transformMethodNameIfNeeded(node.name.text);
        const members = (node.parent as any)?.members ?? [];
        if (members.some((m) => (m.name as any)?.text === name + 'Core')) {
            return;
        }
        const args = node.parameters.map((p) => this.printNode(p.name, 0)).join(', ');
        const wrapper = this.getIden(identation + 1) + `return ${supplier}(() -> this.${name}Core(${args})${executorArg});`;
        if (wrapper.length > 400) {
            return;
        }
        this.javaAsyncCores.set(node, { name, coreBody, wrapperBody: this.getBlockOpen(identation) + wrapper + blockClose });
    }

    javaAsyncCoreSplit(node, identation, signature: string, funcBody: string): string {
        const core = this.javaAsyncCores.get(node);
        this.javaAsyncCores.delete(node);
        const future = core === undefined ? null : new RegExp(`CompletableFuture<(.+)> ${core.name}\\(`).exec(signature);
        if (core === undefined || future === null) {
            return funcBody;
        }
        const params = this.printCoreMethodParameters(node);
        return core.wrapperBody + "\n\n" + this.getIden(identation) + `private ${future[1]} ${core.name}Core(${params})` + core.coreBody;
    }

    printMethodDefinition(node, identation, paramsPrinter = undefined) {
        const name = this.transformMethodNameIfNeeded(node.name.text);

        let returnType = this.printFunctionType(node);

        // quick fix
        if (returnType === 'java.util.concurrent.CompletableFuture') {
            returnType = 'java.util.concurrent.CompletableFuture<Object>';
        }

        // an internal (non-override) generated method whose every return already
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

    // an unwritten `boolean` / `Bool` METHOD parameter holds a Boolean or null, so `Helpers.isTrue (p)`
    // is `Boolean.TRUE.equals (p)`: the operand as printed, or undefined to keep the helper
    javaBooleanParameterBox(node): string | undefined {
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined || !isParameterDeclaration(declaration) || node.text !== (declaration.name as any)?.text
            || declaration.parent?.kind !== SyntaxKind.MethodDeclaration || this.javaParameterIsWritten(declaration)) {
            return undefined;
        }
        const type: any = this.javaTry(() => this.getChecker().getTypeAtLocation(node));
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

    // ===== native return types =====
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
        const symbol: any = this.javaTry(() => checker.getSymbolAtLocation(callee));
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
        return this.javaEveryReturn(body, (statement) => {
            const value = this.unwrapPrintTransparentExpression(statement.expression);
            return value !== undefined && (isObjectLiteralExpression(value)
                || (isCallExpression(value) && this.callAlwaysReturnsPlainHashMap(value, depth + 1)));
        });
    }

    // the declared return type must not be a class instance (those print as objects)
    // or an array (those print as Lists), so the object-literal returns above are what
    // the caller can rely on
    returnTypePrintsAsHashMap(declaration): boolean {
        return this.javaTry(() => {
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
        }, false);
    }

    // the native Map/List return a sync `this.<m> (...)` / `super.<m> (...)` call of a generated venue
    // method prints (its annotation, or printMethodDefinition's native fallback); else undefined
    javaVenueCalleeReturnType(call): string | undefined {
        if (!this.javaIsThisOrSuperCall(call)) {
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
                    declaration = this.javaCalleeDeclaration(call, this.getChecker());
                } catch (e) {
                    declaration = undefined; // a transient checker failure: one retry, then the tables decide
                }
            }
            if (declaration !== undefined) {
                this.javaVenueCalleeDeclarations.set(call, declaration);
            }
            if (declaration === undefined || declaration.kind !== SyntaxKind.MethodDeclaration
                || (declaration as any).body === undefined) {
                return undefined;
            }
            const fileName = String(declaration.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
            if (!JAVA_NATIVE_PARAMETER_GENERATED_FILES.test(fileName)) {
                return undefined;
            }
            const printed = this.javaTry(() => this.printFunctionType(declaration));
            const direct = javaVenueCalleeNativeType(printed);
            if (direct !== undefined) {
                return direct;
            }
            if (printed !== this.DEFAULT_RETURN_TYPE) {
                return undefined;
            }
            return this.javaTry(() => javaVenueCalleeNativeType(this.javaNativeReturnType(declaration)));
        } finally {
            this.javaVenueCalleeInProgress.delete(call);
        }
    }

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
        if (target === undefined || (baseTier && target !== 'Boolean' && !this.javaBaseMapReturnIsSole(node, target))) {
            return undefined;
        }
        // an override prints the base declaration's boxed signature; a Boolean base
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

    // a base-tier `: Dict` method may print its Map return when the name is declared once in ts/src,
    // overrides nothing and no hand-written Java calls it (Java return types are covariant only)
    javaBaseMapReturnIsSole(node, target: string): boolean {
        if (target !== JAVA_NATIVE_RETURN_MAP_TYPE || !isIdentifier(node.name) || typeof this.javaRepoMethodUses !== 'function') {
            return false;
        }
        const uses = this.javaTry(() => this.javaRepoMethodUses(String(node.name.text), node.getSourceFile().fileName));
        return uses !== undefined && uses.declared === 1 && uses.mentions === 0 && !uses.handWritten
            && this.javaTry(() => this.getMethodOverride(node)) === undefined;
    }

    javaNativeReturnTypeTarget(node): string | undefined {
        const type = this.javaTry(() => this.getChecker().getTypeAtLocation(node.type));
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

    // the checker type of an array annotation whose element slots are not strings. A tuple
    // annotation stays out: its slots print as Pair/List pairs the return proof cannot see.
    javaArrayReturnType(type): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined || !checker.isArrayType(type) || checker.isTupleType(type)) {
            return false;
        }
        const element = this.javaTry(() => checker.getTypeArguments(type)?.[0] ?? type.typeArguments?.[0]);
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
        return this.javaEveryReturn(method.body, (r) => r.expression !== undefined
            && this.javaExpressionPrintsType(r.expression, target));
    }

    // the carriable Map/List target every return site prints when the annotation names none
    // (a string-array or tuple annotation can only be a Map)
    javaReturnTypeFromBody(method): string | undefined {
        const candidates = (this.javaStringArrayAnnotation(method) || isTupleTypeNode(method?.type))
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
        const declaration = this.javaTry(() => this.javaCalleeDeclaration(node, this.getChecker()));
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

    // a `this.<name> (...)` / `super.<name> (...)` return is the callee's native return type
    // (fixpoint over javaNativeReturnType)
    javaReturnedCallType(node): string | undefined {
        if (!this.javaIsThisOrSuperCall(node)) {
            return undefined;
        }
        const declaration = this.javaTry(() => this.javaCalleeDeclaration(node, this.getChecker()));
        if (declaration === undefined || declaration.kind !== SyntaxKind.MethodDeclaration) {
            return undefined;
        }
        return this.javaNativeReturnType(declaration);
    }

    javaIsThisOrSuperCall(node): boolean {
        return node !== undefined && isCallExpression(node) && isPropertyAccessExpression(node.expression)
            && (node.expression.expression.kind === SyntaxKind.ThisKeyword
                || (isIdentifier(node.expression.expression) && node.expression.expression.text === 'super'));
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

    printReturnStatement(node, identation) {
        const leadingComment = this.printLeadingComments(node, identation);
        let trailingComment = this.printTraillingComment(node, identation);
        trailingComment = trailingComment ? " " + trailingComment : trailingComment;
        let exp =  node.expression;
        if (exp && exp.kind === SyntaxKind.AsExpression) {
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

    // ===== final variables, lambda captures and async wrappers =====
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

    // Resolves the names wrapping a reassigned async-method param, all based on the keyword-remapped
    // Java identifier (identifier emission routes through ReservedKeywordsReplacements too).
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

    // Assigns a version-aware finalName to every identifier inside an object literal property that
    // refers to a reassigned variable: each reassignment bumps the per-variable version, and the
    // versions used get `final<Var>`, `final<Var>_2`, ... in source order.
    analyzeFinalVars(fnBody: Node): void {
        this.usageToFinalName = new WeakMap();
        if (!fnBody) return;

        // same declaration = same lexical variable (sibling `let i` loops differ)
        const symbolIdOf = (n: any): string => {
            const decl = this.javaTry(() => {
                const sym = this.getChecker()?.getSymbolAtLocation?.(n);
                return sym?.declarations?.[0]?.resolve() ?? sym?.valueDeclaration?.resolve();
            });
            return decl ? `s:${decl.pos}:${decl.end}` : `n:${n.text}`;
        };
        const incDecOperand = (node: any) => ((node.kind === SyntaxKind.PrefixUnaryExpression || node.kind === SyntaxKind.PostfixUnaryExpression)
            && this.isIncDecOperator(node.operator) && node.operand?.kind === SyntaxKind.Identifier) ? node.operand : undefined;
        const isCapturable = (name: string | undefined) => name && name !== 'undefined' && !name.startsWith?.('null');

        // Pass 1: mirror the printer's over-broad ReassignedVars heuristic (the left identifier of any
        // binary, `=` destructured elements, ++/--) so the version bumps agree with its substitution fallback.
        const reassignedSyms = new Set<string>();
        this.javaWriteSiteSome(fnBody, { assigns: () => true, write: (target, site) => {
            const destructured = isBinaryExpression(site) && site.operatorToken.kind === SyntaxKind.EqualsToken && isArrayLiteralExpression(target);
            const targets = isIdentifier(target) ? [ target ] : destructured ? target.elements.filter((elem) => isIdentifier(elem)) : [];
            if (!isForOfStatement(site) && !isForInStatement(site)) {
                targets.forEach((elem) => reassignedSyms.add(symbolIdOf(elem)));
            }
            return false;
        } });
        // a local the printer already flagged (earlier statements / outer body) takes its substitution fallback too
        this.javaTreeSome(fnBody, (n) => {
            if (isIdentifier(n) && isCapturable(n.text) && this.ReassignedVars[this.getVarKey(n)]) {
                reassignedSyms.add(symbolIdOf(n));
            }
            return undefined;
        });
        if (reassignedSyms.size === 0) return;

        // Pass 2: source-order stream of reassign events and object-literal uses of reassigned symbols
        type Event =
            | { kind: 'reassign'; sym: string }
            | { kind: 'use'; sym: string; name: string; node: Node };
        const events: Event[] = [];
        const reassign = (n: any) => {
            const sym = symbolIdOf(n);
            if (reassignedSyms.has(sym)) {
                events.push({ kind: 'reassign', sym });
            }
        };

        const visitExprInObjLit = (n: any) => {
            if (!n) return;
            if (n.kind === SyntaxKind.Identifier) {
                const name = n.text as string;
                if (isCapturable(name)) {
                    const sym = symbolIdOf(n);
                    if (reassignedSyms.has(sym)) {
                        events.push({ kind: 'use', sym, name, node: n });
                    }
                }
            } else if (n.kind === SyntaxKind.CallExpression) {
                n.arguments?.forEach(visitExprInObjLit);
                if (n.expression?.kind === SyntaxKind.PropertyAccessExpression) {
                    visitExprInObjLit(n.expression.expression);
                }
            } else if (n.kind === SyntaxKind.ElementAccessExpression) {
                let left = n.expression;
                while (left?.kind === SyntaxKind.ElementAccessExpression) {
                    left = left.expression;
                }
                visitExprInObjLit(left);
                visitExprInObjLit(n.argumentExpression);
            } else if (n.kind === SyntaxKind.ObjectLiteralExpression) {
                n.properties?.forEach((p: any) => {
                    if (p.initializer) visitExprInObjLit(p.initializer);
                });
            } else {
                n.forEachChild(visitExprInObjLit);
            }
        };

        // walks a sibling scope (if/else branch, try/catch/finally block), then bumps every symbol used
        // inside it so each region and the code after it get distinct finalXxx names
        const walkBlockAndBump = (subNode: Node | undefined) => {
            if (!subNode) return;
            const eventsBefore = events.length;
            walk(subNode);
            for (const sym of new Set(events.slice(eventsBefore).filter((e) => e.kind === 'use').map((e) => e.sym))) {
                events.push({ kind: 'reassign', sym });
            }
        };

        const walk = (node: any) => {
            if (!node) return;

            if (node.kind === SyntaxKind.BinaryExpression &&
                this.isAssignmentOperator(node.operatorToken.kind)) {
                walk(node.right);
                if (node.left?.kind === SyntaxKind.Identifier) {
                    reassign(node.left);
                } else {
                    walk(node.left);
                }
            } else if (incDecOperand(node)) {
                reassign(node.operand);
            } else if (node.kind === SyntaxKind.ObjectLiteralExpression) {
                node.properties?.forEach((prop: any) => {
                    if (prop.initializer) {
                        visitExprInObjLit(prop.initializer);
                        walk(prop.initializer);
                    }
                });
            } else if (node.kind === SyntaxKind.IfStatement) {
                walk(node.expression);
                walkBlockAndBump(node.thenStatement);
                walkBlockAndBump(node.elseStatement);
            } else if (node.kind === SyntaxKind.TryStatement) {
                walkBlockAndBump(node.tryBlock);
                walkBlockAndBump(node.catchClause?.block);
                walkBlockAndBump(node.finallyBlock);
            } else {
                node.forEachChild(walk);
            }
        };
        walk(fnBody);

        // per-symbol versions; the name comes from the identifier text (distinct `i`s share `finalI`)
        // versions only grow per symbol, so a new version is the next `_<n>` suffix
        const counters = new Map<string, number>();
        const perSym = new Map<string, { name: string; version: number; names: number }>();
        for (const e of events) {
            if (e.kind === 'reassign') {
                counters.set(e.sym, (counters.get(e.sym) ?? 0) + 1);
                continue;
            }
            const v = counters.get(e.sym) ?? 0;
            const entry = perSym.get(e.sym) ?? { name: e.name, version: v, names: 1 };
            if (entry.version !== v) {
                entry.version = v;
                entry.names++;
            }
            perSym.set(e.sym, entry);
            const baseName = this.getFinalVarName(entry.name);
            this.usageToFinalName.set(e.node, entry.names === 1 ? baseName : `${baseName}_${entry.names}`);
        }
    }

    // the build layer still reads the (always empty) list
    restoreFinalVarMutations(): void {
        this.finalVarMutations = [];
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

    // the async method body writes one of its parameters, or a non-pure default must be applied
    // by an `if (x == null) { x = init; }` inside the lambda (both break effective finality)
    javaReassignsParameter(node): boolean {
        if ((node.parameters ?? []).some((p) => p.initializer !== undefined && !this.isPureInitializer(p.initializer) && this.isAsyncFunction(node))) {
            return true;
        }
        const symbols = new Set<any>((node.parameters ?? []).map((p) => this.javaSymbolOf(p.name)).filter((symbol) => symbol !== undefined));
        return symbols.size > 0 && node.body !== undefined && this.javaWriteSiteSome(node.body, {
            assigns: (op) => this.isAssignmentOperator(op),
            write: (target, site) => !isForOfStatement(site) && !isForInStatement(site)
                && this.javaTargetWritesSymbol(target, symbols, isBinaryExpression(site) && site.operatorToken.kind === SyntaxKind.EqualsToken),
        });
    }

    // write-scan walker: `rule.write(target, site)` sees the left side of each assignment whose operator
    // passes `rule.assigns` (default JAVA_ASSIGNMENT_OPERATOR_KINDS), each `++`/`--` operand and each
    // for-of/in initializer; `rule.node` sees every node first; a true answer stops the walk
    javaWriteSiteSome(root, rule: { write: (target, site) => boolean, assigns?: (op) => boolean, node?: (n) => boolean }): boolean {
        const assigns = rule.assigns ?? ((op) => JAVA_ASSIGNMENT_OPERATOR_KINDS.has(op));
        return this.javaTreeSome(root, (n) => {
            if (rule.node?.(n)) {
                return true;
            }
            const target = isBinaryExpression(n) ? (assigns(n.operatorToken.kind) ? n.left : undefined)
                : (isPrefixUnaryExpression(n) || isPostfixUnaryExpression(n)) ? (this.isIncDecOperator(n.operator) ? n.operand : undefined)
                    : (isForOfStatement(n) || isForInStatement(n)) ? n.initializer : undefined;
            return (target !== undefined && rule.write(target, n)) || undefined;
        });
    }

    javaSymbolOf(node): any | undefined {
        return this.getChecker().getSymbolAtLocation(node);
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

    // ===== local declaration types and container proofs =====
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

    // `k in xs` over a local declared List: Helpers.inOp's List branch is a null-guarded contains
    javaDeclaredListContains(right, left, objText: string, keyText: string): string | undefined {
        if (!isIdentifier(right) || objText !== right.text) {
            return undefined;
        }
        const literal = isStringLiteralLikeNode(left);
        if (!literal && !(isIdentifier(left) && keyText === left.text)) {
            return undefined;
        }
        if (!literal) {
            const keyDeclared = this.javaDeclaredTypeOf(left);
            if (keyDeclared === undefined || !/^[A-Z][\w.]*(?:<.*>)?$/.test(keyDeclared)) {
                return undefined;
            }
        }
        const declared = this.javaDeclaredTypeOf(right);
        if (declared === undefined || !/^(?:java\.util\.)?(?:List|ArrayList)<[^<>]*>$/.test(declared)) {
            return undefined;
        }
        return `(${objText} != null && ${literal ? '' : `${keyText} != null && `}${objText}.contains(${keyText}))`;
    }

    handleTypeOfInsideBinaryExpression(node, _identation) {
        const op = node.operatorToken.kind;
        const notOperator = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken ? this.NOT_TOKEN : "";
        const target = this.printNode(node.left.expression, 0);
        // no universal Function type in Java: a function is any Callable
        const table = {
            string: ['String'], number: ['Long', 'Integer', 'Float', 'Double'], boolean: ['Boolean'],
            object: ['java.util.Map'], function: ['java.util.concurrent.Callable'],
        };
        const classes = Object.prototype.hasOwnProperty.call(table, node.right.text) ? table[node.right.text] : undefined;
        return classes && `${notOperator}(${classes.map((c) => `${target} instanceof ${c}`).join(' || ')})`;
    }

    // raw AST name of the nearest enclosing declaration `test` accepts (only a scoping key, and
    // printNode on an identifier consults the type checker)
    javaEnclosingName(node, test: (current) => boolean, fallback: string): string {
        let current = node?.parent;
        while (current) {
            if (test(current)) {
                return String((current.name as any)?.text ?? '');
            }
            current = current.parent;
        }
        return fallback;
    }

    getVarKey(node) {
        const varName = node?.text ?? node?.name?.text;
        if (!varName) {
            return '';
        }
        const className = this.javaEnclosingName(node, isClassDeclaration, '');
        const methodName = this.javaEnclosingName(node, (c) => isMethodDeclaration(c) || isFunctionDeclaration(c), 'outsideAnyMethod');
        return `${className}-${methodName}-${varName}`;
    }

    // `x.length` on a checker-proven String/List receiver prints a native int
    // (((String)x).length() / ((List<?>)x).size(), see javaLengthKind). Every other
    // receiver prints Helpers.getArrayLength, whose value is not an int.
    javaNativeLengthKind(node) {
        return this.javaLengthIntRead(node) ? 'int' : undefined;
    }

    expressionReferencesSymbol(node, symbol): boolean {
        if (node === undefined || symbol === undefined) {
            return false;
        }
        return this.javaTreeSome(node, (child) => (child.kind === SyntaxKind.Identifier
            && this.getChecker().getSymbolAtLocation(child) === symbol) || undefined);
    }

    // `compute(key)` once per key; an undefined answer is cached too
    javaMemo<T>(cache: WeakMap<object, T | typeof JAVA_MEMO_UNDEFINED>, key, compute: () => T): T {
        const cached = cache.get(key);
        if (cached !== undefined) {
            return cached === JAVA_MEMO_UNDEFINED ? undefined : cached;
        }
        const result = compute();
        cache.set(key, result === undefined ? JAVA_MEMO_UNDEFINED : result);
        return result;
    }

    // the value of `read`, or `fallback` when the checker throws on an unresolvable node
    javaTry<T>(read: () => T, fallback?: T): T {
        try {
            return read();
        } catch (e) {
            return fallback;
        }
    }

    // pre-order search of `root` (included) that stops at the first node `test` answers true for;
    // a `false` answer skips that node's subtree
    javaTreeSome(root, test: (node) => boolean | undefined): boolean {
        const visit = (node): boolean => {
            if (node === undefined) {
                return false;
            }
            const verdict = test(node);
            return verdict === true || (verdict === undefined && node.forEachChild(visit) === true);
        };
        return visit(root);
    }

    // the innermost function-like or source file strictly above the node
    javaFunctionOrFile(node) {
        let scope = node?.parent;
        while (scope && !isFunctionLike(scope) && !isSourceFile(scope)) {
            scope = scope.parent;
        }
        return scope;
    }

    // true when the body has a return of its own (nested functions skipped) and `test` admits
    // every such return, checked in source order up to the first rejected one
    javaEveryReturn(body, test: (statement) => boolean): boolean {
        let returns = 0;
        const rejected = this.javaTreeSome(body, (current) => {
            if (current !== body && isFunctionLike(current)) {
                return false;
            }
            if (!isReturnStatement(current)) {
                return undefined;
            }
            returns++;
            return !test(current);
        });
        return !rejected && returns > 0;
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

    // `const x = Object.values(..)` with no other write prints the helper's exact return type
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

    // a json object box: the generic `Dictionary<T>` of ts/src/base/types.ts with a string index
    // signature and no numeric one (named typed views, arrays and unions decline)
    javaJsonBoxType(type): boolean {
        if (type === undefined || type === null || !((type.flags as number) & TypeFlags.Object)) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) return false;
        return this.javaTry(() => {
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
        }, false);
    }

    // 'element' = a native get/put on the local; 'neutral' = a property NAME; 'value' = takes the box
    // as an Object (return, copy, assigned value); 'other' = sees the local's new static type
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
        const scope = this.enclosingFunctionLike(nameNode);
        let uses = 0;
        const other = !scope || this.javaTreeSome(scope, (current) => {
            if (current !== nameNode && isIdentifier(current) && current.text === nameNode.text
                && checker.getSymbolAtLocation(current) === symbol) {
                const verdict = this.javaBoxUseVerdict(current);
                uses += verdict === 'element' ? 1 : 0;
                return verdict === 'other' || undefined;
            }
            return undefined;
        });
        return !other && uses > 0;
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
            const call: any = this.unwrapParenthesized((declaration.initializer as any).expression);
            if (!isCallExpression(call) || !isPropertyAccessExpression(call.expression)
                || (call.expression.expression.kind !== SyntaxKind.ThisKeyword
                    && call.expression.expression.kind !== SyntaxKind.SuperKeyword)) {
                return undefined;
            }
            const type = this.javaTry(() => checker.getTypeAtLocation(declaration.initializer));
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
            const call: any = this.unwrapParenthesized(owner.initializer);
            if (!isCallExpression(call)) {
                return undefined;
            }
            const element = this.javaTry(() => {
                const type = checker.getTypeAtLocation(call);
                const arguments_ = checker.isTupleType(type) ? checker.getTypeArguments(type) : undefined;
                return arguments_?.length === pattern.elements.length ? arguments_[pattern.elements.indexOf(declaration)] : undefined;
            });
            return this.javaJsonBoxType(element) && this.javaBoxLocalUsedOnlyAsElements(declaration.name)
                ? JAVA_ELEMENT_WRITE_MAP_TYPE : undefined;
        }
        return undefined;
    }

    javaCheckedBoxLocalTypeCached(declaration): string | undefined {
        if (declaration === undefined) {
            return undefined;
        }
        return this.javaMemo(this.javaCheckedBoxLocalTypeCache, declaration, () => this.javaTry(() => this.javaCheckedBoxLocalType(declaration)));
    }

    // every other mention of the local is a read a `Map<String, Object>` declaration leaves unchanged
    // (see javaContainerNeutralIdentifierUse)
    javaLocalUsesKeepContainerType(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol === undefined) {
            return false;
        }
        const scope = this.javaFunctionOrFile(node);
        return !!scope && !this.javaTreeSome(scope, (current) => (isIdentifier(current) && current !== node
            && checker.getSymbolAtLocation(current) === symbol && !this.javaContainerNeutralIdentifierUse(current)) || undefined);
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
        return this.getChecker().getSymbolAtLocation(node) === undefined || this.javaLocalIsReassigned(node, undefined, false);
    }

    // `for (x of ..)` / `for (x in ..)` re-fills the identifier with each element
    javaLoopRebinds(node, symbol): boolean {
        return (isForOfStatement(node) || isForInStatement(node)) && isIdentifier(node.initializer)
            && this.getChecker().getSymbolAtLocation(node.initializer) === symbol;
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
    // `handsBack` admits a destructuring that hands the local back unchanged.
    javaLocalIsReassigned(node, admitsWrite?: (rhs) => boolean, handsBack = true): boolean {
        const scope = this.javaFunctionOrFile(node);
        if (!scope) {
            return true;
        }
        const symbol = this.getChecker().getSymbolAtLocation(node);
        return this.javaTreeSome(scope, (current) => {
            if (current.kind === SyntaxKind.BinaryExpression && this.isAssignmentOperator(current.operatorToken.kind)) {
                const left = current.left;
                if (isIdentifier(left)) {
                    // a plain write the caller admits keeps the local; a compound write (`x ??= ..`) never does
                    if (this.getChecker().getSymbolAtLocation(left) === symbol && (current.operatorToken.kind !== SyntaxKind.EqualsToken
                        || admitsWrite === undefined || !admitsWrite(current.right))) {
                        return true;
                    }
                } else if (!isElementAccessExpression(left) && !isPropertyAccessExpression(left)
                    && this.javaPatternBindsSymbol(left, symbol) && !(handsBack && this.javaDestructuringHandsBackLocal(current, symbol))) {
                    return true; // destructuring assignment `[x, p] = ..`
                }
            }
            return this.javaLoopRebinds(current, symbol) || undefined;
        });
    }

    isDictionaryType(node): boolean {
        return this.javaTry(() => {
            const checker: any = this.getChecker();
            const type = checker.getTypeAtLocation(node);
            return this.isDictionaryTsType(type, checker, 0);
        }, false);
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
        return this.javaTry(() => {
            if (checker.isArrayType(type) || checker.isTupleType(type)) {
                return false;
            }
            return checker.getIndexTypeOfType(type, IndexKind.String) !== undefined;
        }, false);
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

    printJavaLength(expression, leftSide) {
        const kind = this.javaLengthKind(expression);
        if (kind === 'List' && isIdentifier(expression)) {
            // ral-84j7: a local the embedding layer declared a java.util.List (a typed
            // parse*/filter return) needs no receiver cast; same int, same NPE on null
            const declaredList = this.javaDeclaredTypeOf(expression);
            if (declaredList !== undefined && JAVA_DECLARED_LIST_TYPES.test(declaredList)) {
                return `${leftSide}.size()`;
            }
        }
        if (kind !== undefined) {
            const read = kind.startsWith('String') ? `${this.javaStringReceiverText(expression, leftSide)}.length()` : `((java.util.List<?>)${leftSide}).size()`;
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
        const h29j04 = this.h29J04RowLocal(declaration) || this.h29J04RowContainer(declaration) ? JAVA_ELEMENT_WRITE_MAP_TYPE : undefined; if (h29j04 !== undefined) return h29j04;
        if (this.javaLongLimitLiteralLocalCached(declaration)) {
            return 'Long';
        }
        if (this.javaDeclaredLocalTypeResolver !== undefined) {
            const type = this.javaTry(() => this.javaDeclaredLocalType(declaration));
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
            const optional = this.javaMemo(this.javaOptionalParameterTypeCache, declaration, () => this.javaTry(() => this.javaOptionalParameterType(declaration)));
            return optional === JAVA_NATIVE_DICT_PARAMETER_TYPE ? optional : undefined;
        }
        return undefined;
    }

    // the build layer's declared type of a local (javaDeclaredLocalTypeResolver), else the native type
    // its venue-call initialiser prints (worker-independent); no resolver = no answer
    javaDeclaredLocalType(declaration): string | undefined {
        const resolver = this.javaDeclaredLocalTypeResolver;
        if (typeof resolver !== 'function') {
            return undefined;
        }
        const own = resolver(declaration);
        if (own !== undefined || declaration === undefined) {
            return own;
        }
        if (!isVariableDeclaration(declaration) || declaration.initializer === undefined) {
            return undefined;
        }
        return this.javaTry(() => this.javaVenueCalleeReturnType(this.unwrapParenthesized(declaration.initializer)));
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
            const logical = isBinaryExpression(parent) ? parent.operatorToken.kind : undefined;
            if ((logical === SyntaxKind.AmpersandAmpersandToken || logical === SyntaxKind.BarBarToken) && parent.right === current
                && this.javaTestProvesNonNull(parent.left, symbol, logical === SyntaxKind.AmpersandAmpersandToken)) {
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
        if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken) {
            return truthy === (op === SyntaxKind.AmpersandAmpersandToken)
                && (this.javaTestProvesNonNull(test.left, symbol, truthy) || this.javaTestProvesNonNull(test.right, symbol, truthy));
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

    // a local the build layer already declared with the target Java type
    javaDeclaredReturnTarget(node, target: string): boolean {
        if (!isIdentifier(node) || typeof this.javaDeclaredLocalTypeResolver !== 'function') {
            return false;
        }
        this.javaReturnTypeUsedDeclaredLocals = true;
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined) {
            return false;
        }
        const declared = this.javaTry(() => this.javaDeclaredLocalType(declaration));
        if (declared === undefined) {
            return false;
        }
        const normalize = (type) => String(type).replace(/^final\s+/, '').replace(/\s+/g, '').replace(/^java\.util\./, '');
        return normalize(declared) === normalize(target);
    }

    // a concrete (non-any, non-union, non-generic) type the structure proofs below can reason about
    javaConcreteStructureType(type) {
        const excludedFlags = TypeFlags.Any | TypeFlags.Unknown | TypeFlags.Union
            | TypeFlags.Intersection | TypeFlags.Undefined | TypeFlags.Null
            | TypeFlags.TypeParameter | TypeFlags.Conditional | TypeFlags.Never;
        return type !== undefined && (type.flags & excludedFlags) === 0;
    }

    // a dict-shaped value (string index signature, or a base types.ts declaration) is a Java Map
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

    // tuples are List<Object> in the Java port; the embedding layer reads this to bind List.get
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

    isLeftSideOfAssignment(node) {
        const parent = node.parent;
        if (parent?.kind !== SyntaxKind.BinaryExpression || parent.left !== node) {
            return false;
        }
        return JAVA_ASSIGNMENT_OPERATOR_KINDS.has(parent.operatorToken.kind);
    }

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

    unwrapParenthesized(node): any {
        let current = node;
        while (current !== undefined && isParenthesizedExpression(current)) {
            current = current.expression;
        }
        return current;
    }

    // `x[<integer expression>]` on a declared List: the read carries GetValue's int truncation and
    // bounds tests; the index prints three times, so only literals and declared-numeric names
    javaDeclaredListIndexRead(node): string | undefined {
        if (this.javaElementReadClaimed(node)) {
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
        // the ccxt build pass nativeJavaElementReads already converts a numeric
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

    // the use prints the declaration's own name: a local or parameter the printer renamed
    // (the `finalX` object-literal capture, the async parameter wrapper) prints against a
    // different declaration, whose recorded type does not describe it
    javaIdentifierPrintsDeclaredName(node): boolean {
        return this.javaTry(() => this.printNode(node, 0) === String(node.text), false);
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

    printVariableDeclarationList(node, identation) {
        const declaration = node.declarations[0];

        if (
            this.removeVariableDeclarationForFunctionExpression &&
            declaration?.initializer &&
            isFunctionExpression(declaration.initializer)
        ) {
            return this.printNode(declaration.initializer, identation).trimEnd();
        }
        const indent = this.getIden(identation);
        const h30j06 = this.h30J06Declaration(declaration, indent); if (h30j06 !== undefined) return h30j06;
        const h29j06 = this.h29J06LiteralJoinDeclaration(node, declaration, identation, indent); if (h29j06 !== undefined) return h29j06;
        const h28j06 = this.h28J06SeededListDeclaration(declaration, indent); if (h28j06 !== undefined) return h28j06;
        const h29j04 = this.h29J04RowMapDeclaration(declaration, indent); if (h29j04 !== undefined) return h29j04;
        const h27j06 = this.h27J06FutureListDeclaration(declaration, indent); if (h27j06 !== undefined) return h27j06;
        // array destructuring in variable declaration
        if (declaration?.name.kind === SyntaxKind.ArrayBindingPattern) {
            const elements = declaration.name.elements;
            const names = elements.map((e) => this.printNode(e.name, 0));
            const syntheticName = names.join("") + "Variable";
            const arrayBindingStatement = `${indent}var ${syntheticName} = ${this.printNode(declaration.initializer, 0)};\n`;
            return arrayBindingStatement + names.map((e, index) => {
                // a slot whose tuple element type is a json box that is only element-accessed
                const boxType = this.javaCheckedBoxLocalTypeCached(elements[index]);
                if (boxType !== undefined) {
                    return indent + `${boxType} ${e} = (${boxType}) ((java.util.List<Object>) ${syntheticName}).get(${index})`;
                }
                return indent + `var ${e} = ((java.util.List<Object>) ${syntheticName}).get(${index})`;
            }).join(";\n");
        }

        const isNew =
            declaration?.initializer &&
            declaration.initializer.kind === SyntaxKind.NewExpression;
        let varToken = isNew ? "var " : this.VAR_TOKEN + " ";
        if (!isNew) {
            // later answers win: native arithmetic (String/Long/Double), else a fresh plain map's element
            // writes / a hand-written plain Map base field; then Object.values() lists, ws client fields
            // and aliases, and the ws handler table types
            const typeHooks = [
                (d) => this.javaObjectValuesLocalType(d), (d) => this.javaWsClientLocalType(d),
                (d) => this.javaWsClientAliasLocalType(d), (d) => this.javaHandlerDeclarationType(d),
            ];
            const arithmeticType = this.javaArithmeticLocalType(declaration);
            if (arithmeticType !== undefined) {
                varToken = arithmeticType + " ";
            } else {
                typeHooks.unshift((d) => this.javaElementWriteMapLocalType(d), (d) => this.javaBaseMapFieldLocalType(d));
            }
            for (const hook of typeHooks) {
                const type = hook(declaration);
                if (type !== undefined) {
                    varToken = type + " ";
                }
            }
            // an int literal local that only feeds Long core slots prints `Long x = NL`
            if (this.javaLongLimitLiteralLocalCached(declaration)) {
                return indent + "Long " + this.printNode(declaration.name) + " = " + this.printNode(declaration.initializer, 0).trim() + "L";
            }
        }
        // handle `let x;`
        if (!declaration.initializer) {
            return indent + "Object " + this.printNode(declaration.name) + " = " + this.UNDEFINED_TOKEN;
        }
        const parsedValue = this.printNode(declaration.initializer, identation).trimStart();
        if (parsedValue === this.UNDEFINED_TOKEN) {
            return indent + "Object " + this.printNode(declaration.name) + " = " + parsedValue;
        }
        // `const x = await this.m(..)` whose awaited TS type is a json box that is only element-accessed:
        // the erased `.join()` is cast to the box, so the reads and writes on x print natively
        const awaitedBox = !isNew && declaration.initializer.kind === SyntaxKind.AwaitExpression
            ? this.javaCheckedBoxLocalTypeCached(declaration) : undefined;
        if (awaitedBox !== undefined) {
            return indent + awaitedBox + " " + this.printNode(declaration.name) + " = (" + awaitedBox + ") " + parsedValue;
        }
        return indent + varToken + this.printNode(declaration.name) + " = " + parsedValue;
    }

    // unreached (transformPropertyAcessExpressionIfNeeded prints every `x.length`); a build hook wraps it
    printLengthProperty(node, _identation, _name = undefined) {
        return this.transformPropertyAcessExpressionIfNeeded(node);
    }

    transformPropertyAcessExpressionIfNeeded(node) {
        const expression = node.expression;
        const leftSide = this.printNode(expression, 0);
        if (node.name.text !== "length") {
            return undefined;
        }
        const type = (this.getChecker() as Checker).getTypeAtLocation(expression);
        this.warnIfAnyType(node, (type as any).flags, leftSide, "length");
        return this.printJavaLength(expression, leftSide);
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
            const operand = this.printNode(node.expression, identation);
            // ral-84j1: an element local already declared String needs no checkcast
            return this.javaDeclaredStringElementLocal(node.expression, operand) ? operand : `((String)${operand})`;
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

    // ===== element reads (Helpers.GetValue) =====
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
        return this.javaNullGuardedGet(target, keyText, keyText);
    }

    // the helper's Map-branch read: null for a null receiver or key, else the native get
    javaNullGuardedGet(target: string, nullTestText: string, keyText: string): string {
        return `(${target} == null || ${nullTestText} == null ? null : ${target}.get(${keyText}))`;
    }

    // a key whose Java print is a primitive (declared so, or an undeclared number) cannot be null-tested
    javaKeyPrintsPrimitive(key): boolean {
        const declared = this.javaDeclaredTypeOf(key);
        return declared !== undefined ? JAVA_PRIMITIVE_DECLARED_TYPES.has(declared.trim()) : this.javaOperandPrintsPrimitiveNumber(key);
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
        if (this.javaHeaderMapFields.size === 0 || this.javaElementReadClaimed(node)) {
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
        if (!/^[A-Za-z_]\w*$/.test(keyText) || this.javaKeyPrintsPrimitive(key)) {
            return undefined;
        }
        return `(${keyText} == null ? null : ((java.util.Map<String, Object>)${target}).get(${keyText}))`;
    }

    // `this.ohlcvs[s][k]` (base field `Dictionary<Dictionary<ArrayCacheByTimestamp>>`): once the member
    // has put a fresh map under s the per-symbol value is a non-null Map, so the helper's read is the
    // plain get. Both names must be plain strings and nothing may disturb the entry in between.
    javaOhlcvsElementRead(node): string | undefined {
        if (node.parent?.kind === SyntaxKind.DeleteExpression || this.javaElementReadClaimed(node)) {
            return undefined;
        }
        const inner = this.unwrapPrintTransparentExpression(node.expression);
        if (inner === undefined || !isElementAccessExpression(inner) || !this.javaIsOhlcvsField(inner.expression)) {
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

    // `this.ohlcvs[s][k] = v` on a fresh row: the base declares the rows `Map<String, Map<String, Object>>`
    // and every writer stores a plain HashMap, so the put is the helper's Map branch (a null value is kept)
    javaOhlcvsElementWrite(left, rhs: string): string | undefined {
        const inner = this.unwrapPrintTransparentExpression(left.expression);
        if (inner === undefined || !isElementAccessExpression(inner) || !this.javaIsOhlcvsField(inner.expression)) {
            return undefined;
        }
        const symbolNode = this.unwrapPrintTransparentExpression(inner.argumentExpression);
        const key = this.unwrapParenthesized(left.argumentExpression);
        if (symbolNode === undefined || !isIdentifier(symbolNode) || key === undefined || !this.javaStringProvenKey(key)
            || this.printNode(symbolNode, 0).trim() !== symbolNode.text) {
            return undefined;
        }
        const isString = (n) => this.javaScalarFamily(n) === 'string' || this.javaDeclaredStringType(n);
        if (!isString(symbolNode) || !this.javaOhlcvsEntryIsFresh(left, symbolNode)) {
            return undefined;
        }
        return `this.ohlcvs.get(${symbolNode.text}).put(${this.printNode(key, 0).trim()}, ${rhs})`;
    }

    javaIsOhlcvsField(node): boolean {
        const field = this.unwrapPrintTransparentExpression(node);
        return field !== undefined && isPropertyAccessExpression(field)
            && field.expression.kind === SyntaxKind.ThisKeyword && field.name.text === 'ohlcvs';
    }

    // an earlier statement of an enclosing block puts a fresh map under s (javaOhlcvsFreshAnchor)
    // and nothing up to the read disturbs it (javaOhlcvsDisturbed)
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
        const isSymbol = (n) => {
            const target = this.unwrapPrintTransparentExpression(n);
            return target !== undefined && isIdentifier(target) && checker.getSymbolAtLocation(target) === symbol;
        };
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
                && JAVA_THIS_RETURN_TYPES_BASE_FILE.test(this.javaCalleeFileName(call, checker) ?? '');
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
        const writesSymbol = (n) => {
            const target = this.unwrapPrintTransparentExpression(n);
            return target !== undefined && isIdentifier(target) && checker.getSymbolAtLocation(target) === symbol;
        };
        const ohlcvsElement = (n) => n !== undefined && isElementAccessExpression(n) && this.javaIsOhlcvsField(n.expression);
        return this.javaWriteSiteSome(statement, {
            node: (n) => n.kind === SyntaxKind.AwaitExpression
                || (n.kind === SyntaxKind.DeleteExpression && ohlcvsElement(this.unwrapPrintTransparentExpression(n.expression)))
                || ((isPrefixUnaryExpression(n) || isPostfixUnaryExpression(n)) && writesSymbol(n.operand)),
            write: (target, site) => {
                const left = this.unwrapPrintTransparentExpression(target);
                return isBinaryExpression(site) && (writesSymbol(left) || this.javaIsOhlcvsField(left) || ohlcvsElement(left));
            },
        });
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

    // `client.<map field>` where `client` (first parameter or initialised local) prints as the java
    // `Client` whose final, never-null field is a Map: answers the field's declared value type
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
        // else, when TS leaves the receiver `any` (`client: any` of the base tier), the build layer prints it as the java `Client`
        return this.javaWsClientDeclaredMapField(expression) ?? (Object.prototype.hasOwnProperty.call(JAVA_WS_CLIENT_MAP_FIELDS, expression.name.text)
            && this.javaWsClientReceiverIsAny(expression) ? JAVA_WS_CLIENT_MAP_FIELDS[expression.name.text] : undefined);
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
        return `java.util.Map<String, ${JAVA_WS_CLIENT_MAP_FIELDS[initializer.name.text]}>`;
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

    // `client.<map>[k]` with a repeatable non-primitive identifier key: the null-guarded native get
    javaWsClientMapReadText(receiver, key): string | undefined {
        const listKeyed = this.javaWsClientListKeyedRead(receiver, key);
        if (listKeyed !== undefined) {
            return listKeyed;
        }
        if (this.javaWsClientMapField(receiver) === undefined || !isIdentifier(key)
            || !this.javaRepeatableOperand(key) || this.javaOperandPrintsPrimitiveNumber(key) || this.javaKeyPrintsPrimitive(key)) {
            return undefined;
        }
        const target = this.printNode(receiver, 0);
        const keyText = this.printNode(key, 0);
        return this.javaNullGuardedGet(target, keyText, keyText);
    }

    // `client.<map>[keys[i]]`, keys a declared List read at a counter: the key prints the guarded
    // native list read (side-effect free, printed twice); the String-keyed Map `get` behind both null
    // tests is the helper's Map branch
    javaWsClientListKeyedRead(receiver, key): string | undefined {
        if (this.javaWsClientMapField(receiver) === undefined || !isElementAccessExpression(key)
            || !this.javaPrimitiveCounterIndex(key.argumentExpression)
            || !JAVA_DECLARED_LIST_TYPES.test(this.javaDeclaredTypeOf(key.expression) ?? '')) {
            return undefined;
        }
        const keyText = this.printNode(key, 0);
        if (!keyText.startsWith('(') || keyText.includes('Helpers.')) {
            return undefined;
        }
        return this.javaNullGuardedGet(this.printNode(receiver, 0), keyText, keyText);
    }

    javaWsClientMapRead(node): string | undefined {
        return this.javaElementReadClaimed(node) ? undefined : this.javaWsClientMapReadText(node.expression, node.argumentExpression);
    }

    // a bare statement (a conditional expression is not a Java statement), an override or a write target
    javaElementReadClaimed(node): boolean {
        return node.parent?.kind === SyntaxKind.ExpressionStatement
            || this.printElementAccessExpressionExceptionIfAny(node) !== undefined || this.isLeftSideOfAssignment(node);
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
        const fileName = this.javaCalleeFileName(node);
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
        // the ws-tier post-pass retypes `Object client = Helpers.GetValue(..)` by its printed text
        if (node.parent?.kind === SyntaxKind.VariableDeclaration
            && (node.parent as any).initializer === node
            && ((node.parent as any).name?.text === 'client')) {
            return undefined;
        }
        const declared = this.javaDeclaredTypeOf(node.expression);
        const declaredList = declared !== undefined && JAVA_DECLARED_LIST_TYPES.test(declared);
        if (!declaredList) {
            const type = this.getChecker().getTypeAtLocation(node.expression);
            if (!this.isJavaListValueType(type) || this.isVarargsArrayReference(node.expression)
                || !this.javaSideEffectFreeReference(node.expression)) {
                return undefined;
            }
        }
        const target = this.printNode(node.expression, 0);
        const list = declaredList ? target : `((java.util.List<?>)${target})`;
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

    // `x[k]` on a declared java Map with a non-literal key: the get behind the helper's null/String tests
    javaDeclaredMapElementRead(node) {
        if (this.javaElementReadClaimed(node)) {
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
            return this.javaStringListKeyedMapRead(node) ?? this.javaMapLiteralKeyedMapRead(node); // the guard prints the key twice
        }
        if (this.javaKeyPrintsPrimitive(operand)) {
            return undefined; // a java primitive cannot take the `instanceof` test
        }
        const keyType = this.javaTry(() => this.getChecker().getTypeAtLocation(key));
        if (keyType === undefined
            || this.getChecker().isArrayType(keyType) || this.getChecker().isTupleType(keyType)) {
            return undefined;
        }
        const target = this.printNode(node.expression, 0);
        const keyText = this.printNode(key, 0);
        if (keyType.getAliasSymbol?.() === undefined && keyType.flags === TypeFlags.String) {
            // a plain `string` key prints a java String; the null test keeps a receiver that
            // aliases a ConcurrentHashMap from throwing on a null the alias admits
            return this.javaNullGuardedGet(target, this.printNode(operand, 0), keyText);
        }
        return `(${target} == null || !(${keyText} instanceof String) ? null : ${target}.get(${keyText}))`;
    }

    // `m[keys[i]]` on a declared Map, keys a declared List<String> read at a counter: the key is the
    // guarded native list read (a String or null, side-effect free), so it can print twice in the
    // helper's null-key test; a Map get then is the helper's Map branch
    javaStringListKeyedMapRead(node): string | undefined {
        const key = node.argumentExpression;
        if (!isElementAccessExpression(key) || !this.javaPrimitiveCounterIndex(key.argumentExpression)
            || !/^(java\.util\.)?(List|ArrayList)<String>$/.test(this.javaDeclaredTypeOf(key.expression) ?? '')) {
            return undefined;
        }
        const keyText = this.printNode(key, 0);
        if (!keyText.startsWith('(') || keyText.includes('Helpers.')) {
            return undefined;
        }
        const target = this.printNode(node.expression, 0);
        return this.javaNullGuardedGet(target, keyText, keyText);
    }

    // `m[d['k']]` on a declared Map, d a declared Map name: the key is d's side-effect-free get (any
    // value), so it prints twice; the helper answers null unless the key is a String, then the get
    javaMapLiteralKeyedMapRead(node): string | undefined {
        const key = node.argumentExpression;
        if (!isElementAccessExpression(key) || !isStringLiteralLikeNode(key.argumentExpression)
            || !isIdentifier(key.expression) || !this.javaDeclaredMapReceiver(key.expression)) {
            return undefined;
        }
        const keyText = this.printNode(key, 0);
        if (keyText.includes('Helpers.') || keyText.includes('->')) {
            return undefined;
        }
        const target = this.printNode(node.expression, 0);
        return `(${target} == null || !(${keyText} instanceof String) ? null : ${target}.get(${keyText}))`;
    }

    // `this.<hash map field>[k as string]`: the assertion only narrows, so the null test reads the bare name
    javaAssertedKeyMapFieldRead(receiver, key): string | undefined {
        const name = receiver?.name?.text;
        if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(JAVA_HASH_MAP_FIELDS, name)
            || (!isAsExpression(key) && !isParenthesizedExpression(key))) {
            return undefined;
        }
        const operand = this.unwrapParenthesized(key);
        if (!isAsExpression(operand) || operand.type?.kind !== SyntaxKind.StringKeyword
            || !isIdentifier(operand.expression) || !this.javaIdentifierPrintsDeclaredName(operand.expression)) {
            return undefined;
        }
        const target = this.printNode(receiver, 0);
        const read = this.javaBaseDeclaredMapCacheField(receiver) ? target : `((java.util.Map<?, ?>)${target})`;
        return `(${this.printNode(operand.expression, 0)} == null || ${target} == null ? null : ${read}.get(${this.printNode(key, 0)}))`;
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
            return this.javaHashMapFieldReadText(receiver, key) ?? this.javaPlainCacheReadText(receiver, key)
                ?? this.javaAssertedKeyMapFieldRead(receiver, key);
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
        if (read === undefined
            || this.printElementAccessExpressionExceptionIfAny(node) !== undefined || this.isLeftSideOfAssignment(node)) {
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
                // a literal key on a table field the checker does not type (balance is
                // `any`) still has the field table's Java proof
                return this.javaFieldMapReadIfAllowed(node) ?? this.javaDescribedDictChainRead(node);
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
        return this.printJavaHandlerElementRead(node) ?? this.printCheckerTypedElementAccessRead(node) ?? super.printElementAccessExpression(node, identation);
    }

    // ral-87j2: `methods[key]` on a proven handler table prints the typed table's own get (the table is a
    // fresh non-null HashMap<String, String>; get answers null for a missing or null key)
    printJavaHandlerElementRead(node) {
        if (!isElementAccessExpression(node) || !isIdentifier(node.expression)) {
            return undefined;
        }
        this.javaScanHandlerTables(node);
        if (!this.javaHandlerReads.has(this.javaHandlerKey(node))) {
            return undefined;
        }
        return `${this.printNode(node.expression, 0).trim()}.get(${this.printNode(node.argumentExpression, 0).trim()})`;
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

    // ===== element writes, fresh maps and object literals =====
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
        if (isStringLiteral(key)) {
            return keyText;
        }
        // ral-84j1: `m[(k as string)] = v` where k is a String-declared element local: the assertion
        // already printed bare (printAsExpression), so the put key needs no checkcast either
        // decided from the AST: the identifier under the assertion is the bare-printed local
        const inner: Node | undefined = this.unwrapParenthesized(key);
        if (inner !== undefined && isAsExpression(inner) && inner.type?.kind === SyntaxKind.StringKeyword
            && isIdentifier(inner.expression)
            && this.javaDeclaredStringElementLocal(inner.expression, inner.expression.text)) {
            return keyText;
        }
        return `(String)${keyText}`;
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
        // every later `x = rhs` must hand the local another fresh map too
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
        const fileName = this.javaCalleeFileName(node);
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
        const fileName = this.javaCalleeFileName(initializer);
        return typeof fileName === 'string' && JAVA_FRESH_EXTEND_FILE.test(fileName);
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
        const declaration: any = this.javaCalleeDeclaration(call, checker);
        if (!declaration || !isMethodDeclaration(declaration) || !declaration.body) {
            return false;
        }
        const argIndex = call.arguments.findIndex((a) => isIdentifier(a) && checker.getSymbolAtLocation(a) === symbol);
        const parameter = argIndex >= 0 ? declaration.parameters[argIndex] : undefined;
        if (parameter === undefined || !isIdentifier(parameter.name) || parameter.dotDotDotToken) {
            return false;
        }
        const parameterSymbol = checker.getSymbolAtLocation(parameter.name);
        const proven = this.javaEveryReturn(declaration.body, (statement) => {
            const value = this.unwrapPrintTransparentExpression(statement.expression);
            const element = value !== undefined && isArrayLiteralExpression(value) ? value.elements[index] : undefined;
            return element !== undefined && isIdentifier(element) && checker.getSymbolAtLocation(element) === parameterSymbol;
        });
        if (!proven || this.javaHandBackVisiting.has(declaration)) {
            return false; // a recursive hand-back chain stays unproven
        }
        this.javaHandBackVisiting.add(declaration);
        try {
            return !this.javaLocalIsReassigned(parameter.name);
        } finally {
            this.javaHandBackVisiting.delete(declaration);
        }
    }

    // true when a destructuring target mentions the symbol anywhere
    javaPatternBindsSymbol(pattern, symbol): boolean {
        return this.javaTreeSome(pattern, (n) => (isIdentifier(n) && this.getChecker().getSymbolAtLocation(n) === symbol) || undefined);
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

    // `this.<field>` for a BaseExchange.java field declared over a single-owner store
    javaOwnerStoreFieldReceiver(expression): boolean {
        if (expression === undefined || !isPropertyAccessExpression(expression)) {
            return false;
        }
        return expression.expression.kind === SyntaxKind.ThisKeyword
            && this.javaOwnerStoreFields.has(expression.name.text);
    }

    printArrayLiteralExpression(node) {
        // For Java: new ArrayList<>(Arrays.asList(elem1, elem2, ...))
        const elements = node.elements.map((e) => this.printNode(e)).join(", ");
        return `${this.ARRAY_OPENING_TOKEN}${elements}${this.ARRAY_CLOSING_TOKEN}`;
    }

    printArrayPushCall(_node, _identation, name = undefined, parsedArg = undefined) {
        const h30j06 = this.h30J06ListPush(_node, name, parsedArg); if (h30j06 !== undefined) return h30j06;
        const h28j06 = this.h28J06SeededListPush(_node, name, parsedArg); if (h28j06 !== undefined) return h28j06;
        const h27j06 = this.h27J06FutureListPush(_node, name, parsedArg); if (h27j06 !== undefined) return h27j06;
        return `((java.util.List<Object>)${name}).add(${parsedArg})`;
    }

    printDeleteExpression(node, _identation) {
        const object = this.printNode(node.expression.expression, 0);
        const keyNode = node.expression.argumentExpression;
        const printedKey = this.printNode(keyNode, 0);
        // ral-84j1: a key declared a Java String already is remove(String)'s argument
        const key = this.javaDeclaredStringElementLocal(keyNode, printedKey) ? printedKey : `(String)${printedKey}`;
        // a ws Client map (or a local bound to it) already binds `remove` with no receiver cast
        if (this.javaWsClientMapReceiver(node.expression.expression)) {
            return `${object}.remove(${key})`;
        }
        if (this.javaBaseDeclaredMapCacheField(node.expression.expression) || this.javaIsOhlcvsField(node.expression.expression)) {
            return `${object}.remove(${key})`;
        }
        return `((java.util.Map<String,Object>)${object}).remove(${key})`;
    }

    // `this.<field>` resolving to an Exchange.ts field of JAVA_BASE_DECLARED_MAP_CACHE_FIELDS
    javaBaseDeclaredMapCacheField(expression): boolean {
        if (expression === undefined || !isPropertyAccessExpression(expression) || expression.expression.kind !== SyntaxKind.ThisKeyword
            || !JAVA_BASE_DECLARED_MAP_CACHE_FIELDS.has(expression.name.text)) {
            return false;
        }
        const declaration = this.checkerOrUndefined()?.getSymbolAtLocation(expression.name)?.valueDeclaration?.resolve();
        const fileName = declaration?.getSourceFile?.()?.fileName;
        return typeof fileName === 'string' && JAVA_THIS_RETURN_TYPES_BASE_FILE.test(fileName);
    }

    printObjectLiteralExpression(node, identation) {
        const handlerTable = this.printJavaHandlerTable(node, identation);
        if (handlerTable !== undefined) {
            return handlerTable;
        }
        if (node.properties.length > 0 && node.properties.every((p) => isPropertyAssignment(p)) &&
            this.objectLiteralCapturedKeys(node).length > 0) {
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

    // `m[k] = v` on a local the printer declared `Map<String, Object>` whose every write is a
    // provably non-concurrent map (fresh literal/extend/omit, or a base safeDict* of non-field data):
    // the helper's map branch is then `m.put(k, v)` (null value included; its CHM removal never applies)
    javaMapPutIsNative(baseExpr, keys: any[]): boolean {
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
        const admits = (rhs) => this.javaPlainMapSource(baseExpr, rhs);
        return admits(declaration.initializer) && !this.javaLocalIsReassigned(baseExpr, admits);
    }

    javaPlainMapSource(container, value): boolean {
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
        const fileName = this.javaCalleeFileName(node);
        if (typeof fileName !== 'string' || !JAVA_FRESH_EXTEND_FILE.test(fileName)) {
            return false; // a venue override may return anything
        }
        if (name === 'extend' || name === 'deepExtend' || name === 'omit') {
            return true; // Generic.Extend / deepExtend / Functions.omitMap build a fresh LinkedHashMap (or null)
        }
        if (name === 'safeDict' || name === 'safeDict2' || name === 'safeDictN') {
            // hands back an element of the source or the default (a literal map or a null): never a field map or a ws client map
            const fallback = this.unwrapPrintTransparentExpression(node.arguments[node.arguments.length - 1]);
            return node.arguments.length > 0 && this.javaNonSharedSource(node.arguments[0], 0)
                && (node.arguments.length < (name === 'safeDict2' ? 4 : 3)
                    || (fallback !== undefined && (isObjectLiteralExpression(fallback) || fallback.kind === SyntaxKind.UndefinedKeyword
                        || (isIdentifier(fallback) && fallback.text === 'undefined') || fallback.kind === SyntaxKind.NullKeyword)));
        }
        return false;
    }

    // data that can not hold one of the runtime's ConcurrentHashMaps (this.<field> top level, ws client
    // futures/subscriptions/rejections and their entries): a local/param/element chain not rooted at them
    javaNonSharedSource(value, depth: number): boolean {
        const node = this.unwrapPrintTransparentExpression(value);
        if (node === undefined || depth > 40) {
            return false;
        }
        if (isElementAccessExpression(node)) {
            return this.javaNonSharedSource(node.expression, depth + 1);
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
        const known = this.javaNonSharedSourceVerdicts.get(declaration);
        if (known !== undefined) {
            return known; // `true` while in progress: a self-referencing write adds no new source
        }
        this.javaNonSharedSourceVerdicts.set(declaration, true);
        this.javaMapSourceInProgress.add(declaration);
        const writes: any[] = declaration.initializer ? [declaration.initializer] : [];
        const verdict = !this.javaLocalIsReassigned(node, (rhs) => { writes.push(rhs); return true; })
            && writes.every((w) => this.javaNonSharedValue(w, depth + 1));
        this.javaMapSourceInProgress.delete(declaration);
        if (verdict && this.javaMapSourceInProgress.size > 0) {
            this.javaNonSharedSourceVerdicts.delete(declaration); // leaned on an unfinished verdict: recompute later
        } else {
            this.javaNonSharedSourceVerdicts.set(declaration, verdict);
        }
        return verdict;
    }

    // a value expression that never reads a field map or a ws client's maps
    // an awaited implicit-API call (ts/src/abstract/<id>.ts, body `this.request(..)`) hands back a
    // fresh Jackson parse of the HTTP body, so the map-put non-shared proof admits it as a put source
    javaImplicitApiResponse(value): boolean {
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
            declaration = this.javaCalleeDeclaration(node);
        } catch (e) {
            return false;
        }
        const fileName = declaration?.getSourceFile?.()?.fileName;
        if (typeof fileName !== 'string' || !JAVA_IMPLICIT_API_FILE.test(fileName) || !declaration.body) {
            return false;
        }
        const statements = declaration.body.statements ?? [];
        const ret = statements.length === 1 && isReturnStatement(statements[0]) ? statements[0].expression : undefined;
        return ret !== undefined && isCallExpression(ret) && isPropertyAccessExpression(ret.expression)
            && ret.expression.expression.kind === SyntaxKind.ThisKeyword && ret.expression.name.text === 'request';
    }

    javaNonSharedValue(value, depth: number): boolean {
        if (this.javaImplicitApiResponse(value)) {
            return true;
        }
        return !this.javaTreeSome(value, (n) => {
            if (isPropertyAccessExpression(n)) {
                const called = n.parent !== undefined && isCallExpression(n.parent) && n.parent.expression === n;
                if ((!called && (n.expression.kind === SyntaxKind.ThisKeyword
                    || /^(subscriptions|futures|rejections|hashmap)$/.test(n.name.text)))
                    || (called && n.name.text === 'createSafeDictionary')) {
                    return true;
                }
            }
            if (n.kind === SyntaxKind.ThisKeyword && !(n.parent !== undefined && isPropertyAccessExpression(n.parent))) {
                return true; // `this` handed to a call
            }
            return (isIdentifier(n) && n !== value && !(n.parent !== undefined && isPropertyAccessExpression(n.parent) && n.parent.name === n)
                && this.javaDeclarationOfIdentifier(n) !== undefined && !this.javaNonSharedSource(n, depth + 1)) || undefined;
        });
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
            const fileName = this.javaCalleeFileName(node);
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

    // `this.<field>[k]` on the JAVA_HASH_MAP_FIELDS base map fields. ConcurrentHashMap.get(null) throws
    // where the helper answers null, so a non-literal key is always null-tested; the receiver can
    // be null too. Key and receiver print twice, so both must be side-effect free.
    javaHashMapFieldReadText(receiver, key): string | undefined {
        const name = receiver?.name?.text;
        if (typeof name === 'string' && Object.prototype.hasOwnProperty.call(JAVA_BASE_MAP_READ_FIELDS, name)) {
            return this.javaBaseMapFieldReadText(receiver, key, JAVA_BASE_MAP_READ_FIELDS[name]);
        }
        if (typeof name !== 'string'
            || (!Object.prototype.hasOwnProperty.call(JAVA_HASH_MAP_FIELDS, name) && !this.javaFileBuiltMapField(receiver, name, false))) {
            return undefined;
        }
        const literal = isStringLiteralLikeNode(key);
        if (!literal && !this.javaRepeatableOperand(key)) {
            return undefined;
        }
        const target = this.printNode(receiver, 0);
        const keyText = this.printNode(key, 0);
        const keyGuard = literal ? '' : `${keyText} == null || `;
        const read = this.javaBaseDeclaredMapCacheField(receiver) ? target : `((java.util.Map<?, ?>)${target})`;
        return `(${keyGuard}${target} == null ? null : ${read}.get(${keyText}))`;
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

    // ===== binary expressions: equality, `in` and ordered comparisons =====
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

    // ==/===/!=/!== become java.util.Objects.equals once the checker proves one operand is
    // a string, a boolean or the null/undefined literal: for those Helpers.isEqual reduces
    // to Objects.equals (value compare, class-strict, no numeric promotion). Two operands
    // the checker types as plain numbers compare natively when their printed Java kinds
    // match: the helper's numeric paths are the same value compare.
    // `a !== b` / `a === b` where one side is a never-rewritten const read off `this.crc32(..)` and the
    // other a local declared `Long`: BaseExchange.crc32 returns a Long box, so Objects.equals is isEqual
    javaCrc32Local(node): boolean {
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
            fileName = this.javaCalleeFileName(init);
        } catch (e) {
            return false;
        }
        return typeof fileName === 'string' && JAVA_CRC32_BASE_FILE.test(fileName)
            && !this.javaLocalIsReassigned(node);
    }

    printNativeEqualityIfProvable(node, leftText: string, rightText: string): string | undefined {
        const op = node.operatorToken.kind;
        const negated = op === SyntaxKind.ExclamationEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken;
        if (!negated && op !== SyntaxKind.EqualsEqualsToken && op !== SyntaxKind.EqualsEqualsEqualsToken) {
            return undefined;
        }
        const equalCall = `${negated ? '!' : ''}java.util.Objects.equals(${leftText}, ${rightText})`;
        const leftBox = this.javaDeclaredNumericFamily(node.left);
        const rightBox = this.javaDeclaredNumericFamily(node.right);
        if (((this.javaCrc32Local(node.left) && rightBox === 'Long') || (this.javaCrc32Local(node.right) && leftBox === 'Long'))
            && leftText === node.left.text && rightText === node.right.text) {
            return equalCall;
        }
        // two declared numeric boxes compare by value: same-class integral boxes take Objects.equals,
        // a Double on either side compares doubleValue() (isEqual's toDouble), other integral pairs longValue()
        const isBool = (n) => String(this.javaDeclaredTypeOf(n) ?? '').trim() === 'Boolean';
        if (isBool(node.left) || isBool(node.right)) {
            return equalCall;
        }
        if (JAVA_BOXED_NUMERIC_TYPES.has(leftBox) && JAVA_BOXED_NUMERIC_TYPES.has(rightBox)) {
            if (leftBox === rightBox && leftBox !== 'Double') {
                return equalCall;
            }
            const unbox = (leftBox === 'Double' || rightBox === 'Double') ? 'doubleValue' : 'longValue';
            return `${negated ? '!' : ''}(${leftText} == null ? ${rightText} == null : (${rightText} != null && ${leftText}.${unbox}() == ${rightText}.${unbox}()))`;
        }
        const checker = this.getChecker();
        const leftFamily = this.equalityOperandFamily(checker?.getTypeAtLocation(node.left));
        const rightFamily = this.equalityOperandFamily(checker?.getTypeAtLocation(node.right));
        const leftProved = leftFamily !== undefined && (leftFamily !== 'null' || this.isNullishLiteral(node.left));
        const rightProved = rightFamily !== undefined && (rightFamily !== 'null' || this.isNullishLiteral(node.right));
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
        // two checker-typed plain numbers whose printed Java values carry the same
        // kind (two primitives returned above); a box compares with
        // Objects.equals, whose class the kind pins to the box the helper would compare.
        // (a boxed double compares through Double.equals, which separates -0.0 from 0.0, so it keeps the helper)
        const numberKind = (n) => (this.javaScalarFamily(n) === 'number' ? this.javaPrintedNumberKind(n) : undefined);
        const leftKind = numberKind(node.left);
        if (leftKind !== undefined && leftKind !== 'double' && leftKind === numberKind(node.right)) {
            return equalCall;
        }
        // a numeric operand the pass declared Long/Double/Integer/int/long/double: the box
        // is unboxed by the operator (numeric compare, exactly the helper's toLong/toDouble
        // path) and a boxed declaration is null-tested first, which the helper answers false.
        if (leftBox !== undefined || rightBox !== undefined) {
            const leftOk = leftBox !== undefined || this.javaOperandPrintsPrimitiveNumber(node.left);
            const rightOk = rightBox !== undefined || this.javaOperandPrintsPrimitiveNumber(node.right);
            if (leftOk && rightOk) {
                const boxes: string[] = [];
                if (leftBox !== undefined && JAVA_BOXED_NUMERIC_TYPES.has(leftBox)) {
                    boxes.push(leftText);
                }
                if (rightBox !== undefined && JAVA_BOXED_NUMERIC_TYPES.has(rightBox)) {
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
        const isLength = node.kind === SyntaxKind.PropertyAccessExpression && node.name.text === 'length';
        // a nested `+ - * /` this printer emits natively is a Java primitive of its kind
        if (isNumericLiteral(node) && /^0[xXbBoO]/.test(node.text) && /[.eE]/.test(node.text)) {
            return undefined; // a radix literal whose digits hold an `e` is no double
        }
        return this.javaEqualityLiteralKind(node)
            ?? ((this.isJavaPrimitiveForCounter(node) || this.javaPrintedIntCounter(node) || isLength) ? 'int' : undefined)
            ?? (node.kind === SyntaxKind.CallExpression ? this.javaPrintedCallKind(node) : undefined)
            ?? (node.kind === SyntaxKind.BinaryExpression ? this.javaNativeArithmeticKind(node) : undefined);
    }

    // a read of a `for (var i = <int literal>; ..; i++)` counter anywhere in the loop: javac types it
    // int and no box write reaches it; a capture rename (`finalI`) prints an Object copy instead
    javaPrintedIntCounter(node): boolean {
        return node?.kind === SyntaxKind.Identifier && this.javaIntForCounter(node)
            && this.javaIdentifierPrintsDeclaredName(node);
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

    // destructuring: [a,b] = this.method()
    printJavaArrayDestructuring(left, right, identation) {
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

    // setter for element-access assignments:  a[b] = v
    printJavaElementWrite(node, left, right) {
        // base container and all keys (inner-most key is last)
        const keys: any[] = [];
        let baseExpr: any = left;
        while (isElementAccessExpression(baseExpr)) {
            keys.unshift(baseExpr.argumentExpression);
            baseExpr = baseExpr.expression;
        }

        const containerStr = this.printNode(baseExpr, 0);
        const keyStrs      = keys.map(k => this.printNode(k, 0));

        // GetValue(GetValue( ... )) chain for all but the last key; the first step reads the receiver
        // itself, so a declared map, a declared chain container or a hand-written base map field
        // (JAVA_FIELD_TYPES) / ws Client map indexes natively and only the `any` steps above it keep the helper
        const multiKey = keyStrs.length > 1;
        const chainRead = multiKey ? this.javaDeclaredChainContainerRead(left, keys.length) : undefined;
        const firstRead = !multiKey ? undefined
            : (this.javaDeclaredMapReceiver(baseExpr) && isStringLiteralLikeNode(keys[0])) ? `${containerStr}.get(${keyStrs[0]})`
                : chainRead ?? this.javaFieldMapReadText(baseExpr, keys[0])
                    ?? (isStringLiteralLikeNode(keys[0]) && this.javaWsClientMapField(baseExpr) !== undefined
                        ? `(${containerStr} == null ? null : ${containerStr}.get(${keyStrs[0]}))`
                        : this.javaWsClientMapReadText(baseExpr, keys[0]));
        let acc = firstRead ?? containerStr;
        for (let i = firstRead === undefined ? 0 : 1; i < keyStrs.length - 1; i++) {
            acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
        }

        const lastKey = keyStrs[keyStrs.length - 1];
        const rhs     = this.printNode(right, 0);
        const keyArg  = this.elementWriteKeyText(keys[keys.length - 1], lastKey);
        const ohlcvsWrite = keys.length === 2 ? this.javaOhlcvsElementWrite(left, rhs) : undefined;
        if (ohlcvsWrite !== undefined) {
            return ohlcvsWrite;
        }

        if (this.elementWriteTargetsMap(left.expression, baseExpr, keys, right)) {
            // a receiver declared as a Map already carries the type the put binds on
            const target = (keys.length === 1 && (this.javaDeclaredMapReceiver(baseExpr) || this.javaWsClientObjectMapReceiver(baseExpr)))
                ? acc : `((${this.OBJECT_KEYWORD})${acc})`;
            return `${target}.put(${keyArg}, ${rhs})`;
        }
        const put = `${acc}.put(${lastKey}, ${rhs})`;
        if (keys.length === 1) {
            const key = this.unwrapPrintTransparentExpression(keys[0]);
            const stringKey = (k) => isStringLiteralLikeNode(k) || this.javaDeclaredStringType(k);
            // single-key receivers whose native put is the helper's write (first match wins):
            // - a ws Client `Map<String, Object>`: any value under a String-proven key
            // - a declared Map local / a base header field declared Map<String, Object>: a non-null
            //   value makes the helper's ConcurrentHashMap null-removal branch unreachable
            // - a plain HashMap cache of the base header: the helper's Map branch stores null too
            const putRules = [
                () => this.javaWsClientObjectMapReceiver(baseExpr) && stringKey(keys[0]),
                () => this.javaDeclaredMapReceiver(baseExpr) && stringKey(keys[0]) && this.javaPrintsNonNullValue(right),
                () => this.javaMapWriteFieldReceiver(baseExpr) && stringKey(keys[0]) && !this.elementWriteValueMayBeNull(right),
                () => this.javaPlainCacheFieldReceiver(baseExpr) && this.javaStringProvenKey(keys[0]),
            ];
            if (putRules.some((rule) => rule())) {
                return put;
            }
            // `this.<owner store>[lit] = v`: the store's `put(key, null)` removes the key like the
            // helper's null write does, so a null literal prints the removal and any other value the put
            if (this.javaOwnerStoreFieldReceiver(baseExpr) && isStringLiteralLikeNode(keys[0])) {
                return this.isNullishLiteral(this.unwrapPrintTransparentExpression(right)) ? `${acc}.remove(${lastKey})` : put;
            }
            // a statement-level write of a plain map field from an owner-executor member, String key and
            // no box cast in either operand: the field is never null, so put takes any value
            if (node.parent?.kind === SyntaxKind.ExpressionStatement && this.javaPlainMapFieldReceiver(baseExpr) && stringKey(key)
                && this.javaInOwnerMember(node) && !JAVA_BOX_CAST.test(lastKey) && !JAVA_BOX_CAST.test(rhs)) {
                return put;
            }
        }
        if (this.javaMapPutIsNative(baseExpr, keys)) {
            return `${acc}.put(${keyArg}, ${rhs})`;
        }
        // a declared Map local that only ever holds a fresh HashMap, any non-numeric key: the helper's raw Map put
        if (this.javaDeclaredMapReceiver(baseExpr) && this.isPlainHashMapReceiver(baseExpr, keys)
            && !(this.getChecker().getTypeAtLocation(keys[0]).flags & TypeFlags.NumberLike)) {
            return `((java.util.Map<Object, Object>) (java.util.Map<?, ?>) ${acc}).put(${lastKey}, ${rhs})`;
        }
        // `this.<field>[k] = v` where the file only ever builds the field as a plain HashMap
        if (keys.length === 1 && isPropertyAccessExpression(baseExpr)
            && this.javaFileBuiltMapField(baseExpr, baseExpr.name.text, true)) {
            return `((java.util.Map<Object, Object>) (java.util.Map<?, ?>) ${acc}).put(${lastKey}, ${rhs})`;
        }
        return `Helpers.addElementToObject(${acc}, ${lastKey}, ${rhs})`;
    }

    printJavaInExpression(left, right) {
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
                const receiverText = this.javaBaseDeclaredMapCacheField(right) ? objText : `((java.util.Map<?, ?>)${objText})`;
                return withGuard(`${receiverText}.containsKey(${keyText})`);
            }
            // `Dictionary | undefined` (a no-overload safe* signature): the helper answers
            // false for the nullish arm, the guard keeps exactly that
            if (this.isJavaNullableMapType(objectType) && this.javaRepeatableOperand(right)) {
                return `(${objText} != null && ${guarded}((java.util.Map<?, ?>)${objText}).containsKey(${keyText}))`;
            }
        }
        const listContains = this.javaDeclaredListContains(right, left, objText, keyText);
        if (listContains !== undefined) {
            return listContains;
        }
        return `Helpers.inOp(${objText}, ${keyText})`;
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

        // a write to a Long literal-limit local keeps its Long box
        if (op === SyntaxKind.EqualsToken && isIdentifier(left) && isNumericLiteral(right)
            && this.javaLongLimitLiteralLocalCached(this.javaDeclarationOfIdentifier(left))) {
            return `${this.printNode(left, 0)} = ${this.printNode(right, 0)}L`;
        }
        // `=` by target kind (a write to a natively declared parameter casts its right side), then `in`
        const assignment = op !== SyntaxKind.EqualsToken ? undefined : {
            [SyntaxKind.Identifier]: () => this.javaParameterAssignmentCast(left, right, identation),
            [SyntaxKind.ArrayLiteralExpression]: () => this.printJavaArrayDestructuring(left, right, identation),
            [SyntaxKind.ElementAccessExpression]: () => this.printJavaElementWrite(node, left, right),
        }[left.kind]?.();
        if (assignment !== undefined) {
            return assignment;
        }
        if (op === SyntaxKind.InKeyword) {
            return this.printJavaInExpression(left, right);
        }
        const modComparison = this.printJavaModComparison(left, right, op);
        if (modComparison !== undefined) {
            return modComparison;
        }
        // native comparison when both operands provably print as Java numbers. `>` is exact for every
        // numeric pair (isGreaterThan is a toDouble compare, NaN included); `>=` / `<` / `<=` also go
        // through the helper's isEqual, so they need operands isEqual reproduces exactly.
        if (op === SyntaxKind.LessThanToken || op === SyntaxKind.GreaterThanToken ||
            op === SyntaxKind.LessThanEqualsToken || op === SyntaxKind.GreaterThanEqualsToken) {
            const leftKind = this.javaPrimitiveOperandKind(left);
            const rightKind = this.javaPrimitiveOperandKind(right);
            const orderingSafe = op === SyntaxKind.GreaterThanToken
                || (leftKind !== 'double' && rightKind !== 'double');
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

            const arithmetic = this.printInlineHelperArithmetic(left, right, leftText, rightText, op)
                ?? this.printDeclaredBoxArithmetic(node, left, right, leftText, rightText, op)
                ?? this.printIntegralCallArithmetic(left, right, leftText, rightText, op)
                ?? this.printParseToIntDoubleProduct(node, left, right, leftText, rightText, op);
            if (arithmetic !== undefined) {
                return arithmetic;
            }
            const compound = { [SyntaxKind.PlusEqualsToken]: 'add', [SyntaxKind.MinusEqualsToken]: 'subtract' }[op];
            if (compound !== undefined) {
                return `${leftText} = Helpers.${compound}(${leftText}, ${rightText})`;
            }
            const wrapper = this.binaryExpressionsWrappers[op];
            return this.printNativeEqualityIfProvable(node, leftText, rightText) ?? `${wrapper[0]}${leftText}, ${rightText}${wrapper[1]}`;
        }

        return undefined;
    }

    // Helpers.isGreaterThan answers its own predicate when an operand is null (GT: a != null && b == null;
    // LT = !GT && !EQ; GE = GT || EQ; LE = LT || EQ), so a Long/Integer/Double box compares natively
    // inside that exact null table. `>` is a toDouble compare for every numeric pair; `>= < <=` also go
    // through isEqual, so they stay native only for integral pairs (no NaN / BigDecimal rounding arm).

    // 'long' | 'double' for an operand the printer proves: a primitive-printing expression, or an
    // identifier whose printed declaration is a numeric type (boxed = may be null)
    // a `const q = recv.indexOf("lit")` local prints `Object q = <int indexOf>`: a non-null Integer box
    javaConstIndexOfLocal(node): boolean {
        const declaration: any = this.javaDeclarationOfIdentifier(node);
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || !isIdentifier(declaration.name)
            || (getCombinedNodeFlags(declaration) & NodeFlags.Const) === 0) {
            return false;
        }
        const init = declaration.initializer;
        if (init?.kind !== SyntaxKind.CallExpression || init.expression?.kind !== SyntaxKind.PropertyAccessExpression
            || init.expression.name.text !== 'indexOf' || init.arguments.length !== 1 || !isStringLiteral(init.arguments[0])) {
            return false;
        }
        let receiver = init.expression.expression;
        while (receiver.kind === SyntaxKind.PropertyAccessExpression) {
            receiver = receiver.expression;
        }
        return isIdentifier(receiver) || receiver.kind === SyntaxKind.ThisKeyword;
    }

    javaComparisonOperand(node): { kind: string, boxed: boolean, text?: string } | undefined {
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
        const baseField = this.javaPrimitiveBaseFieldKind(inner);
        if (baseField !== undefined) {
            return { kind: baseField, boxed: false };
        }
        if (!isIdentifier(inner) || !this.javaIdentifierPrintsDeclaredName(inner)) {
            return undefined;
        }
        if (this.javaLongParameterRead(inner)) {
            return { kind: 'long', boxed: !this.javaNullGuardAdmitsRead(inner) };
        }
        const declared = this.javaDeclaredNumericFamily(inner);
        if (declared === undefined) {
            return this.javaConstIndexOfLocal(inner) ? { kind: 'long', boxed: false, text: `((Integer) ${inner.text})` } : undefined;
        }
        const kind = (declared === 'Double' || declared === 'double') ? 'double' : 'long';
        return { kind, boxed: JAVA_BOXED_NUMERIC_TYPES.has(declared) };
    }

    // ral-77j3: `this.<field>` read of a numeric field the hand-written BaseExchange declares as a Java
    // primitive (`public int minFundingAddressLength`, `public double rateLimit`): never null, and
    // its static kind is fixed whatever a venue's describe() writes into it. Only a field whose TS
    // declaration is the base class's own (no venue redeclares it) qualifies.
    javaPrimitiveBaseFieldKind(node): 'long' | 'double' | undefined {
        if (node === undefined || !isPropertyAccessExpression(node) || node.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const kind = ({ minFundingAddressLength: 'long', fetchHistoryCacheSize: 'long', rateLimit: 'double' } as const)[String(node.name.text)];
        if (kind === undefined) {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        const declaration = checker?.getSymbolAtLocation(node.name)?.valueDeclaration?.resolve();
        const file = String(declaration?.getSourceFile?.()?.fileName ?? '');
        if (!/(^|[\\/])ts[\\/]src[\\/]base[\\/]Exchange(\.nooverloads\.\d+)?\.ts$/.test(file)) {
            return undefined;
        }
        return kind;
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
        const a = l.text ?? this.printNode(left, 0);
        const b = r.text ?? this.printNode(right, 0);
        const cmp = `${a} ${this.SupportedKindNames[op]} ${b}`;
        if (!l.boxed && !r.boxed) {
            return `(${cmp})`; // a guarded Long parameter unboxes like a primitive
        }
        // each row is the helper's null table, with the unreachable nulls folded away: the guard side's
        // null test joins the compare (guarded by the other side's opposite test when that one is boxed)
        const rule = {
            [SyntaxKind.GreaterThanToken]: { guardLeft: true, join: '&&' },
            [SyntaxKind.LessThanToken]: { guardLeft: false, join: '&&' },
            [SyntaxKind.GreaterThanEqualsToken]: { guardLeft: false, join: '||' },
            [SyntaxKind.LessThanEqualsToken]: { guardLeft: true, join: '||' },
        }[op];
        if (rule === undefined) {
            return undefined;
        }
        const [guard, other] = rule.guardLeft ? [[a, l.boxed], [b, r.boxed]] : [[b, r.boxed], [a, l.boxed]];
        const [guardTest, otherTest, otherJoin] = rule.join === '&&' ? ['!=', '==', '||'] : ['==', '!=', '&&'];
        const parts = [guard[1] ? `${guard[0]} ${guardTest} null` : undefined, other[1] ? `(${other[0]} ${otherTest} null ${otherJoin} ${cmp})` : cmp];
        return `(${parts.filter((x) => x !== undefined).join(` ${rule.join} `)})`;
    }

    // `(a % N) <op> M` (N a non-zero integer literal, a an int/long operand, M an int literal): the
    // native mod prints a finite integral double |v| < |N|, where isEqual (IsInteger -> toLong) and
    // isGreaterThan (toDouble) both reduce to the plain double comparison against M.
    javaIntegralModOperand(node): boolean {
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
        if (leftKind !== 'int' && leftKind !== 'long') {
            return false;
        }
        const divisor = node.right;
        if (this.javaIntegerLiteralKind(divisor) !== 'int' || Number((divisor as any).text) === 0) {
            return false;
        }
        return true;
    }

    printJavaModComparison(left, right, op): string | undefined {
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
        const modLeft = this.javaIntegralModOperand(left);
        const modRight = !modLeft && this.javaIntegralModOperand(right);
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

    // ===== numeric operands and native arithmetic =====
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
        const forStatement = this.javaForCounterStatement(declaration);
        if (forStatement === undefined) {
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
    // only while every write in the declaring function writes the same kind.
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
        return !this.javaTreeSome(owner, (node) => {
            if (isBinaryExpression(node)) {
                const op = node.operatorToken.kind;
                return (this.isAssignmentOperator(op) && this.expressionReferencesSymbol(node.left, symbol)
                    && (op !== SyntaxKind.EqualsToken || this.javaPrintedNumberKind(node.right, 0) !== kind)) || undefined;
            }
            if ((node.kind === SyntaxKind.ForOfStatement || node.kind === SyntaxKind.ForInStatement)
                && this.expressionReferencesSymbol(node.initializer, symbol)) {
                return true;
            }
            return ((isPrefixUnaryExpression(node) || isPostfixUnaryExpression(node)) && this.isIncDecOperator(node.operator)
                && kind !== 'int' && this.expressionReferencesSymbol(node.operand, symbol)) || undefined;
        });
    }

    // box/primitive kind of an operand the printer prints as a native number, or undefined
    // when the printed value could be any box (a call, a parameter, an `any` local)
    javaPrintedNumberKind(node, depth = 0) {
        return this.javaEqualityLiteralKind(node) ?? this.javaNativeLengthKind(node)
            ?? (this.isJavaPrimitiveCounterReference(node) ? 'int' : undefined) ?? this.javaNativeArithmeticKind(node)
            ?? (depth < 2 ? this.javaLocalNumberKind(node, depth) : undefined);
    }

    // true when the printer prints the operand as a Java primitive (a decimal literal, a
    // native .length/.size(), a for counter or a nested native arithmetic node) rather
    // than as the Object-declared box every other local gets
    javaOperandPrintsPrimitiveNumber(node): boolean {
        // javaPrimitiveOperandKind also covers literals and native arithmetic, plus `.length` on a receiver
        // whose Java text the printer does not prove (the int Helpers.getArrayLength) and indexOf/search
        return this.javaNativeLengthKind(node) !== undefined
            || this.isJavaPrimitiveCounterReference(node)
            || this.javaPrimitiveOperandKind(node) !== undefined;
    }

    // the numeric family the pass declared for a local (`Long`/`Double`/`Integer` boxed,
    // `int`/`long`/`double` primitive), undefined when nothing was declared or the declared
    // type is not numeric
    javaDeclaredNumericFamily(expression): string | undefined {
        const type = this.javaDeclaredTypeOf(expression)?.trim();
        return type !== undefined && JAVA_DECLARED_NUMERIC_TYPES.has(type) ? type : undefined;
    }

    // helper removal: native emission when the checker proves the printed
    // operand is a Java numeric primitive / List / Map

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
        const declarations = forStatement.initializer?.declarations ?? [];
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
        const incrementor = forStatement.incrementor;
        if (!incrementor || incrementor.operand?.kind !== SyntaxKind.Identifier || incrementor.operand.text !== node.text) {
            return false;
        }
        return incrementor.kind === SyntaxKind.PostfixUnaryExpression || incrementor.kind === SyntaxKind.PrefixUnaryExpression;
    }

    // a plain non-nullable TS number: the narrowed index is a primitive on every path
    javaNonNullableNumberType(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined || node === undefined) {
            return false;
        }
        const type = this.javaTry(() => checker.getTypeAtLocation(node));
        if (type === undefined || type.getAliasSymbol?.() !== undefined) {
            return false;
        }
        return (type.flags & TypeFlags.Number) !== 0 || (type.flags & TypeFlags.NumberLiteral) !== 0;
    }

    // a side-effect-free expression of integer leaves: a numeric literal, a `var` loop counter, or
    // a name whose declaration prints a Java numeric type, combined with binary operators
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

    // the Java kind a numeric operand provably prints with: decimal integer literal -> 'long',
    // fractional literal -> 'double', a nested native `+ - * /` -> its kind, a local retyped
    // `Long`/`Double` -> that kind. Hex/binary literals, negatives, calls, untyped locals: undefined.
    // `widened` is the `+` operand policy of printWidenedNativeAdd: any for counter, base calls only,
    // and a nested `+` by its own widened kind.
    javaProvableNumericKind(node, allowDeclaredLocals = true, widened = false): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        if (node.kind === SyntaxKind.ParenthesizedExpression) {
            return widened ? this.javaWidenedNumericKind(node.expression)
                : this.javaProvableNumericKind(node.expression, allowDeclaredLocals, widened);
        }
        if (isNumericLiteral(node)) {
            const text = node.text;
            if (widened && this.javaIntegerLiteralKind(node) !== undefined) {
                return this.javaIntegerLiteralKind(node);
            }
            if (/^0[xXbBoO]/.test(text)) {
                return undefined;
            }
            return /[.eE]/.test(text) ? 'double' : 'long';
        }
        if (node.kind === SyntaxKind.Identifier) {
            if (widened ? this.javaIntForCounter(node) : this.javaPrintedIntCounter(node)) {
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
            const parse = this.javaNativeParseKind(node) ?? (this.javaBaseParseToIntCall(node) ? 'long' : undefined);
            if (parse !== undefined) {
                return parse;
            }
            if (widened) {
                return undefined;
            }
            // indexOf/search print int, Math.round a primitive long (javaPrintedCallKind)
            const printed = this.javaPrintedCallKind(node);
            return (printed === 'int' || printed === 'long') ? printed : undefined;
        }
        if (node.kind === SyntaxKind.BinaryExpression) {
            return widened && node.operatorToken.kind === SyntaxKind.PlusToken
                ? this.javaWidenedAddKind(node) : this.javaNativeArithmeticKind(node, allowDeclaredLocals);
        }
        if (this.javaLengthIntRead(node)) {
            return 'int';
        }
        return undefined;
    }

    // `parseInt(x)` / `parseFloat(x)` the printer spells Long.parseLong / Double.parseDouble /
    // `((Number)x).longValue()`: a primitive (the parse throws before any null could reach the operator)
    javaNativeParseKind(node): string | undefined {
        const callee = isIdentifier(node?.expression) ? node.expression.text : undefined;
        if (callee !== 'parseInt' && callee !== 'parseFloat') {
            return undefined;
        }
        const printed = this.javaTry(() => this.printNativeScalarParse(node, callee) ?? this.printStringTypedParse(node, callee));
        if (typeof printed !== 'string') {
            return undefined;
        }
        if (callee === 'parseInt') {
            return /^(Long\.parseLong\(|\(\(Number\))/.test(printed) ? 'long' : undefined;
        }
        return printed.startsWith('Double.parseDouble(') ? 'double' : undefined;
    }

    // `this.parseToInt(x)` resolving into the base Exchange: BaseExchange.java returns
    // `Double.parseDouble(..).longValue()` boxed, which throws rather than answer null
    javaBaseParseToIntCall(node): boolean {
        if (this.javaThisCallName(node) !== 'parseToInt') {
            return false;
        }
        const fileName = this.javaTry(() => this.javaCalleeFileName(node)) ?? '';
        return /(^|[\\/])ts[\\/]src[\\/]base[\\/]Exchange(\.nooverloads\.\d+)?\.ts$/.test(fileName);
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
        let javaType = declaration === undefined ? undefined : this.javaTry(() => this.javaDeclaredTypeOfDeclaration(declaration));
        if (javaType === undefined && typeof this.javaExpressionTypeResolver === 'function') {
            javaType = this.javaTry(() => this.javaExpressionTypeResolver(node));
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
    // anywhere in the subtree (`+` never consumes one).
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

    // 'long' | 'double' for a nested `+` this printer already prints natively through
    // printWidenedNativeAdd, or undefined. Mirrors that printer's operand proof (javaProvableNumericKind, widened)
    // behind the family and concat tests printInlineHelperArithmetic applies before it calls it.
    javaNestedAddKind(node): string | undefined {
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
        const declaration = this.javaCalleeDeclaration(node);
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
        const declaration = this.javaTry(() => this.javaCalleeDeclaration(node, this.getChecker()));
        if (declaration === undefined) {
            return false;
        }
        const fileName = declaration.getSourceFile?.()?.fileName ?? '';
        return /(^|[\\/])ts[\\/]src[\\/]base[\\/]functions[\\/]misc\.ts$/.test(fileName);
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
        const forStatement = this.javaForCounterStatement(declaration);
        if (forStatement === undefined || this.javaIntegerLiteralKind(forStatement.initializer.declarations[0].initializer) !== 'int') {
            return false;
        }
        return this.javaCounterHasNoBoxWrite(node, symbol);
    }

    // the `for` statement whose single-declarator header declares `declaration` with an integer literal
    javaForCounterStatement(declaration): any {
        const list = declaration?.parent;
        const forStatement = list?.parent;
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || list?.declarations?.length !== 1
            || forStatement?.kind !== SyntaxKind.ForStatement || forStatement.initializer !== list
            || this.javaIntegerLiteralKind(declaration.initializer) === undefined) {
            return undefined;
        }
        return forStatement;
    }

    // no `=`/compound assignment anywhere in the enclosing function writes this counter;
    // `++`/`--` keep the primitive int, any other operator would not
    javaCounterHasNoBoxWrite(node, symbol) {
        const scope = this.javaFunctionOrFile(node);
        return scope !== undefined && !this.javaTreeSome(scope, (current) => (isIdentifier(current)
            && this.getChecker().getSymbolAtLocation(current) === symbol
            && current.parent !== undefined && isBinaryExpression(current.parent) && current.parent.left === current
            && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(current.parent.operatorToken.kind)) || undefined);
    }

    // `x.length` on a String/List receiver prints `((String)x).length()` /
    // `((java.util.List<?>)x).size()` — a Java int on every path printJavaLength takes
    javaLengthIntRead(node) {
        if (node?.kind !== SyntaxKind.PropertyAccessExpression || node.name?.text !== 'length') {
            return false;
        }
        return this.javaLengthKind(node.expression) !== undefined;
    }

    // the kind of a nested native `+` this rule prints, or undefined when it keeps the helper
    // the numeric kind of one `+` operand; the embedding layer extends this operand table
    javaWidenedNumericKind(node): string | undefined {
        return this.javaProvableNumericKind(node, true, true);
    }

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
        return this.javaTry(() => this.javaBoxedLongResolver(left) === true, false) ? `(${leftText} == null ? null : (Object) (${leftText} + ${rightText}L))` : undefined;
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

    // integer literals print as Java `int`; the helpers normalize Integer to Long before
    // the arithmetic, so native integer arithmetic is emitted in long to keep the boxed
    // result identical
    javaPrintOperandAsLong(node, text) {
        if (!isNumericLiteral(node) || /[.eE]/.test(node.text)) {
            return text;
        }
        return /L$/.test(text) ? text : text + 'L';
    }

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
        if (!isIdentifier(inner) || text.trim() !== String(inner.text)
            || !this.javaIdentifierPrintsDeclaredName(inner)) {
            return undefined;
        }
        const declaration = this.javaDeclarationOfIdentifier(inner);
        if (declaration !== undefined && !this.javaIdentifierKeepsDeclaredName(inner)) {
            return undefined; // a renamed capture (`finalX`) prints against another declaration
        }
        let declared: string | undefined;
        if (declaration !== undefined) {
            declared = this.javaTry(() => this.javaDeclaredTypeOfDeclaration(declaration));
            if (declared === undefined && this.javaLongParameterRead(inner)) {
                declared = 'Long'; // an unwritten default-valued `Int` parameter printed as the core's Long
            }
        } else if (typeof this.javaBindingElementTypeResolver === 'function') {
            const element: any = this.getChecker().getSymbolAtLocation(inner)?.valueDeclaration?.resolve();
            if (element?.kind === SyntaxKind.BindingElement && (element.name as any)?.text === inner.text) {
                declared = this.javaTry(() => this.javaBindingElementTypeResolver(element));
            }
        }
        const type = declared?.replace(/^final\s+/, '').trim();
        const family = this.javaDeclaredNumericTypeKind(type);
        const kind = family === undefined ? undefined : family + (type === type.toLowerCase() ? 'prim' : 'box');
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
        const type: any = this.javaTry(() => this.checkerOrUndefined()?.getTypeAtLocation(node));
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

    // `- *` where each operand is a primitive long/int local, an integer literal, a nested native
    // product/difference, or a base `this.precisionFromString/parseTimeframe(..)` (BaseExchange
    // declares both `public int`): Helpers.multiply/subtract's Long arm is the same long result.
    javaIntegralOperandKind(node, text: string): 'long' | 'int' | undefined {
        const literal = (isPrefixUnaryExpression(node) && node.operator === SyntaxKind.MinusToken) ? node.operand : node;
        if (isNumericLiteral(literal)) {
            return /^\d{1,18}$/.test(literal.text) ? 'long' : undefined;
        }
        if (isBinaryExpression(node)) {
            return (node.operatorToken.kind === SyntaxKind.MinusToken || node.operatorToken.kind === SyntaxKind.AsteriskToken)
                && /^\(.*\)$/.test(text) && !text.includes('Helpers.') ? 'long' : undefined;
        }
        if (isIdentifier(node)) {
            const kind = this.javaDeclaredBoxOperandKind(node, text);
            return kind === 'longprim' ? 'long' : kind === 'intprim' ? 'int' : undefined;
        }
        if (isCallExpression(node) && isPropertyAccessExpression(node.expression)
            && node.expression.expression.kind === SyntaxKind.ThisKeyword
            && ['precisionFromString', 'parseTimeframe'].includes(node.expression.name.text)) {
            const declaration = this.javaCalleeDeclaration(node, this.getChecker());
            const fileName = declaration?.getSourceFile?.()?.fileName ?? '';
            return /(^|[\\/])ts[\\/]src[\\/]base[\\/](Exchange(\.nooverloads\.\d+)?|functions[\\/]\w+)\.ts$/.test(fileName) ? 'int' : undefined;
        }
        return undefined;
    }

    printIntegralCallArithmetic(left, right, leftText: string, rightText: string, op): string | undefined {
        if (op !== SyntaxKind.MinusToken && op !== SyntaxKind.AsteriskToken) {
            return undefined;
        }
        const ta = this.javaIntegralOperandKind(left, leftText);
        const tb = this.javaIntegralOperandKind(right, rightText);
        // only a site with an int call operand: the declared-local pairs belong to the box rules
        if (ta === undefined || tb === undefined || (!isCallExpression(left) && !isCallExpression(right))) {
            return undefined;
        }
        const literal = (n, t: string) => (isNumericLiteral(n) || isPrefixUnaryExpression(n)) ? t + 'L' : t;
        const a = ta === 'int' ? `((long) ${leftText})` : literal(left, leftText);
        const b = tb === 'int' && ta === 'int' ? `((long) ${rightText})` : literal(right, rightText);
        return `(${a} ${op === SyntaxKind.MinusToken ? '-' : '*'} ${/^-/.test(b) ? `(${b})` : b})`;
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
        const texts = [leftText.trim(), rightText.trim()];
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
        // `this.milliseconds() - <long-provable>`: Helpers.subtract's Long - Long branch is the same long
        if (op === SyntaxKind.MinusToken && this.javaThisCallNumericKind(left) === 'long'
            && this.javaProvableNumericKind(right) === 'long') {
            return `(${leftText} - ${this.javaPrintOperandAsLong(right, rightText)})`;
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
            if (this.javaProvableNumericKind(left) === undefined || this.javaProvableNumericKind(right) === undefined) {
                return undefined;
            }
            return `(((double) ${leftText}) % ((double) ${rightText}))`;
        }
        if (isMultiply && this.javaLiteralFractionalProduct(left, right)) {
            return `(${leftText} * ${rightText})`;
        }
        let leftKind = this.javaProvableNumericKind(left);
        let rightKind = this.javaProvableNumericKind(right);
        // an unproven pair retries with the nested-sum operand kind, so a native `+`
        // this printer already prints is consumable by the enclosing `- * /`
        if (this.javaNativeArithmeticPairKind(false, isMultiply, isDivide, leftKind, rightKind) === undefined) {
            leftKind = leftKind ?? this.javaNestedAddKind(left);
            rightKind = rightKind ?? this.javaNestedAddKind(right);
        }
        if (this.javaNativeArithmeticPairKind(false, isMultiply, isDivide, leftKind, rightKind) === undefined) {
            return undefined;
        }
        if (isDivide) {
            // TS `/` is always float division and Helpers.divide never returns a long
            return `(((double) ${leftText}) / ((double) ${rightText}))`;
        }
        const operator = isMinus ? '-' : '*';
        const widenedLeft = this.javaPrintWidenedOperand(leftKind, 'long', left, leftText);
        const widenedRight = this.javaPrintWidenedOperand(rightKind, 'long', right, rightText);
        return `(${widenedLeft} ${operator} ${widenedRight})`;
    }

    // Helpers.mathMin/mathMax take Object, tolerate null and return the ORIGINAL box; Math.min/max take
    // primitives, so the native call needs both operands primitive of one family: literals, `for`
    // counters, `.length`/`.size()`, native long arithmetic; the only NaN-free double is a literal.
    javaNativeMathMinMaxOperandKind(node) {
        if (this.javaIntegerLiteralKind(node) !== undefined || this.isJavaPrimitiveForCounter(node)
            || this.javaLengthIntRead(node)) {
            return 'integral';
        }
        if (isNumericLiteral(node)) {
            return this.javaProvableNumericKind(node) === 'double' ? 'double' : undefined;
        }
        if (this.javaGuardedLongLocalRead(node)) {
            return 'integral';
        }
        // a nested Math.min/Math.max that prints natively is a primitive of its operands' family
        const inner = this.unwrapParenthesized(node);
        if (isCallExpression(inner) && inner.arguments.length === 2 && /^Math\.(?:min|max)$/.test(inner.expression.getText())) {
            const kind = this.javaNativeMathMinMaxOperandKind(inner.arguments[0]);
            return kind !== undefined && kind === this.javaNativeMathMinMaxOperandKind(inner.arguments[1]) ? kind : undefined;
        }
        return this.javaProvableNumericKind(node) === 'long' ? 'integral' : undefined;
    }

    // a `const` local the printer declares `Long`, read where a null test already excludes null:
    // it unboxes like a primitive
    javaGuardedLongLocalRead(node): boolean {
        if (!isIdentifier(node) || !this.javaIdentifierPrintsDeclaredName(node)) {
            return false;
        }
        const declaration: any = this.javaDeclarationOfIdentifier(node);
        if (declaration?.kind !== SyntaxKind.VariableDeclaration || (getCombinedNodeFlags(declaration) & NodeFlags.Const) === 0) {
            return false;
        }
        const type = this.javaTry(() => this.javaDeclaredTypeOfDeclaration(declaration));
        return typeof type === 'string' && type.replace(/^final\s+/, '').trim() === 'Long' && this.javaNullGuardAdmitsRead(node);
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

    // A local whose initializer prints as native arithmetic holds a String / Long / Double box, so the
    // declaration carries that type; every other use is scanned first, as it changes resolution.

    // the Java type of the native arithmetic this printer prints for a `+ - * / +=`
    // node, or undefined when the node keeps the helper (its printed value is an
    // Object box). Mirrors printInlineHelperArithmetic operand-for-operand.
    javaNativeArithmeticType(node) {
        const value = this.unwrapParenthesized(node);
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

    // the enclosing function-like node: the write scan scope of a typed local
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
        const value = this.unwrapParenthesized(right);
        if (value === undefined) {
            return false;
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

    // the narrowed declaration needs every later use of the local in the enclosing
    // function to still compile and resolve the way the Object declaration did
    javaArithmeticLocalIsSafeToType(scope, declaration, javaType) {
        if (scope === undefined) {
            return false;
        }
        const sourceName = declaration.name.text;
        return !this.javaTreeSome(scope, (n) => (n.kind === SyntaxKind.Identifier && n.text === sourceName && n !== declaration.name
            && !this.javaArithmeticLocalUseIsSafe(n, declaration, javaType)) || undefined);
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

    // the operand prints as an integral Java number: `+ - Math.min Math.max` and `(int)` compile on it
    javaPrintsIntegralNumber(node): boolean {
        const n = this.unwrapParenthesized(node);
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
        const forStatement = this.javaForCounterStatement(declaration);
        if (declaration.name.text !== node.text || forStatement === undefined) {
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

    // `-x` in the true arm of `(x !== undefined) ? ... : ...` on an unwritten Long/Double local:
    // the guard rules out null, so the helper's box-preserving negation is the box's valueOf
    javaNullGuardedNegationBox(node): string | undefined {
        const operand = node.operand;
        if (!isIdentifier(operand)) {
            return undefined;
        }
        const declaration: any = this.javaDeclarationOfIdentifier(operand);
        if (declaration === undefined || !isVariableDeclaration(declaration) || this.javaLocalHasWriteAtAll(declaration.name)) {
            return undefined;
        }
        const box = this.javaDeclaredTypeOfDeclaration(declaration);
        if (box !== 'Long' && box !== 'Double') {
            return undefined;
        }
        const symbol = this.getChecker().getSymbolAtLocation(operand);
        let child: any = node;
        for (let current: any = node.parent; current !== undefined && !isFunctionLike(current); child = current, current = current.parent) {
            if (current.kind !== SyntaxKind.ConditionalExpression) {
                continue;
            }
            if (current.whenTrue !== child) {
                return undefined;
            }
            let condition: any = current.condition;
            while (condition?.kind === SyntaxKind.ParenthesizedExpression) {
                condition = condition.expression;
            }
            const op = condition?.operatorToken?.kind;
            const right = condition?.right;
            const nullish = right?.kind === SyntaxKind.NullKeyword || (isIdentifier(right) && right.text === 'undefined');
            if (condition?.kind === SyntaxKind.BinaryExpression && (op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken)
                && nullish && isIdentifier(condition.left) && this.getChecker().getSymbolAtLocation(condition.left) === symbol) {
                return box;
            }
            return undefined;
        }
        return undefined;
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
            const guardedBox = this.javaNullGuardedNegationBox(node);
            if (guardedBox !== undefined) {
                return `${guardedBox}.valueOf(-${leftSide})`;
            }
            return `Helpers.opNeg(${leftSide})`;
        }
        return super.printPrefixUnaryExpression(node, identation);
    }

    // ===== strings: concat, parse, slice, split and string methods =====
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
        const declaration: any = this.javaTry(() => this.javaCalleeDeclaration(node, this.getChecker()));
        if (declaration === undefined) {
            return false; // an unresolvable call prints Helpers.callDynamically (Object)
        }
        const fileName = declaration.getSourceFile?.()?.fileName;
        return fileName !== undefined && JAVA_STRING_RETURN_BASE_FILES.test(fileName);
    }

    // `k` where the consumer declares k as a Java String: the helper's String branch (the
    // only one that can answer true for a map) is the native lookup, and no null key can
    // reach containsKey
    javaDeclaredStringType(expression) {
        const type = this.javaDeclaredTypeOf(expression);
        return type !== undefined && JAVA_DECLARED_STRING_TYPE.test(type);
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

    // a key Java proves String: a literal, an `x as string` (prints `((String)x)`) or a String-declared name
    javaStringProvenKey(key): boolean {
        if (isStringLiteralLikeNode(key)) {
            return true;
        }
        const node = this.unwrapParenthesized(key);
        return (isAsExpression(node) && node.type?.kind === SyntaxKind.StringKeyword) || this.javaDeclaredStringType(node);
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
        const operandType = this.javaTry(() => checker?.getTypeAtLocation(operand));
        if (operandType === undefined || !this.javaIsStringArrayType(checker, operandType)) {
            return undefined;
        }
        const list = `((java.util.List<String>)(${operand.text}))`;
        const index = this.printNode(node.argumentExpression, 0);
        return `(${list} == null || ${index} < 0 || ${index} >= ${list}.size() ? null : ${list}.get(${index}))`;
    }

    // `+ - * / += -=` print native Java instead of Helpers.add/subtract/multiply/divide when BOTH
    // operands are checker-typed in the same non-nullable scalar family with the matching Java kind

    // the TypeScript scalar family of a binary operand: plain `string`/`number` and
    // their literals only. The nullable aliases (Str/Int/Num/Bool), unions and `any`
    // can hold undefined at runtime, which the helpers absorb.
    javaScalarFamily(node): string | undefined {
        const type: any = this.checkerOrUndefined()?.getTypeAtLocation(node);
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

    // the printed Java for this operand is statically a String (a literal, a nested native concat, or a
    // form javaExpressionTypeResolver names `String`): Java compiles `+` as concat only with one such
    // operand, so a String local anchors the concat like a literal does
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
        return this.javaTry(() => this.javaExpressionTypeResolver(node) === 'String', false);
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
        const type: any = this.checkerOrUndefined()?.getTypeAtLocation(node);
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
        // a conditional receiver keeps the helper: a line carrying a `?` never goes native
        // in this family
        if (this.unwrapParenthesized(receiver).kind === SyntaxKind.ConditionalExpression) {
            return undefined;
        }
        // the receiver and the separator are plain TS `string`s (no alias, no union): the helper's
        // String.valueOf/null branches are unreachable and Pattern.quote takes the separator as is
        if (this.javaScalarFamily(receiver) !== 'string' || this.javaScalarFamily(separator) !== 'string') {
            return undefined;
        }
        return `${this.ARRAY_OPENING_TOKEN}${this.javaNativeSplitText(name, parsedArg, receiver)}${this.ARRAY_CLOSING_TOKEN}`;
    }

    javaNativeSplitText(name, parsedArg, receiver = undefined): string {
        return `${this.javaStringReceiverText(receiver, name)}.split(java.util.regex.Pattern.quote(${parsedArg}))`;
    }

    // ral-84j1: the text of a String-method receiver (or String argument). An identifier the
    // embedding layer declares a Java String (javaDeclaredStringType, decided from the TS checker
    // there) already has the static type the method needs, so the checkcast every Object local
    // takes is not printed; anything else keeps `((String)x)`.
    javaStringReceiverText(receiver, name): string {
        return this.javaDeclaredStringElementLocal(receiver, name) ? name : `((String)${name})`;
    }

    // ral-84j1: `k` printed bare, bound to a `const k = xs[..]` element read (the element-read lane's
    // own shape, from the AST) that the embedding layer declares a Java String
    javaDeclaredStringElementLocal(node, printed: string): boolean {
        return this.javaDeclaredElementLocalType(node, printed) !== undefined && this.javaDeclaredStringType(node);
    }

    // the declared Java type of a bare-printed `const x = xs[..]` element-read local, as the embedding
    // layer publishes it (undefined for any other binding or when nothing is published)
    javaDeclaredElementLocalType(node, printed: string): string | undefined {
        if (node === undefined || !isIdentifier(node) || printed !== node.text) {
            return undefined;
        }
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.initializer === undefined
            || !isElementAccessExpression(this.unwrapParenthesized(declaration.initializer))) {
            return undefined;
        }
        return this.javaDeclaredTypeOf(node);
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

    // parseInt catches NumberFormatException into null, parseFloat into 0.0, Helpers.toString maps
    // null to null, Helpers.padStart truncates: native form only where the fallback is unreachable.

    // `Helpers.toString(x)` is `x == null ? null : x.toString()`, so `String.valueOf(x)`
    // is exact for every argument that cannot be null. Only a numeric literal or a
    // nested `+ - * /` this rule prints natively qualifies: both are Java primitives.
    javaStringBoxText(node, text) {
        return this.javaProvableNumericKind(node) !== undefined ? `String.valueOf(${text})` : `Helpers.toString(${text})`;
    }

    // `parseInt(x)` / `parseFloat(x)` over an operand printing a java.lang.String -> Long.parseLong /
    // Double.parseDouble (throwing where the helper answered null / 0.0 is accepted); a Java numeric
    // primitive operand is parsed through String.valueOf
    printStringTypedParse(node, callee) {
        const args = node?.arguments;
        if (args === undefined || args.length !== 1) {
            return undefined;
        }
        const operand = this.unwrapParenthesized(args[0]);
        const castToString = isAsExpression(operand) && operand.type?.kind === SyntaxKind.StringKeyword;
        const printed = this.printNode(args[0], 0);
        // `s.replace(a, b)` on a TS string receiver that the printer spelled as the native
        // String.replaceFirst / replace: the call answers a java.lang.String
        const nativeReplace = isCallExpression(operand) && isPropertyAccessExpression(operand.expression)
            && (operand.expression.name.text === 'replace' || operand.expression.name.text === 'replaceAll')
            && this.javaScalarFamily(operand.expression.expression) === 'string'
            && /\.replace(First|All)?\(/.test(printed);
        const nativeName = callee === 'parseInt' ? 'Long.parseLong' : 'Double.parseDouble';
        if (!castToString && !nativeReplace && !this.javaDeclaredStringType(operand) && !this.javaResolvedString(operand)) {
            // a numeric literal / native arithmetic prints a Java primitive: stringify it in place
            // (parseInt only over integral kinds: Long.parseLong("1.5") throws where JS truncates)
            const kind = this.javaProvableNumericKind(operand);
            if (kind !== undefined && (callee === 'parseFloat' || kind !== 'double')) {
                return `${nativeName}(String.valueOf(${printed}))`;
            }
            // `parseInt (n as any)` over a checker-plain number: the helper answered the box's
            // truncating longValue (JS parseInt over a number string truncates too), so the
            // Number view prints the same value; a null box NPEs where the helper answered null
            if (callee === 'parseInt' && isAsExpression(operand) && operand.type?.kind === SyntaxKind.AnyKeyword
                && this.javaScalarFamily(operand.expression) === 'number') {
                return `((Number)${this.printNode(operand.expression, 0)}).longValue()`;
            }
            // `parseX (s as any)` whose inner expression prints a java.lang.String (a declared
            // String method / local): the `as any` only widens the TS type, so parse the inner text
            if (isAsExpression(operand) && operand.type?.kind === SyntaxKind.AnyKeyword
                && (this.javaDeclaredStringType(operand.expression) || this.javaResolvedString(operand.expression))) {
                return `${nativeName}(${this.printNode(operand.expression, 0)})`;
            }
            // a checker-plain TS string the printer spelled as an Object: type it at the site
            if (this.javaScalarFamily(operand) === 'string') {
                return `${nativeName}(((String)${printed}))`;
            }
            return undefined;
        }
        return `${nativeName}(${printed})`;
    }

    // `parseInt(x)` / `parseFloat(x)` -> the native parse, or undefined to keep the helper
    printNativeScalarParse(node, callee) {
        const args = node?.arguments;
        if (args === undefined || args.length !== 1 || !isStringLiteral(args[0])) {
            return undefined;
        }
        // a literal the JDK parser rejects throws where the helper answered null / 0.0 (accepted)
        const nativeName = callee === 'parseInt' ? 'Long.parseLong' : 'Double.parseDouble';
        return `${nativeName}(${this.printNode(args[0], 0)})`;
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
        // the receiver is already cast (`((String)x)`) by the printer or the ccxt local-typing pass,
        // or the checker proves a plain TS string, so the added cast cannot fire
        const castText = /^\(+\(String\)/.test(name);
        if (!castText && this.javaScalarFamily(receiver) !== 'string') {
            return undefined;
        }
        const receiverText = castText ? name : this.javaStringReceiverText(receiver, name);
        const length = args[0].text;
        const character = args[1].text[0];
        const pad = `'${character === "'" || character === '\\' ? `\\${character}` : character}'`;
        const lengthCall = `${receiverText}.length()`;
        return `(${lengthCall} >= ${length} ? ${receiverText}.substring(${lengthCall} - ${length})`
            + ` : String.format("%" + (${length} - ${lengthCall}) + "s", "").replace(' ', ${pad}) + ${receiverText})`;
    }

    printJsonStringifyCall(_node, _identation, parsedArg = undefined) {
        return `Helpers.json(${parsedArg})`;
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
        const receiverType: any = this.javaTry(() => checker.getTypeAtLocation(receiver));
        if (receiverType === undefined) {
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
            return `${this.javaStringReceiverText(receiver, name)}.indexOf(${parsedArg})`;
        }
        const argType: any = this.javaTry(() => checker.getTypeAtLocation(arg));
        if (argType === undefined) {
            return undefined;
        }
        // a bare identifier / field target the checker types as a plain string: the cast is
        // the printer's own startsWith/endsWith argument shape
        if (argType.getAliasSymbol?.() === undefined && this.isStringType(argType.flags)
            && (isIdentifier(arg) || isPropertyAccessExpression(arg))) {
            return `${this.javaStringReceiverText(receiver, name)}.indexOf(${this.javaStringReceiverText(arg, parsedArg)})`;
        }
        return undefined;
    }

    printIndexOfCall(node, _identation, name = undefined, parsedArg = undefined) {
        return this.javaNativeIndexOfCall(node, name, parsedArg) ?? this.javaNarrowedIndexOf(node, name, parsedArg) ?? `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
    }

    printSearchCall(node, _identation, name = undefined, parsedArg = undefined) {
        return `${this.javaStringReceiverText(node?.expression?.expression, name)}.indexOf(${parsedArg})`;
    }

    printStartsWithCall(node, _identation, name = undefined, parsedArg = undefined) {
        return `${this.javaStringReceiverText(node?.expression?.expression, name)}.startsWith(${this.javaStringReceiverText(node?.arguments?.[0], parsedArg)})`;
    }

    printEndsWithCall(node, _identation, name = undefined, parsedArg = undefined) {
        return `${this.javaStringReceiverText(node?.expression?.expression, name)}.endsWith(${this.javaStringReceiverText(node?.arguments?.[0], parsedArg)})`;
    }

    printTrimCall(node, _identation, name = undefined) {
        return `${this.javaStringReceiverText(node?.expression?.expression, name)}.trim()`;
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

    printToUpperCaseCall(node, _identation, name = undefined) {
        return `${this.javaStringReceiverText(node?.expression?.expression, name)}.toUpperCase()`;
    }

    printToLowerCaseCall(node, _identation, name = undefined) {
        return `${this.javaStringReceiverText(node?.expression?.expression, name)}.toLowerCase()`;
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
        const kind = this.javaTry(() => {
            const type = this.getChecker().getTypeAtLocation(receiverExpression);
            if (this.isStringType(type.flags)) {
                return 'String';
            }
            return this.isJavaListType(type) && !this.isVarargsArrayReference(receiverExpression) ? 'List' : undefined;
        });
        if (kind === undefined) {
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

    // a never-null Java String argument: a string literal, or a `+` with a string-literal side that
    // printed as javac concat (not Helpers.add)
    javaReplaceNonNullStringArgument(node, printed): boolean {
        const n = this.unwrapParenthesized(node);
        if (n === undefined || isStringLiteral(n)) {
            return n !== undefined;
        }
        return isBinaryExpression(n) && n.operatorToken.kind === SyntaxKind.PlusToken
            && (isStringLiteral(this.unwrapParenthesized(n.left)) || isStringLiteral(this.unwrapParenthesized(n.right)))
            && typeof printed === 'string' && printed.startsWith('(') && !printed.startsWith('((');
    }

    // `s.replace (a, b)` on a String-declared local: Helpers.replace is a literal first-occurrence
    // replace with null -> null on the receiver; both arguments must be never-null Strings
    javaNativeStringReplaceCall(node, name, parsedArg, parsedArg2): string | undefined {
        const receiver = isPropertyAccessExpression(node?.expression) ? node.expression.expression : undefined;
        const args = node?.arguments;
        if (receiver === undefined || !isIdentifier(receiver) || args?.length !== 2 || name !== receiver.text
            || this.javaDeclaredStringType(receiver) !== true
            || !this.javaReplaceNonNullStringArgument(args[0], parsedArg) || !this.javaReplaceNonNullStringArgument(args[1], parsedArg2)) {
            return undefined;
        }
        // two literals are the embedding layer's literal-replace passes
        if (isStringLiteral(this.unwrapParenthesized(args[0])) && isStringLiteral(this.unwrapParenthesized(args[1]))) {
            return undefined;
        }
        const plain = (arg, chars) => isStringLiteral(this.unwrapParenthesized(arg)) && !chars.test(this.unwrapParenthesized(arg).text);
        const pattern = plain(args[0], /[\\^$.|?*+()[\]{}]/) ? parsedArg : `java.util.regex.Pattern.quote(${parsedArg})`;
        const replacement = plain(args[1], /[$\\]/) ? parsedArg2 : `java.util.regex.Matcher.quoteReplacement(${parsedArg2})`;
        return `(${name} == null ? null : ((String)${name}).replaceFirst(${pattern}, ${replacement}))`;
    }

    printReplaceCall(node, _identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return this.javaNativeStringReplaceCall(node, name, parsedArg, parsedArg2)
            ?? `Helpers.replace((String)${name}, (String)${parsedArg}, (String)${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        // two plain non-empty string literals: String.replace is the all-occurrences replacement;
        // the receiver null guard (side-effect-free receivers only) keeps the helper's null -> null
        const pattern = this.stringLiteralArgument(node?.arguments?.[0]);
        const replacement = this.stringLiteralArgument(node?.arguments?.[1]);
        const receiver = this.sideEffectFreeReceiver(node?.expression);
        if (pattern !== undefined && replacement !== undefined && receiver) {
            return `(${name} == null ? null : ((String)${name}).replace(${pattern}, ${replacement}))`;
        }
        // a toLowerCase/toUpperCase/trim receiver is a non-null String (or throws first, as the helper's argument would)
        const callee = node?.expression?.expression;
        // generated library tiers only (exchanges, pro, prediction, base); tests keep the helpers
        const file = node?.getSourceFile?.()?.fileName ?? '';
        if (pattern !== undefined && replacement !== undefined && file.includes('ts/src/') && !file.includes('ts/src/test/')
            && isCallExpression(callee) && isPropertyAccessExpression(callee.expression) && callee.arguments.length === 0
            && ['toLowerCase', 'toUpperCase', 'trim'].includes(callee.expression.name.text)
            && /^(?:\(\(String\)[\w.]+\)|[\w.]+)\.(?:toLowerCase|toUpperCase|trim)\(\)$/.test(name)) {
            return `${name}.replace(${pattern}, ${replacement})`;
        }
        const typed = this.javaTypedStringReplaceAllCall(node, name, parsedArg, parsedArg2);
        if (typed !== undefined) {
            return typed;
        }
        return `Helpers.replaceAll((String)${name}, (String)${parsedArg}, (String)${parsedArg2})`;
    }

    javaIsAtomOperand(node): boolean {
        const n = this.unwrapParenthesized(node);
        return n !== undefined && (n.kind === SyntaxKind.Identifier || n.kind === SyntaxKind.PropertyAccessExpression
            || n.kind === SyntaxKind.ThisKeyword || n.kind === SyntaxKind.NumericLiteral);
    }

    // the printed text of this operand may appear more than once in the native form
    javaIsRepeatableBound(node): boolean {
        const n = this.unwrapParenthesized(node);
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

    // a slice bound as the integer the helper's toInt answers: an integral print is its own text, a
    // boxed number (an `Object` from indexOf, a Double) takes the helper's own intValue truncation
    javaSliceBoundOperand(node, printed): { text: string } | undefined {
        if (this.javaPrintsIntegralNumber(node)) {
            return { text: this.javaIsAtomOperand(node) ? printed : `(${printed})` };
        }
        const n = this.unwrapParenthesized(node);
        if (n === undefined || n.kind !== SyntaxKind.Identifier || this.javaScalarFamily(n) !== 'number') {
            return undefined;
        }
        const type = this.javaDeclaredTypeOf(n);
        if (type === undefined || !['Object', 'Double', 'Float', 'Number'].includes(type.replace(/^final\s+/, '').trim())) {
            return undefined;
        }
        return { text: `((Number)${printed}).intValue()` };
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
        // the null guard reads the receiver twice; it prints String: a plain TS `string`, a literal, a String-declared local
        if (receiver === undefined || !this.sideEffectFreeReceiver(receiver) || (this.javaScalarFamily(receiver) !== 'string'
            && !this.javaProvableString(receiver) && this.javaDeclaredStringType(receiver) !== true)) {
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
            if (value !== undefined) {
                return this.javaSliceBoundExpression(value, length);
            }
            const t = bounds[0].text;
            if (this.javaSliceNonNegativeBound(args[0])) {
                return `Math.min(${t}, ${length})`;
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
            if (this.javaSliceIsOwnLength(args[1], receiver)) {
                return length;
            }
            const t = bounds[1].text;
            if (this.javaSliceNonNegativeBound(args[1])) {
                return `Math.min(${t}, ${length})`;
            }
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

    // a slice bound that can never be negative: the helper's count-from-the-end branch is dead, so
    // the native form only clamps it to the length (`x.length`, `++` counters from a literal >= 0,
    // non-negative literals, `+`/`*` of those, and const locals initialised to one of them)
    javaSliceNonNegativeBound(node, depth = 0): boolean {
        const n = this.unwrapParenthesized(node);
        if (n === undefined || depth > 4) {
            return false;
        }
        switch (n.kind) {
        case SyntaxKind.NumericLiteral:
            return !/[.eE]/.test(n.text) && Number(n.text) <= 2147483647;
        case SyntaxKind.PropertyAccessExpression:
            return n.name?.text === 'length' && this.javaLengthIntRead(n);
        case SyntaxKind.BinaryExpression: {
            const op = n.operatorToken.kind;
            return (op === SyntaxKind.PlusToken || op === SyntaxKind.AsteriskToken)
                && this.javaSliceNonNegativeBound(n.left, depth + 1) && this.javaSliceNonNegativeBound(n.right, depth + 1);
        }
        case SyntaxKind.Identifier: {
            const declaration: any = this.javaDeclarationOfIdentifier(n);
            if (declaration === undefined || declaration.kind !== SyntaxKind.VariableDeclaration) {
                return false;
            }
            const forStatement = this.javaForCounterStatement(declaration);
            if (forStatement !== undefined) {
                const symbol = this.getChecker().getSymbolAtLocation(n);
                const start = this.javaSliceLiteralBound(declaration.initializer);
                const step = forStatement.incrementor;
                return start !== undefined && start >= 0 && step?.kind === SyntaxKind.PostfixUnaryExpression
                    && step.operator === SyntaxKind.PlusPlusToken && isIdentifier(step.operand) && step.operand.text === n.text
                    && this.javaCounterHasNoBoxWrite(n, symbol);
            }
            const list = declaration.parent;
            return list !== undefined && (getCombinedNodeFlags(declaration) & NodeFlags.Const) !== 0
                && declaration.initializer !== undefined && this.javaSliceNonNegativeBound(declaration.initializer, depth + 1);
        }
        default:
            return false;
        }
    }

    // `s.slice (a, s.length)`: the end bound is the receiver's own length, which is its clamped value
    javaSliceIsOwnLength(node, receiver): boolean {
        const n = this.unwrapParenthesized(node);
        const r = this.unwrapParenthesized(receiver);
        return n !== undefined && r !== undefined && n.kind === SyntaxKind.PropertyAccessExpression && n.name?.text === 'length'
            && isIdentifier(r) && isIdentifier(n.expression) && n.expression.text === r.text && this.javaLengthIntRead(n);
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
        return `Helpers.padEnd((String)${name}, ((Number)${parsedArg}).intValue(), ((String)${parsedArg2}).charAt(0))`;
    }

    printPadStartCall(node, _identation, name, parsedArg, parsedArg2) {
        return this.printNativePadStart(node, name) ?? `Helpers.padStart((String)${name}, ((Number)${parsedArg}).intValue(), ((String)${parsedArg2}).charAt(0))`;
    }

    // `x.indexOf(t)` where a string/Str-declared x is narrowed to a union of string literals
    // (`===` tests): x is a non-null String, so String.indexOf is the helper's String arm
    javaNarrowedIndexOf(node, name, parsedArg) {
        const receiver = node?.expression?.expression;
        const arg = node?.arguments?.[0];
        if (receiver === undefined || arg === undefined || name === undefined || parsedArg === undefined
            || !isIdentifier(receiver) || this.isVarargsArrayReference(receiver)) {
            return undefined;
        }
        const receiverType: any = this.javaTry(() => this.getChecker().getTypeAtLocation(receiver));
        if (receiverType === undefined || (receiverType.flags & TypeFlags.Union) === 0
            || !receiverType.getTypes().every((member) => this.isStringType(member.flags))) {
            return undefined;
        }
        // a DECLARED literal union is no runtime proof: the declaration must carry plain `string`
        const symbol = this.getChecker().getSymbolAtLocation(receiver);
        const declaration: any = symbol?.valueDeclaration?.resolve?.() ?? symbol?.valueDeclaration;
        const declared: any = this.javaTry(() => declaration?.name === undefined ? undefined : this.getChecker().getTypeAtLocation(declaration.name));
        const declaredMembers: any[] = declared === undefined ? [] : ((declared.flags & TypeFlags.Union) !== 0 ? declared.getTypes() : [declared]);
        if (!declaredMembers.some((member) => member.flags === TypeFlags.String)) {
            return undefined;
        }
        if (this.javaProvableString(arg)) {
            return `((String)${name}).indexOf(${parsedArg})`;
        }
        return undefined;
    }

    // ===== built-in calls and statements =====
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

    printAwaitExpression(node, identation) {
        const expression = this.printNode(node.expression, identation);
        return `(${expression}).join()`;
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
        // a proven handler table is a fresh non-null HashMap<String, String>: the same key copy
        const wsMap = this.javaWsClientMapReceiver(argument) || this.javaHandlerTableIdentifier(argument);
        if (!wsMap && isPropertyAccessExpression(argument)) {
            return this.printNativeBaseMapFieldKeys(argument);
        }
        // a final ws Client map or a pass-declared Map local: the key copy binds on its own type,
        // exactly the helper's synchronized map branch
        if (wsMap || this.javaDeclaredMapReceiver(argument)) {
            return this.javaArrayListCopy(this.printNode(argument, 0), 'keySet');
        }
        const type = this.checkerOrUndefined()?.getTypeAtLocation(argument);
        if (type === undefined || !this.isJavaMapStructureType(type)) {
            return undefined;
        }
        return this.javaArrayListCopy(`((java.util.Map<String, Object>)${this.printNode(argument, 0)})`, 'keySet');
    }

    javaArrayListCopy(text, accessor) {
        return `new java.util.ArrayList<Object>(${text}.${accessor}())`;
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
        const file = this.javaTry(() => this.checkerOrUndefined()?.getSymbolAtLocation(access.name)?.valueDeclaration?.resolve()?.getSourceFile?.()?.fileName ?? '');
        if (file === undefined || !/(^|[\\/])ts[\\/]src[\\/]base[\\/]Exchange(\.nooverloads\.\d+)?\.ts$/.test(file)) {
            return undefined;
        }
        const receiver = this.printNode(access, 0);
        return `(${receiver} == null ? new java.util.ArrayList<Object>() : ${this.javaArrayListCopy(receiver, 'keySet')})`;
    }

    // `Object.values(m)` over a ws Client map, or a local the printer declares `Map<String, Object>` and
    // nothing else writes: the helper's only surviving branch is the `Map.values()` copy
    printObjectValuesCall(node, _identation, parsedArg = undefined) {
        const argument = node?.arguments?.[0];
        if (argument !== undefined && this.javaWsClientMapReceiver(argument)) {
            return this.javaArrayListCopy(this.printNode(argument, 0), 'values');
        }
        const single = argument !== undefined && node.arguments.length === 1 && isIdentifier(argument);
        const declaration: any = single ? this.javaDeclarationOfIdentifier(argument) : undefined;
        if (declaration === undefined || !isVariableDeclaration(declaration) || !declaration.initializer
            || !this.javaDeclaredMapReceiver(argument) || this.javaLocalHasWriteAtAll(declaration.name)) {
            return `Helpers.objectValues(${parsedArg})`;
        }
        return this.javaArrayListCopy(this.printNode(argument, 0), 'values');
    }

    printJsonParseCall(_node, _identation, parsedArg = undefined) {
        return `Helpers.parseJson(${parsedArg})`;
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

    printPromiseAllCall(node, identation, parsedArg = undefined) {
        const h30j06 = this.h30J06ListJoin(node); if (h30j06 !== undefined) return h30j06;
        const h29j06 = this.h29J06LiteralJoin(node); if (h29j06 !== undefined) return h29j06;
        const h28j06 = this.h28J06SeededListJoin(node); if (h28j06 !== undefined) return h28j06;
        const h27j06 = this.h27J06FutureListJoin(node); if (h27j06 !== undefined) return h27j06;
        return this.printNativePromiseAllCall(node) ?? this.printJavaPromiseAllStream(node, parsedArg) ?? `Helpers.promiseAll(${parsedArg})`;
    }

    // Helpers.promiseAll's own steps inline (List cast, CompletableFuture filter, allOf, in-order join
    // into an ArrayList) in the ts/src exchange and base tiers; the test tier keeps the helper call
    printJavaPromiseAllStream(node, parsedArg) {
        const fileName = String(node?.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
        if (parsedArg === undefined || !/(^|\/)ts\/src\//.test(fileName) || JAVA_TEST_TIER_FILES.test(fileName)) {
            return undefined;
        }
        const future = 'java.util.concurrent.CompletableFuture';
        return `((java.util.List<?>)(${parsedArg})).stream().filter(${future}.class::isInstance)`
            + `.map((promiseAllItem) -> (${future}<?>) promiseAllItem)`
            + '.collect(java.util.stream.Collectors.collectingAndThen(java.util.stream.Collectors.toList(), (promiseAllFutures) -> '
            + `${future}.allOf(promiseAllFutures.toArray(new ${future}<?>[0]))`
            + `.<java.util.List<Object>>thenApply((promiseAllDone) -> promiseAllFutures.stream().<Object>map(${future}::join)`
            + '.collect(java.util.stream.Collectors.toCollection(java.util.ArrayList<Object>::new)))))';
    }

    javaMathParseCall(fn, node, parsedArg) {
        return `Math.${fn}(Double.parseDouble(${this.javaStringBoxText(node?.arguments?.[0], parsedArg)}))`;
    }

    printMathFloorCall(node, _identation, parsedArg = undefined) {
        return `(${this.javaMathParseCall('floor', node, parsedArg)})`;
    }

    printMathRoundCall(node, _identation, parsedArg = undefined) {
        return this.javaMathParseCall('round', node, parsedArg);
    }

    printMathCeilCall(node, _identation, parsedArg = undefined) {
        return this.javaMathParseCall('ceil', node, parsedArg);
    }

    printNumberIsIntegerCall(_node, _identation, parsedArg = undefined) {
        return `((${parsedArg} instanceof Integer) || (${parsedArg} instanceof Long))`;
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

    printDateNowCall(_node, _identation) {
        return "System.currentTimeMillis()";
    }

    printThrowStatement(node, identation) {
        if (node.expression.kind === SyntaxKind.Identifier) {
            // a bare rethrow of a caught checked exception cannot leave the async lambdas: keep
            // unchecked ones (ccxt errors extend RuntimeException), wrap the rest with it as cause
            const name = this.printNode(node.expression, 0);
            return (
                this.getIden(identation) +
                `${this.THROW_TOKEN} (${name} instanceof RuntimeException ? (RuntimeException)${name} : new RuntimeException(${name}))${this.LINE_TERMINATOR}`
            );
        }
        if (node.expression.kind === SyntaxKind.NewExpression) {
            const expression = node.expression;
            const argumentsExp = expression?.arguments ?? [];
            const parsedArg = argumentsExp.map((n) => this.printNode(n, 0)).join(",");
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
                    }
                    return this.getIden(identation) + `Helpers.throwDynamicException(${exceptionName}, ${parsedArg});return null;`;
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

    // ===== boolean conditions (Helpers.isTrue) =====
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
        return this.javaEveryReturn(method.body, (statement) => statement.expression !== undefined
            && this.javaPrintsNonNullBoolean(statement.expression, depth));
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
        const name = this.javaThisCallName(node);
        const declaration: any = name === undefined ? undefined : this.javaTry(() => this.javaCalleeDeclaration(node, this.getChecker()));
        if (declaration === undefined || declaration.kind !== SyntaxKind.MethodDeclaration) {
            return false;
        }
        if (JAVA_THIS_BOOLEAN_METHODS.has(String(name))) {
            return this.javaCallBooleanKind(node) === 'boolean';
        }
        return this.javaMethodReturnsNonNullBoolean(declaration, depth);
    }

    // `a && b` / `a || b` as a condition: both sides print through printCondition, so the Java
    // operator already yields a primitive boolean. The test tree keeps the helper spelling.
    printLogicalCondition(node): string | undefined {
        const logical = (n) => n !== undefined && isBinaryExpression(n)
            && (n.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken || n.operatorToken.kind === SyntaxKind.BarBarToken);
        if (!logical(this.unwrapParenthesized(node))
            || /(^|[\\/])ts[\\/]src[\\/]test[\\/]/.test(node.getSourceFile?.()?.fileName ?? '')) {
            return undefined;
        }
        let outer = node.parent;
        while (outer !== undefined && isParenthesizedExpression(outer)) {
            outer = outer.parent;
        }
        // an operand of an enclosing `&&` / `||` keeps its own spelling; the outermost test unwraps
        if (this.javaConditionPrintsBoolean(node) || logical(outer)) {
            return undefined;
        }
        return `(${this.printNode(node, 0)})`;
    }

    // a class declared in ts/src/base/errors.ts: its Java twin extends RuntimeException, so
    // `catchVar instanceof X` compiles against the `Exception` catch parameter
    javaCcxtErrorClass(node): boolean {
        const checker: any = this.checkerOrUndefined();
        const symbol: any = this.javaTry(() => {
            const found = checker?.getSymbolAtLocation(node);
            return found !== undefined && (found.flags & SymbolFlags.Alias) ? checker.getAliasedSymbol(found) : found;
        }, null);
        if (symbol === null) {
            return false;
        }
        const declaration: any = symbol?.declarations?.[0]?.resolve();
        return declaration?.kind === SyntaxKind.ClassDeclaration
            && /(^|[\\/])ts[\\/]src[\\/]base[\\/]errors\.ts$/.test(declaration.getSourceFile?.()?.fileName ?? '');
    }

    // `e instanceof X` on a catch variable equals Helpers.isInstance (which first unwraps a
    // CompletionException/ExecutionException) when the try block cannot raise a wrapped one:
    // no await, every call a synchronous base-tier accessor/thrower
    javaCatchCannotWrap(node): boolean {
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
        return !this.javaTreeSome(tryStatement.tryBlock, (current) => {
            if (isFunctionLike(current) || current.kind === SyntaxKind.AwaitExpression || current.kind === SyntaxKind.TryStatement) {
                return true;
            }
            if (current.kind !== SyntaxKind.CallExpression) {
                return undefined;
            }
            const signature: any = checker.getResolvedSignature(current);
            const declaration: any = signature?.declaration?.resolve();
            return (declaration === undefined || !isPropertyAccessExpression(current.expression)
                || !JAVA_SYNC_CALL_FILE.test(declaration.getSourceFile?.()?.fileName ?? '')
                || this.hasAsyncModifier(declaration)
                || this.isPromiseType(checker.getReturnTypeOfSignature(signature))) || undefined;
        });
    }

    printInstanceOfExpression(node, identation) {
        if (node.right?.kind === SyntaxKind.Identifier && this.javaCcxtErrorClass(node.right)
            && this.javaCatchCannotWrap(node.left)) {
            return this.getIden(identation) + `(${this.printNode(node.left, 0)} instanceof ${node.right.text})`;
        }
        const right = node.right.text;
        const left = this.printNode(node.left, 0);
        return this.getIden(identation) + `Helpers.isInstance(${left}, ${right}.class)`;
    }

    // `Array.isArray(x)` prints `(x instanceof java.util.List)`: false for null, true for a List, same
    // as the helper for every Java-object operand. The helper stays where the operand prints as a Java
    // array (rest parameter: `getClass().isArray()` branch) or a final class not convertible to List.
    printArrayIsArrayCall(node, _identation, parsedArg = undefined) {
        return this.printNativeArrayIsArray(node, parsedArg) ?? `Helpers.isArray(${parsedArg})`;
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
            return undefined;
        }
        // a primary print only: `instanceof` binds tighter than low-precedence operators, and a
        // constructor or cast print can be a final class on which `instanceof List` does not compile
        if (operand.kind !== SyntaxKind.Identifier && operand.kind !== SyntaxKind.PropertyAccessExpression
            && operand.kind !== SyntaxKind.ElementAccessExpression && operand.kind !== SyntaxKind.CallExpression) {
            return undefined;
        }
        const type = this.checkerOrUndefined()?.getTypeAtLocation(operand);
        // a plain identifier of a type that can never hold a List: the helper answers false
        // for null/undefined and for every scalar, and the reference stays untouched
        const decl: any = operand.kind === SyntaxKind.Identifier ? this.javaDeclarationOfIdentifier(operand) : undefined;
        const untypedDefault = decl !== undefined && decl.kind === SyntaxKind.Parameter && decl.type === undefined && decl.initializer !== undefined;
        if (operand.kind === SyntaxKind.Identifier && this.javaTypeFlagsOnly(type, JAVA_SCALAR_TYPE_FLAGS | JAVA_NULLISH_TYPE_FLAGS) && !untypedDefault) {
            return 'false';
        }
        if (this.isVarargsArrayReference(operand)) {
            return undefined;
        }
        if (this.javaTypeFlagsOnly(type, JAVA_SCALAR_TYPE_FLAGS)) {
            return undefined;
        }
        return `(${parsedArg} instanceof java.util.List)`;
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
        const declaration: any = this.javaCalleeDeclaration(node, this.getChecker());
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
        const inner = this.unwrapParenthesized(node);
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
        if (type === undefined || type.getAliasSymbol?.() !== undefined) {
            return false;
        }
        const flags = type.flags ?? 0;
        return (flags & JAVA_BOOLEAN_EXCLUDED_TYPE_FLAGS) === 0 && (flags & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) !== 0;
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
        const declaration: any = this.javaCalleeDeclaration(node);
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
        return this.javaEveryReturn(declaration.body, (statement) => statement.expression !== undefined
            && this.javaPrintsBooleanValue(statement.expression, next, depth + 1));
    }

    // `Array.isArray(x)` prints `Helpers.isArray(x)` (`public static boolean`), the relational
    // Precise statics print `public static boolean` and the hand-written `public boolean` base
    // methods print a primitive boolean. Everything else - including the generated
    javaPrintsBooleanCall(node, seen: Set<any> = new Set(), depth = 0): boolean {
        if (this.isArrayIsArrayCall(node) || this.javaPreciseBooleanCall(node) || this.javaStringAffixCall(node)) {
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
    // the write scan: every write in the enclosing function must print a Java boolean value.
    javaBooleanBoxIdentifier(node, seen: Set<any>): string | undefined {
        const resolved = seen.has(node) ? undefined : this.javaIdentifierValueDeclaration(node);
        if (resolved === undefined) {
            return undefined;
        }
        const { symbol, decl } = resolved;
        // only a local with its own initializer: a parameter (and the `optionalArgs[n]` prologue for an
        // optional one) is an `Object` box its CALLERS fill, so it is not proven boolean; a binding
        // element (`for (const b of ...)`, destructuring) is fed by the container, not a typed value.
        if (decl.kind !== SyntaxKind.VariableDeclaration) {
            return undefined;
        }
        const type = this.javaTry(() => this.javaTypeOfDeclaration(decl));
        if (!this.javaBooleanBoxType(type)) {
            return undefined;
        }
        const next = new Set(seen);
        next.add(node);
        if (!this.javaWritesAreBoxed(symbol, decl, next, (value) => this.javaPrintsBooleanValue(value, next), false)) {
            return undefined;
        }
        return this.printNode(node, 0);
    }

    // the checker symbol of an identifier and its resolved value declaration, or undefined
    javaIdentifierValueDeclaration(node): { symbol: any, decl: any } | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined || node?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const decl = symbol?.valueDeclaration?.resolve();
        return decl === undefined ? undefined : { symbol, decl };
    }

    // a plain `const [ .., x, .. ] = init` element: its variable declaration and position
    javaTupleBinding(element): { declaration: any, index: number } | undefined {
        const pattern = element.parent;
        const declaration = pattern?.parent;
        if (element.kind !== SyntaxKind.BindingElement || element.initializer !== undefined || element.dotDotDotToken !== undefined
            || pattern?.kind !== SyntaxKind.ArrayBindingPattern || declaration?.kind !== SyntaxKind.VariableDeclaration) {
            return undefined;
        }
        return { declaration, index: pattern.elements.indexOf(element) };
    }

    // shared write scan over the function the declaration lives in: the initializer and every
    // identifier write must pass `accepts`; `tuples` also checks `[ x, params ] = ...` destructures
    javaWritesAreBoxed(symbol, decl, next: Set<any>, accepts: (value: any) => boolean, tuples: boolean): boolean {
        const fn = this.enclosingFunctionLike(decl);
        if (fn === undefined) {
            return false;
        }
        if (decl.initializer !== undefined && !accepts(decl.initializer)) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        return !this.javaWriteSiteSome(fn, { write: (left, current) => {
            if (!isBinaryExpression(current)) {
                return this.javaLoopRebinds(current, symbol); // `for (x of list)` re-fills the box from the container
            }
            if (isIdentifier(left)) {
                return checker.getSymbolAtLocation(left) === symbol && !accepts(current.right);
            }
            // `[ x, params ] = this.handle*Bool (...)` binds element `index`
            const index = tuples && isArrayLiteralExpression(left) ? left.elements.findIndex((element: any) => isIdentifier(element)
                && checker.getSymbolAtLocation(element) === symbol) : -1;
            return index !== -1 && !this.javaBooleanBoxTupleElement(current.right, index);
        } });
    }

    // the declared Java type the ccxt-side declaration chain gave this local/param, via the
    // javaDeclaredLocalTypeResolver hook (build/java-local-types.js): `boolean` prints as the
    // primitive, so the identifier IS the condition; `Boolean` is the nullable box (isTrue = equals).
    javaDeclaredBooleanKind(node): 'boolean' | 'Boolean' | undefined {
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined || node.text !== declaration.name?.text) {
            return undefined; // a capture rename prints `final Object finalX = x`
        }
        const declared = this.javaTry(() => this.javaDeclaredTypeOfDeclaration(declaration));
        return declared === 'boolean' || declared === 'Boolean' ? declared : undefined;
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
        // a local whose declared type is the nullable boolean and every write boxes, or a box tuple binding
        if (node.kind === SyntaxKind.Identifier && (this.javaNullableBooleanBoxIdentifier(node, seen) !== undefined
            || this.javaBooleanTupleBindingIdentifier(node, seen) !== undefined)) {
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
        const name = this.javaThisCallName(node);
        if (name === undefined || !JAVA_BOOLEAN_BOX_TUPLE_METHODS.has(String(name))) {
            return false;
        }
        const declaration: any = this.javaCalleeDeclaration(node, this.getChecker());
        if (declaration?.name?.text !== name) {
            return false; // a same-named override is not the base accessor
        }
        return index === 0;
    }

    // `const [ x, p ] = this.handle*Bool (...)` binds x to element 0, a Boolean-or-null box; any
    // later identifier or tuple write must also be a proven box (the write scan over the function)
    javaBooleanTupleBindingIdentifier(node, seen: Set<any> = new Set()): string | undefined {
        const resolved = this.javaIdentifierValueDeclaration(node);
        const element = resolved?.decl;
        const tuple = element === undefined || element.name?.text !== node.text || seen.has(element)
            ? undefined : this.javaTupleBinding(element);
        if (tuple === undefined || !this.javaBooleanBoxTupleElement(tuple.declaration.initializer, tuple.index)) {
            return undefined;
        }
        const next = new Set(seen);
        next.add(element);
        const binding = { initializer: undefined, parent: tuple.declaration };
        if (!this.javaWritesAreBoxed(resolved.symbol, binding, next, (value) => this.javaPrintsBooleanBoxValue(value, next), true)) {
            return undefined;
        }
        return this.printNode(node, 0);
    }

    // `Helpers.isTrue(x)` where the DECLARED type of x is a nullable boolean and every write is a
    // proven Boolean-or-null box: `Boolean.TRUE.equals(x)` is exactly what the helper answers on
    // such a box (null and FALSE test false, TRUE tests true)
    javaNullableBooleanBoxIdentifier(node, seen: Set<any> = new Set()): string | undefined {
        const resolved = this.javaIdentifierValueDeclaration(node);
        const declaration = resolved?.decl;
        if (declaration === undefined || declaration.name?.text !== node.text) {
            return undefined;
        }
        if (seen.has(declaration)) {
            return undefined; // a write graph that reaches this declaration again keeps the helper
        }
        if (!this.javaNullableBooleanDeclaration(declaration)) {
            return undefined;
        }
        const next = new Set(seen);
        next.add(node);
        next.add(declaration); // a write scan that reaches this declaration again stops
        if (!this.javaWritesAreBoxed(resolved.symbol, declaration, next, (value) => this.javaPrintsBooleanBoxValue(value, next), true)) {
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
        const printed = this.printConditionUnboxed(node, identation);
        const inner = this.unwrapParenthesized(node);
        if (inner?.kind === SyntaxKind.Identifier && printed.trimStart().startsWith(this.FALSY_WRAPPER_OPEN)
            && this.javaBoxIdentifier(inner, new Set<any>(), 0)) {
            return this.getIden(identation) + `Boolean.TRUE.equals(${this.printNode(inner, 0)})`;
        }
        return printed;
    }

    // a local whose declared TS type is boolean-family and whose every write (write scan, tuples
    // included) is a Boolean-or-null box; a write cycle back to a local under proof is accepted
    javaBoxIdentifier(node, seen: Set<any>, depth: number): boolean {
        const resolved = depth > 6 ? undefined : this.javaIdentifierValueDeclaration(node);
        const decl: any = resolved?.decl;
        if (decl === undefined || decl.name?.text !== node.text) {
            return false;
        }
        const symbol = resolved.symbol;
        if (seen.has(decl)) {
            return true;
        }
        const next = new Set(seen);
        next.add(decl);
        const accepts = (value) => this.javaBoxValue(value, next, depth + 1);
        if (decl.kind === SyntaxKind.BindingElement) {
            const tuple = this.javaTupleBinding(decl);
            if (tuple === undefined || (!this.javaBooleanBoxTupleElement(tuple.declaration.initializer, tuple.index)
                && !this.javaLiteralTupleElement(tuple.declaration.initializer, tuple.index))) {
                return false;
            }
            return this.javaWritesAreBoxed(symbol, { initializer: undefined, parent: tuple.declaration }, next, accepts, true);
        }
        if (decl.kind !== SyntaxKind.VariableDeclaration) {
            return false; // parameters are boxes their callers fill
        }
        const type = this.javaTry(() => this.javaTypeOfDeclaration(decl));
        if (type === undefined || (!this.javaBooleanBoxType(type) && !this.javaNullableBooleanDeclaration(decl))) {
            return false;
        }
        return this.javaWritesAreBoxed(symbol, decl, next, accepts, true);
    }

    // a value whose printed Java is a Boolean, boolean or null
    javaBoxValue(node, seen: Set<any>, depth: number): boolean {
        if (node === undefined) {
            return false;
        }
        if (node.kind === SyntaxKind.ParenthesizedExpression || node.kind === SyntaxKind.AsExpression
            || node.kind === SyntaxKind.NonNullExpression) {
            return this.javaBoxValue(node.expression, seen, depth);
        }
        if (node.kind === SyntaxKind.NullKeyword || (node.kind === SyntaxKind.Identifier && node.text === 'undefined')) {
            return true;
        }
        if (node.kind === SyntaxKind.ConditionalExpression) {
            return this.javaBoxValue(node.whenTrue, seen, depth) && this.javaBoxValue(node.whenFalse, seen, depth);
        }
        if (node.kind === SyntaxKind.Identifier) {
            return this.javaBoxIdentifier(node, seen, depth);
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
        const name = this.javaThisCallName(node);
        const at = name === undefined ? undefined : JAVA_THIS_BOOLEAN_BOX_METHODS[String(name)];
        if (at === undefined || this.javaBooleanValueKind(node) === undefined || !this.javaCalleeResolves(node)
            || this.javaBaseThisCallDeclaration(node) === undefined) {
            return false;
        }
        const fallback = node.arguments?.[at];
        return fallback !== undefined && this.javaBoxValue(fallback, seen, depth);
    }

    // element `index` of a base-tier `this.m(..)` whose every return is an array literal with a
    // Java boolean at that position (`handlePostOnly`: `[ true, p ]` / `[ false, p ]`)
    javaLiteralTupleElement(node, index: number): boolean {
        const declaration: any = index < 0 ? undefined : this.javaBaseThisCallDeclaration(node);
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body === undefined) {
            return false;
        }
        return this.javaEveryReturn(declaration.body, (statement) => statement.expression !== undefined
            && isArrayLiteralExpression(statement.expression)
            && this.javaPrintsBooleanValue(statement.expression.elements[index], new Set<any>()));
    }

    // the resolved declaration of a `this.<name>(...)` call when it is the base class's own `<name>`
    javaBaseThisCallDeclaration(node): any {
        const name = this.javaThisCallName(node);
        const declaration: any = name === undefined ? undefined : this.javaTry(() => this.javaCalleeDeclaration(node, this.getChecker()));
        if (declaration?.name?.text !== name || !JAVA_THIS_RETURN_TYPES_BASE_FILE.test(declaration?.getSourceFile?.()?.fileName ?? '')) {
            return undefined;
        }
        return declaration;
    }

    printConditionUnboxed(node, identation): string {
        const logical = this.printLogicalCondition(node);
        if (logical !== undefined) {
            return this.getIden(identation) + logical;
        }
        if (this.javaConditionPrintsBoolean(node)) {
            return this.getIden(identation) + this.printNode(node, 0);
        }
        const bareCall = this.unwrapParenthesized(node);
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

    // ===== ws handler tables and dispatch =====
    // a node key that survives `symbol.valueDeclaration.resolve()` (which may hand back a copy)
    javaHandlerKey(node) {
        return `${node.getSourceFile()?.fileName}:${node.getStart()}:${node.getEnd()}`;
    }

    // `this.<name>` naming a 2-arg (Client, message) handler, as the java method name, else undefined
    javaHandlerMethod(reference) {
        if (!isPropertyAccessExpression(reference) || reference.expression?.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const symbol = this.javaTry(() => this.checkerOrUndefined()?.getSymbolAtLocation(reference.name));
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
        const symbol = this.javaTry(() => checker.getSymbolAtLocation(name));
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
                const other = this.javaTry(() => checker.getSymbolAtLocation(current));
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

    // the table is read only as the first argument of `this.safeValue (methods, key)`, or as the
    // receiver of a `methods[key]` read with a string key (ral-87j2: both answer the entry or null)
    javaIsHandlerTableRead(call, read) {
        if (call !== undefined && isElementAccessExpression(call) && call.expression === read) {
            return !this.isLeftSideOfAssignment(call) && call.parent?.kind !== SyntaxKind.DeleteExpression
                && this.javaHandlerStringKey(call.argumentExpression);
        }
        return call !== undefined && isCallExpression(call) && call.arguments?.[0] === read
            && isPropertyAccessExpression(call.expression)
            && call.expression.name?.text === 'safeValue'
            && call.expression.expression?.kind === SyntaxKind.ThisKeyword;
    }

    // ral-87j2: a key whose checker type is string (undefined allowed): HashMap.get answers null for a
    // missing or null key, like the helper's map branch
    javaHandlerStringKey(key) {
        const checker = this.checkerOrUndefined();
        if (key === undefined || checker === undefined) {
            return false;
        }
        if (isStringLiteralLikeNode(key)) {
            return true;
        }
        let type;
        try {
            type = checker.getNonNullableType(checker.getTypeAtLocation(key));
        } catch (e) {
            return false;
        }
        return type !== undefined && (type.flags & TypeFlags.StringLike) !== 0;
    }

    // ral-87j2: a read that only asks for the table's keys (`Object.keys (methods)`, `k in methods`):
    // the keys are the literal's, whatever the value box is
    javaIsHandlerKeyRead(read) {
        const parent = read.parent;
        if (parent !== undefined && isCallExpression(parent) && parent.arguments?.length === 1 && parent.arguments[0] === read
            && isPropertyAccessExpression(parent.expression) && isIdentifier(parent.expression.expression)
            && parent.expression.expression.text === 'Object' && parent.expression.name?.text === 'keys') {
            return true;
        }
        return parent !== undefined && parent.kind === SyntaxKind.BinaryExpression && parent.right === read
            && parent.operatorToken.kind === SyntaxKind.InKeyword;
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
        const read = current?.kind === SyntaxKind.CallExpression ? current.arguments?.[0]
            : (current !== undefined && isElementAccessExpression(current) ? current.expression : undefined);
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
            // a statement: the dispatch prints as a switch, which is not an expression
            return access.parent.parent?.kind === SyntaxKind.ExpressionStatement
                && callArguments.length === 3 && callArguments[0].kind === SyntaxKind.ThisKeyword
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

    // one walk per source file, however often printing hops to another file's nodes in between:
    // record the tables whose every read is that idiom, keyed by the literal node and by the local
    // that holds the safeValue result
    javaScanHandlerTables(node) {
        const file = node.getSourceFile();
        if (file === undefined || this.javaHandlerScannedFiles.has(file)) {
            return;
        }
        this.javaHandlerScannedFiles.add(file);
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
                if (this.javaIsHandlerKeyRead(read)) {
                    continue;
                }
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
        const parts: string[] = [];
        for (const key of keys) {
            parts.push(`${entryIndent}put(${JSON.stringify(key)}, ${JSON.stringify(byKey.get(key))});`);
        }
        // a HashMap (not Map.ofEntries): the helper's null key answers null, an immutable map's throws
        return `new java.util.HashMap<String, ${JAVA_HANDLER_NAME_TYPE}>() {{\n${parts.join('\n')}\n${this.getIden(identation)}}}`;
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

    // ral-87j2: an identifier naming the local a proven handler table literal initialises
    javaHandlerTableIdentifier(node) {
        if (node === undefined || !isIdentifier(node)) {
            return false;
        }
        const declaration = this.javaDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || declaration.name.text !== node.text
            || declaration.initializer === undefined) {
            return false;
        }
        return this.javaHandlerDeclarationType(declaration) === JAVA_HANDLER_TABLE_TYPE;
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
            return JAVA_HANDLER_NAME_TYPE;
        }
        return undefined;
    }

    // the java type the interface takes for a `.call` argument, or undefined when the box cannot hold it
    javaHandlerArgumentType(node, position) {
        if (node === undefined || !isIdentifier(node)) {
            return undefined;
        }
        const declaration = this.javaTry(() => this.checkerOrUndefined()?.getSymbolAtLocation(node)?.valueDeclaration?.resolve());
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

    printJavaHandlerDispatch(node, identation) {
        if (!isCallExpression(node) || node.parent?.kind !== SyntaxKind.ExpressionStatement) {
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
        const symbol = this.javaTry(() => this.checkerOrUndefined()?.getSymbolAtLocation(receiver));
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
        // the local holds the method name of the table it was read from (javaHandlerCalls is keyed by
        // that local's own declaration), so each switch lists exactly the methods its table names
        const names: string[] = [];
        for (const entry of this.javaHandlerCalls.get(this.javaHandlerKey(declaration.name))) {
            if (!names.includes(entry.name)) {
                names.push(entry.name);
            }
        }
        const iden = this.getIden(identation);
        const caseIden = this.getIden(identation + 1);
        const bodyIden = this.getIden(identation + 2);
        const lines = [ `${iden}switch (${receiverText}) {` ];
        for (const name of names) {
            lines.push(`${caseIden}case ${JSON.stringify(name)}:`, `${bodyIden}this.${name}(${client}, ${message});`, `${bodyIden}break;`);
        }
        lines.push(`${caseIden}default:`, `${bodyIden}throw new RuntimeException("Method not found: " + ${receiverText});`, `${iden}}`);
        return lines.join('\n');
    }

    // `x.append|reset|store|storeArray|limit (...)` in a ws/prediction venue: native on a local declared the
    // ws class that has the method, a cast statement where one class alone declares it, else callDynamically
    printJavaWsReceiverCall(node, identation): string | undefined {
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee) || !JAVA_WS_RECEIVER_TIER_FILE.test(node.getSourceFile().fileName)) {
            return undefined;
        }
        const method = callee.name.text;
        const receiver = callee.expression;
        const argc = node.arguments.length;
        let receiverText: string;
        if (isPropertyAccessExpression(receiver) && receiver.expression.kind === SyntaxKind.ThisKeyword
            && JAVA_WS_DYNAMIC_FIELDS.has(receiver.name.text)) {
            if (!JAVA_WS_DYNAMIC_METHODS.has(method)) {
                return undefined;
            }
            receiverText = 'this.' + receiver.name.text;
        } else if (isIdentifier(receiver)) {
            receiverText = this.printNode(receiver, 0);
            if (!/^[a-z]\w+$/.test(receiverText)) {
                return undefined;
            }
            if (method === 'limit' ? argc !== 0 : (!JAVA_WS_DYNAMIC_METHODS.has(method) || JAVA_WS_PLAIN_RECEIVERS.has(receiverText))) {
                return undefined;
            }
        } else {
            return undefined;
        }
        const args = this.printArgsForCallExpression(node, identation);
        const statement = node.parent?.kind === SyntaxKind.ExpressionStatement;
        if (isIdentifier(receiver)) {
            const declaration: any = this.javaDeclarationOfIdentifier(receiver);
            const cls = declaration !== undefined && isVariableDeclaration(declaration) && isIdentifier(declaration.name) && declaration.name.text === receiverText
                ? this.javaDeclaredTypeOfDeclaration(declaration) : undefined;
            const spec = cls !== undefined ? JAVA_WS_TYPED_METHODS[cls]?.[method] : undefined;
            // WsOrderBook.reset takes one Object: the helper pads an omitted argument with null
            const single = cls === 'io.github.ccxt.ws.WsOrderBook' || !args.includes('\n');
            if (spec !== undefined && spec.argc.includes(argc) && (spec.value || statement) && single) {
                return `${receiverText}.${method}(${argc === 0 && method === 'reset' ? 'null' : args.trim()})`;
            }
        }
        const cast = JAVA_WS_CAST_METHODS[method];
        if (cast !== undefined && statement && cast.argc.includes(argc)) {
            return `((${cast.cls}) ${receiverText}).${method}(${args.trim()})`;
        }
        return `${this.DYNAMIC_CALL_OPEN}${receiverText}, "${method}", new Object[]{${args}})`;
    }

    // ===== owner-store counters =====
    // a `this.lockId (); <rmw of this.options[k]>; this.unlockId ()` span (and incrementingNonce) becomes one
    // BaseExchange.nextCounter / nextCounterAbove call; every member is proven by its resolved base declaration.
    // statement -> { counter: [name, key] } | { nonce: { current, result } } | { drop: true }
    javaCounterPlan(statements, _identation: number): Map<any, any> | undefined {
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
    }

    javaPrintBodyStatements(statements, identation: number): string[] {
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
    }

    // ===== h26-J08
    // `this.parseToInt (a * b)` (base) with a double operand: parseToInt reads its argument through
    // numberToString, so Helpers.multiply's Long re-box of an integral product prints the same digits
    // as the native double; a null box keeps the helper's null (parseToInt(null) throws either way)
    printParseToIntDoubleProduct(node, left, right, leftText: string, rightText: string, op): string | undefined {
        if (op !== SyntaxKind.AsteriskToken || !this.javaProductFeedsBaseParseToInt(node)) {
            return undefined;
        }
        const kindOf = (operand, text: string) => this.javaDeclaredBoxOperandKind(operand, text)
            ?? (isCallExpression(operand) && this.javaNativeParseKind(operand) === 'double' ? 'doubleprim' : undefined);
        const kinds = [kindOf(left, leftText), kindOf(right, rightText)];
        if (kinds.some((kind) => kind === undefined) || !kinds.some((kind) => kind === 'doublebox' || kind === 'doubleprim')) {
            return undefined;
        }
        const texts = [leftText.trim(), rightText.trim()];
        const asDouble = (i: number) => (kinds[i].startsWith('double') ? texts[i] : `((double) ${texts[i]})`);
        const expression = `(${asDouble(0)} * ${asDouble(1)})`;
        const boxes = kinds.map((kind, i) => (kind.endsWith('box') ? texts[i] : undefined))
            .filter((text, i, all) => text !== undefined && all.indexOf(text) === i);
        return boxes.length === 0 ? expression : `((${boxes.map((box) => `${box} == null`).join(' || ')}) ? null : ${expression})`;
    }

    javaProductFeedsBaseParseToInt(node): boolean {
        let child = node;
        let parent = node?.parent;
        while (parent !== undefined && isParenthesizedExpression(parent)) {
            child = parent;
            parent = parent.parent;
        }
        return parent?.kind === SyntaxKind.CallExpression && parent.arguments?.length === 1
            && parent.arguments[0] === child && this.javaBaseParseToIntCall(parent);
    }

    // ===== h27-J06
    h27J06Cache: WeakMap<any, boolean>;
    // `const ps = []` used only as `ps.push (<checker-typed Promise>)` statements and `await Promise.all (ps)`:
    // every element is a future (javac checks the typed add), so the join needs no filter or element cast
    h27J06FutureList(declaration): boolean {
        this.h27J06Cache ??= new WeakMap<any, boolean>();
        if (!this.h27J06Cache.has(declaration)) {
            let ok = false;
            try {
                ok = this.h27J06FutureListProof(declaration);
            } catch (e) {
                ok = false;
            }
            this.h27J06Cache.set(declaration, ok);
        }
        return this.h27J06Cache.get(declaration);
    }

    h27J06FutureListProof(declaration): boolean {
        const list = declaration?.parent;
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || !isArrayLiteralExpression(declaration.initializer) || declaration.initializer.elements.length !== 0
            || !isVariableDeclarationList(list) || list.declarations.length !== 1
            || (getCombinedNodeFlags(declaration) & NodeFlags.Const) !== NodeFlags.Const) {
            return false;
        }
        const fileName = String(declaration.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
        if (JAVA_TEST_TIER_FILES.test(fileName)) {
            return false;
        }
        const checker = this.getChecker();
        const symbol = checker.getSymbolAtLocation(declaration.name);
        const scope = this.javaFunctionOrFile(declaration);
        if (symbol === undefined || scope === undefined) {
            return false;
        }
        let pushes = 0;
        let joins = 0;
        const rejected = this.javaTreeSome(scope, (current) => {
            if (!isIdentifier(current) || current === declaration.name || checker.getSymbolAtLocation(current) !== symbol) {
                return undefined;
            }
            const parent = current.parent;
            const call = parent?.parent;
            if (isPropertyAccessExpression(parent) && parent.expression === current && parent.name.text === 'push'
                && isCallExpression(call) && call.expression === parent && call.arguments.length === 1
                && isExpressionStatement(call.parent) && !isSpreadElement(call.arguments[0])
                && this.isPromiseType(checker.getTypeAtLocation(call.arguments[0]))) {
                pushes++;
                return false;
            }
            if (isCallExpression(parent) && parent.arguments.length === 1 && parent.arguments[0] === current
                && isPropertyAccessExpression(parent.expression) && isIdentifier(parent.expression.expression)
                && parent.expression.expression.text === 'Promise' && parent.expression.name.text === 'all'
                && parent.parent?.kind === SyntaxKind.AwaitExpression) {
                joins++;
                return false;
            }
            return true;
        });
        return !rejected && pushes > 0 && joins > 0;
    }

    h27J06Declaration(identifier) {
        if (identifier === undefined || !isIdentifier(identifier)) {
            return undefined;
        }
        const declaration = this.getChecker().getSymbolAtLocation(identifier)?.valueDeclaration?.resolve();
        return declaration !== undefined && this.h27J06FutureList(declaration) ? declaration : undefined;
    }

    h27J06FutureListDeclaration(declaration, indent: string): string | undefined {
        if (declaration === undefined || !this.h27J06FutureList(declaration)) {
            return undefined;
        }
        const future = 'java.util.concurrent.CompletableFuture';
        return `${indent}java.util.List<${future}<?>> ${this.printNode(declaration.name, 0)} = new java.util.ArrayList<${future}<?>>()`;
    }

    h27J06FutureListPush(node, name, parsedArg): string | undefined {
        const receiver = node?.expression?.expression;
        if (parsedArg === undefined || this.h27J06Declaration(receiver) === undefined || name !== receiver.text) {
            return undefined;
        }
        return `${name}.add(${parsedArg})`;
    }

    // allOf waits for every future, then the values are read in list order (the helper's answer)
    h27J06FutureListJoin(node): string | undefined {
        const argument = node?.arguments?.[0];
        if (node?.parent?.kind !== SyntaxKind.AwaitExpression || this.h27J06Declaration(argument) === undefined) {
            return undefined;
        }
        const future = 'java.util.concurrent.CompletableFuture';
        const list = this.printNode(argument, 0);
        return `${future}.allOf(${list}.toArray(new ${future}<?>[0])).thenApply((promiseAllDone) -> `
            + `new java.util.ArrayList<Object>(${list}.stream().<Object>map(${future}::join).toList()))`;
    }
    // ===== end h27-J06
    // ===== h28-J06
    h28J06Cache: WeakMap<any, boolean>;
    // `const ps = [ call (), .. ]` whose seeds are direct calls the checker types Promise, used only as
    // `ps.push (<Promise-typed call>)` statements and `await Promise.all (ps)`: every element is a future
    h28J06SeededList(declaration): boolean {
        this.h28J06Cache ??= new WeakMap<any, boolean>();
        if (!this.h28J06Cache.has(declaration)) {
            let ok = false;
            try {
                ok = this.h28J06SeededListProof(declaration);
            } catch (e) {
                ok = false;
            }
            this.h28J06Cache.set(declaration, ok);
        }
        return this.h28J06Cache.get(declaration);
    }

    h28J06SeededListProof(declaration): boolean {
        const list = declaration?.parent;
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || !isArrayLiteralExpression(declaration.initializer) || declaration.initializer.elements.length === 0
            || !isVariableDeclarationList(list) || list.declarations.length !== 1
            || (getCombinedNodeFlags(declaration) & NodeFlags.Const) !== NodeFlags.Const) {
            return false;
        }
        const fileName = String(declaration.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
        if (JAVA_TEST_TIER_FILES.test(fileName)) {
            return false;
        }
        const checker = this.getChecker();
        const futureCall = (element) => isCallExpression(element) && this.isPromiseType(checker.getTypeAtLocation(element));
        if (!(declaration.initializer.elements as unknown as Expression[]).every(futureCall)) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(declaration.name);
        const scope = this.javaFunctionOrFile(declaration);
        if (symbol === undefined || scope === undefined) {
            return false;
        }
        let joins = 0;
        const rejected = this.javaTreeSome(scope, (current) => {
            if (!isIdentifier(current) || current === declaration.name || checker.getSymbolAtLocation(current) !== symbol) {
                return undefined;
            }
            const parent = current.parent;
            const call = parent?.parent;
            if (isPropertyAccessExpression(parent) && parent.expression === current && parent.name.text === 'push'
                && isCallExpression(call) && call.expression === parent && call.arguments.length === 1
                && isExpressionStatement(call.parent) && futureCall(call.arguments[0])) {
                return false;
            }
            if (isCallExpression(parent) && parent.arguments.length === 1 && parent.arguments[0] === current
                && isPropertyAccessExpression(parent.expression) && isIdentifier(parent.expression.expression)
                && parent.expression.expression.text === 'Promise' && parent.expression.name.text === 'all'
                && parent.parent?.kind === SyntaxKind.AwaitExpression) {
                joins++;
                return false;
            }
            return true;
        });
        return !rejected && joins > 0;
    }

    h28J06Declaration(identifier) {
        if (identifier === undefined || !isIdentifier(identifier)) {
            return undefined;
        }
        const declaration = this.getChecker().getSymbolAtLocation(identifier)?.valueDeclaration?.resolve();
        return declaration !== undefined && this.h28J06SeededList(declaration) ? declaration : undefined;
    }

    h28J06SeededListDeclaration(declaration, indent: string): string | undefined {
        if (declaration === undefined || !this.h28J06SeededList(declaration)) {
            return undefined;
        }
        const future = 'java.util.concurrent.CompletableFuture';
        const seeds = (declaration.initializer.elements as unknown as Expression[]).map((element) => this.printNode(element, 0).trim());
        return `${indent}java.util.List<${future}<?>> ${this.printNode(declaration.name, 0)} = `
            + `new java.util.ArrayList<${future}<?>>(java.util.Arrays.<${future}<?>>asList(${seeds.join(', ')}))`;
    }

    h28J06SeededListPush(node, name, parsedArg): string | undefined {
        const receiver = node?.expression?.expression;
        if (parsedArg === undefined || this.h28J06Declaration(receiver) === undefined || name !== receiver.text) {
            return undefined;
        }
        return `${name}.add(${parsedArg})`;
    }

    // allOf waits for every future, then the values are read in list order (the helper's answer)
    h28J06SeededListJoin(node): string | undefined {
        const argument = node?.arguments?.[0];
        if (node?.parent?.kind !== SyntaxKind.AwaitExpression || this.h28J06Declaration(argument) === undefined) {
            return undefined;
        }
        const future = 'java.util.concurrent.CompletableFuture';
        const list = this.printNode(argument, 0);
        return `${future}.allOf(${list}.toArray(new ${future}<?>[0])).thenApply((promiseAllDone) -> `
            + `new java.util.ArrayList<Object>(${list}.stream().<Object>map(${future}::join).toList()))`;
    }
    // ===== end h28-J06

    // ===== h29-J04
    // `const c: Dict = {}` whose only uses are `k in c`, `c[k] = { .. }` (a fresh non-null map),
    // `const e = c[k]` row locals, `Object.keys (c)` and plain call arguments: every value is a row
    // map, so c prints `Map<String, Map<String, Object>>` and its row reads need no cast
    h29J04RowContainer(declaration): boolean {
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || !declaration.initializer || !isVariableDeclarationList(declaration.parent)
            || (declaration.parent.flags & NodeFlags.Const) === 0) {
            return false;
        }
        const init = this.unwrapPrintTransparentExpression(declaration.initializer);
        if (!isObjectLiteralExpression(init) || init.properties.length !== 0) {
            return false;
        }
        return this.javaMemo(this.h29J04ContainerCache, declaration, () => this.javaTry(() => this.h29J04ContainerUsesOk(declaration), false));
    }

    h29J04ContainerCache: WeakMap<Node, boolean | typeof JAVA_MEMO_UNDEFINED> = new WeakMap();

    h29J04ContainerUsesOk(declaration): boolean {
        const checker: any = this.getChecker();
        const symbol = checker.getSymbolAtLocation(declaration.name);
        const scope = this.javaFunctionOrFile(declaration);
        if (symbol === undefined || !scope) {
            return false;
        }
        let uses = 0;
        const bad = this.javaTreeSome(scope, (current) => {
            if (!isIdentifier(current) || current === declaration.name || checker.getSymbolAtLocation(current) !== symbol) {
                return undefined;
            }
            uses++;
            return !this.h29J04ContainerUseOk(current);
        });
        return !bad && uses > 0;
    }

    h29J04ContainerUseOk(node): boolean {
        const parent: any = node.parent;
        const h30j04 = this.h30J04FieldStoreUse(node); if (h30j04 !== undefined) return h30j04;
        if (isBinaryExpression(parent) && parent.right === node && parent.operatorToken.kind === SyntaxKind.InKeyword) {
            return true;
        }
        if (isCallExpression(parent) && parent.arguments.includes(node)) {
            // Object.keys (c) or a `this.m (c, ..)` call taking it as an Object argument
            const callee = parent.expression;
            return isPropertyAccessExpression(callee)
                && ((isIdentifier(callee.expression) && callee.expression.text === 'Object' && callee.name.text === 'keys')
                    || (callee.expression.kind === SyntaxKind.ThisKeyword && callee.name.text === 'safeDict'));
        }
        if (!isElementAccessExpression(parent) || parent.expression !== node) {
            return false;
        }
        const grand: any = parent.parent;
        if (isBinaryExpression(grand) && grand.left === parent) {
            return grand.operatorToken.kind === SyntaxKind.EqualsToken
                && isObjectLiteralExpression(this.unwrapPrintTransparentExpression(grand.right));
        }
        // any other read hands out the stored row map (or null) as an Object value
        return grand?.kind !== SyntaxKind.DeleteExpression && !(isBinaryExpression(grand) && grand.left === parent)
            && !isPostfixUnaryExpression(grand) && !isPrefixUnaryExpression(grand);
    }

    // `const e = c[k]` right after `if (!(k in c)) { c[k] = { .. }; }`: e is the stored non-null
    // row map (k is the same name, nothing runs in between), and e is only read or written by key
    h29J04RowLocal(declaration): boolean {
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || !declaration.initializer || !isVariableDeclarationList(declaration.parent)
            || (declaration.parent.flags & NodeFlags.Const) === 0) {
            return false;
        }
        const read = declaration.initializer;
        if (!isElementAccessExpression(read) || !isIdentifier(read.expression) || !isIdentifier(read.argumentExpression)) {
            return false;
        }
        const statement = declaration.parent.parent;
        const block = statement?.parent;
        if (statement?.kind !== SyntaxKind.VariableStatement || !block || !isBlock(block)) {
            return false;
        }
        const index = (block.statements as readonly any[]).indexOf(statement);
        const guard: any = index > 0 ? block.statements[index - 1] : undefined;
        if (!this.h29J04SeedGuard(guard, read.expression.text, read.argumentExpression.text)) {
            return false;
        }
        const container = this.javaDeclarationOfIdentifier(read.expression);
        if (container === undefined || !isVariableDeclaration(container) || this.javaFunctionOrFile(container) !== this.javaFunctionOrFile(declaration)) {
            return false;
        }
        const init = container.initializer ? this.unwrapPrintTransparentExpression(container.initializer) : undefined;
        if (!init || !isObjectLiteralExpression(init) || init.properties.length !== 0
            || (container.parent.flags & NodeFlags.Const) === 0) {
            return false;
        }
        return this.javaLocalUsesKeepContainerType(declaration.name)
            && this.h29J04RowContainer(container);
    }

    // `if (!(k in c)) { c[k] = { .. }; }` with no else
    h29J04SeedGuard(guard, containerName: string, keyName: string): boolean {
        if (!guard || !isIfStatement(guard) || guard.elseStatement !== undefined) {
            return false;
        }
        let test: any = guard.expression;
        if (!isPrefixUnaryExpression(test) || test.operator !== SyntaxKind.ExclamationToken) {
            return false;
        }
        test = this.unwrapParenthesized(test.operand);
        if (!isBinaryExpression(test) || test.operatorToken.kind !== SyntaxKind.InKeyword
            || !isIdentifier(test.left) || test.left.text !== keyName || !isIdentifier(test.right) || test.right.text !== containerName) {
            return false;
        }
        const body: any = guard.thenStatement;
        const only: any = isBlock(body) ? (body.statements.length === 1 ? body.statements[0] : undefined) : body;
        const write: any = only && isExpressionStatement(only) ? only.expression : undefined;
        return !!write && isBinaryExpression(write) && write.operatorToken.kind === SyntaxKind.EqualsToken
            && isElementAccessExpression(write.left) && isIdentifier(write.left.expression) && write.left.expression.text === containerName
            && isIdentifier(write.left.argumentExpression) && write.left.argumentExpression.text === keyName
            && isObjectLiteralExpression(this.unwrapPrintTransparentExpression(write.right));
    }

    h29J04RowMapDeclaration(declaration, indent: string): string | undefined {
        const row = 'Map<String, Object>';
        if (this.h29J04RowLocal(declaration)) {
            return `${indent}${row} ${this.printNode(declaration.name, 0)} = ${this.printNode(declaration.initializer, 0).trim()}`;
        }
        if (!this.h29J04RowContainer(declaration)) {
            return undefined;
        }
        return `${indent}java.util.Map<String, ${row}> ${this.printNode(declaration.name, 0)} = new java.util.HashMap<String, ${row}>()`;
    }
    // ===== end h29-J04
    // ===== h29-J06
    h29J06Lists: WeakMap<any, string>;
    h29J06Busy: boolean;

    // `const x = await Promise.all ([c1, .., cn])` with every element a call the checker types Promise:
    // the calls go into a typed future list statement first (each runs once, in order), then the join
    h29J06LiteralCall(declaration) {
        const awaited = declaration?.initializer;
        const call = awaited?.kind === SyntaxKind.AwaitExpression ? awaited.expression : undefined;
        const literal = call?.arguments?.[0];
        if (call === undefined || !isCallExpression(call) || call.arguments.length !== 1 || !isPropertyAccessExpression(call.expression)
            || !isIdentifier(call.expression.expression) || call.expression.expression.text !== 'Promise' || call.expression.name.text !== 'all'
            || !isArrayLiteralExpression(literal) || literal.elements.length === 0) {
            return undefined;
        }
        const fileName = String(declaration.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
        if (!/(^|\/)ts\/src\//.test(fileName) || JAVA_TEST_TIER_FILES.test(fileName)) {
            return undefined;
        }
        const checker = this.getChecker();
        const ok = (literal.elements as unknown as Expression[]).every((e) => isCallExpression(e) && this.isPromiseType(checker.getTypeAtLocation(e)));
        return ok ? call : undefined;
    }

    h29J06LiteralJoinDeclaration(node, declaration, identation, indent: string): string | undefined {
        if (this.h29J06Busy || node.declarations.length !== 1) {
            return undefined;
        }
        let call;
        try {
            call = this.h29J06LiteralCall(declaration);
        } catch (e) {
            call = undefined;
        }
        if (call === undefined) {
            return undefined;
        }
        const base = isIdentifier(declaration.name) ? declaration.name.text
            : declaration.name.kind === SyntaxKind.ArrayBindingPattern ? declaration.name.elements.map((e: any) => e.name?.text ?? '').join('') : undefined;
        const name = `${base}Futures`;
        if (base === undefined || base === '' || new RegExp(`\\b${name}\\b`).test(declaration.getSourceFile().text)) {
            return undefined;
        }
        const future = 'java.util.concurrent.CompletableFuture';
        const calls = call.arguments[0].elements.map((e) => this.printNode(e, 0).trim());
        const statement = `${indent}java.util.List<${future}<?>> ${name} = `
            + `new java.util.ArrayList<${future}<?>>(java.util.Arrays.<${future}<?>>asList(${calls.join(', ')}));\n`;
        this.h29J06Lists ??= new WeakMap<any, string>();
        this.h29J06Lists.set(call, name);
        this.h29J06Busy = true;
        try {
            return statement + this.printVariableDeclarationList(node, identation);
        } finally {
            this.h29J06Busy = false;
        }
    }

    // allOf waits for every future, then the values are read in list order (the helper's answer)
    h29J06LiteralJoin(node): string | undefined {
        const list = this.h29J06Lists?.get(node);
        if (list === undefined) {
            return undefined;
        }
        const future = 'java.util.concurrent.CompletableFuture';
        return `${future}.allOf(${list}.toArray(new ${future}<?>[0])).thenApply((promiseAllDone) -> `
            + `new java.util.ArrayList<Object>(${list}.stream().<Object>map(${future}::join).toList()))`;
    }
    // ===== end h29-J06
    // ===== h30-J04
    // `this.f = c;` with f declared `Dict` / `Dictionary<any>`, as the last use of a row container c, in the
    // block that declares c: the field takes a fresh `Map<String, Object>` holding the same row maps,
    // and nothing observes the container afterwards, so the copy answers as the alias did
    h30J04FieldStore(statement): any {
        if (statement === undefined || !isExpressionStatement(statement)) {
            return undefined;
        }
        const assign: any = statement.expression;
        if (!isBinaryExpression(assign) || assign.operatorToken.kind !== SyntaxKind.EqualsToken
            || !isPropertyAccessExpression(assign.left) || assign.left.expression.kind !== SyntaxKind.ThisKeyword
            || !isIdentifier(assign.right)) {
            return undefined;
        }
        const checker: any = this.getChecker();
        const field = checker.getSymbolAtLocation(assign.left.name);
        const fieldDeclaration: any = field?.valueDeclaration?.resolve() ?? field?.declarations?.[0]?.resolve();
        if (!this.h30J04DictTypeNode(fieldDeclaration?.type)) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(assign.right);
        const declaration: any = symbol?.valueDeclaration?.resolve();
        if (declaration === undefined || !isVariableDeclaration(declaration)
            || declaration.parent?.parent?.parent !== statement.parent) {
            return undefined;
        }
        const scope = this.javaFunctionOrFile(declaration);
        const later = this.javaTreeSome(scope, (current) => (isIdentifier(current) && current.pos >= statement.end
            && checker.getSymbolAtLocation(current) === symbol) || undefined);
        return later ? undefined : { assign, declaration };
    }

    h30J04DictTypeNode(type): boolean {
        if (type?.kind === SyntaxKind.UnionType) {
            const kept = type.types.filter((t) => t.kind !== SyntaxKind.UndefinedKeyword
                && !(t.kind === SyntaxKind.LiteralType && t.literal?.kind === SyntaxKind.NullKeyword));
            return kept.length === 1 && this.h30J04DictTypeNode(kept[0]);
        }
        if (type === undefined || !isTypeReferenceNode(type) || !isIdentifier(type.typeName)) {
            return false;
        }
        const args = type.typeArguments ?? [];
        return (type.typeName.text === 'Dict' && args.length === 0)
            || (type.typeName.text === 'Dictionary' && args.length === 1 && args[0].kind === SyntaxKind.AnyKeyword);
    }

    h30J04FieldStoreUse(node): boolean | undefined {
        const store = this.h30J04FieldStore(node.parent?.parent);
        return store !== undefined && store.assign.right === node ? true : undefined;
    }

    h30J04FieldStoreStatement(node, identation): string | undefined {
        const store = this.h30J04FieldStore(node);
        if (store === undefined || !this.h29J04RowContainer(store.declaration)) {
            return undefined;
        }
        const left = this.printNode(store.assign.left, 0).trim();
        const right = this.printNode(store.assign.right, 0).trim();
        return this.printNodeCommentsIfAny(node, identation,
            `${this.getIden(identation)}${left} = new java.util.HashMap<String, Object>(${right})${this.LINE_TERMINATOR}`);
    }
    // ===== end h30-J04
    // ===== h30-J06
    h30J06Cache: WeakMap<any, boolean>;
    // `const ps = [ .. ]` of Promise-typed calls or const future locals, used only as push (Promise call),
    // `ps.length` reads and `await Promise.all (ps)`; fires only where a `.length` or a local seed blocks h27/h28
    h30J06List(declaration): boolean {
        this.h30J06Cache ??= new WeakMap<any, boolean>();
        if (!this.h30J06Cache.has(declaration)) {
            let ok = false;
            try {
                ok = this.h30J06ListProof(declaration);
            } catch (e) {
                ok = false;
            }
            this.h30J06Cache.set(declaration, ok);
        }
        return this.h30J06Cache.get(declaration);
    }

    h30J06FutureCall(element): boolean {
        return isCallExpression(element) && this.isPromiseType(this.getChecker().getTypeAtLocation(element));
    }

    // a const local initialised by a Promise-typed call whose only use is one seed of `list`
    h30J06SeedLocal(element, list): boolean {
        if (!isIdentifier(element)) {
            return false;
        }
        const checker = this.getChecker();
        const symbol = checker.getSymbolAtLocation(element);
        const declaration = symbol?.valueDeclaration?.resolve();
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || !this.h30J06FutureCall(declaration.initializer) || !isVariableDeclarationList(declaration.parent)
            || declaration.parent.declarations.length !== 1
            || (getCombinedNodeFlags(declaration) & NodeFlags.Const) !== NodeFlags.Const) {
            return false;
        }
        const scope = this.javaFunctionOrFile(declaration);
        if (scope === undefined || scope !== this.javaFunctionOrFile(list)) {
            return false;
        }
        let uses = 0;
        const rejected = this.javaTreeSome(scope, (current) => {
            if (!isIdentifier(current) || current === declaration.name || checker.getSymbolAtLocation(current) !== symbol) {
                return undefined;
            }
            uses++;
            return current !== element;
        });
        return !rejected && uses === 1;
    }

    h30J06ListProof(declaration): boolean {
        const list = declaration?.parent;
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || !isArrayLiteralExpression(declaration.initializer)
            || !isVariableDeclarationList(list) || list.declarations.length !== 1
            || (getCombinedNodeFlags(declaration) & NodeFlags.Const) !== NodeFlags.Const) {
            return false;
        }
        const fileName = String(declaration.getSourceFile?.()?.fileName ?? '').replace(/\\/g, '/');
        if (JAVA_TEST_TIER_FILES.test(fileName)) {
            return false;
        }
        const elements = declaration.initializer.elements as unknown as Expression[];
        let seeds = 0;
        for (const element of elements) {
            if (this.h30J06SeedLocal(element, declaration)) {
                seeds++;
            } else if (!this.h30J06FutureCall(element)) {
                return false;
            }
        }
        const checker = this.getChecker();
        const symbol = checker.getSymbolAtLocation(declaration.name);
        const scope = this.javaFunctionOrFile(declaration);
        if (symbol === undefined || scope === undefined) {
            return false;
        }
        let pushes = 0;
        let joins = 0;
        let lengths = 0;
        const rejected = this.javaTreeSome(scope, (current) => {
            if (!isIdentifier(current) || current === declaration.name || checker.getSymbolAtLocation(current) !== symbol) {
                return undefined;
            }
            const parent = current.parent;
            const call = parent?.parent;
            if (isPropertyAccessExpression(parent) && parent.expression === current && parent.name.text === 'push'
                && isCallExpression(call) && call.expression === parent && call.arguments.length === 1
                && isExpressionStatement(call.parent) && this.h30J06FutureCall(call.arguments[0])) {
                pushes++;
                return false;
            }
            if (isPropertyAccessExpression(parent) && parent.expression === current && parent.name.text === 'length'
                && isVariableDeclaration(call) && call.initializer === parent) {
                lengths++;
                return false;
            }
            if (isCallExpression(parent) && parent.arguments.length === 1 && parent.arguments[0] === current
                && isPropertyAccessExpression(parent.expression) && isIdentifier(parent.expression.expression)
                && parent.expression.expression.text === 'Promise' && parent.expression.name.text === 'all'
                && parent.parent?.kind === SyntaxKind.AwaitExpression) {
                joins++;
                return false;
            }
            return true;
        });
        return !rejected && joins > 0 && (elements.length > 0 || pushes > 0) && (lengths > 0 || seeds > 0);
    }

    h30J06ListDeclarationOf(identifier) {
        if (identifier === undefined || !isIdentifier(identifier)) {
            return undefined;
        }
        const declaration = this.getChecker().getSymbolAtLocation(identifier)?.valueDeclaration?.resolve();
        return declaration !== undefined && this.h30J06List(declaration) ? declaration : undefined;
    }

    h30J06Declaration(declaration, indent: string): string | undefined {
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)) {
            return undefined;
        }
        const future = 'java.util.concurrent.CompletableFuture';
        const name = this.printNode(declaration.name, 0);
        if (this.h30J06List(declaration)) {
            const seeds = ((declaration.initializer as any).elements as Expression[]).map((element) => this.printNode(element, 0).trim());
            const init = seeds.length === 0 ? '' : `java.util.Arrays.<${future}<?>>asList(${seeds.join(', ')})`;
            return `${indent}java.util.List<${future}<?>> ${name} = new java.util.ArrayList<${future}<?>>(${init})`;
        }
        const seedOf = declaration.initializer !== undefined && isCallExpression(declaration.initializer)
            ? this.h30J06SeedListOf(declaration) : undefined;
        if (seedOf !== undefined) {
            return `${indent}${future}<?> ${name} = ${this.printNode(declaration.initializer, 0).trim()}`;
        }
        return undefined;
    }

    // the h30 list whose literal holds the only use of this future local
    h30J06SeedListOf(declaration) {
        const checker = this.getChecker();
        const symbol = checker.getSymbolAtLocation(declaration.name);
        const scope = this.javaFunctionOrFile(declaration);
        if (symbol === undefined || scope === undefined) {
            return undefined;
        }
        let found;
        this.javaTreeSome(scope, (current) => {
            if (isIdentifier(current) && current !== declaration.name && checker.getSymbolAtLocation(current) === symbol) {
                found = current;
                return true;
            }
            return undefined;
        });
        const literal = found?.parent;
        if (literal === undefined || !isArrayLiteralExpression(literal) || !isVariableDeclaration(literal.parent)
            || literal.parent.initializer !== literal || !this.h30J06List(literal.parent)) {
            return undefined;
        }
        return this.h30J06SeedLocal(found, literal.parent) ? literal.parent : undefined;
    }

    h30J06ListPush(node, name, parsedArg): string | undefined {
        const receiver = node?.expression?.expression;
        if (parsedArg === undefined || this.h30J06ListDeclarationOf(receiver) === undefined || name !== receiver.text) {
            return undefined;
        }
        return `${name}.add(${parsedArg})`;
    }

    // allOf waits for every future, then the values are read in list order (the helper's answer)
    h30J06ListJoin(node): string | undefined {
        const argument = node?.arguments?.[0];
        if (node?.parent?.kind !== SyntaxKind.AwaitExpression || this.h30J06ListDeclarationOf(argument) === undefined) {
            return undefined;
        }
        const future = 'java.util.concurrent.CompletableFuture';
        const list = this.printNode(argument, 0);
        return `${future}.allOf(${list}.toArray(new ${future}<?>[0])).thenApply((promiseAllDone) -> `
            + `new java.util.ArrayList<Object>(${list}.stream().<Object>map(${future}::join).toList()))`;
    }
    // ===== end h30-J06
}

// `this.parseNumber ('0.0025')` inside a `tiers` row is a constant: BaseExchange.parseNumber returns the
// Double of Double.parseDouble(text), which is the correctly rounded value the Java literal `0.0025`
// autoboxes to; whole texts print `100.0` so the box stays a Double, never an Integer
function javaFeeTierLiteral(node: any): string | undefined {
    const arg = node?.arguments?.[0];
    if ((node?.kind !== SyntaxKind.CallExpression) || (node.arguments.length !== 1) || (arg.kind !== SyntaxKind.StringLiteral)
        || (node.expression?.kind !== SyntaxKind.PropertyAccessExpression) || (node.expression.expression?.kind !== SyntaxKind.ThisKeyword)
        || (node.expression.name?.text !== "parseNumber") || !/^-?\d+(\.\d+)?$/.test(arg.text)) { return undefined; }
    let n = node.parent;
    if (n?.kind !== SyntaxKind.ArrayLiteralExpression) { return undefined; }
    while ((n !== undefined) && (n.kind === SyntaxKind.ArrayLiteralExpression || n.kind === SyntaxKind.PropertyAssignment || n.kind === SyntaxKind.ObjectLiteralExpression)) {
        if ((n.kind === SyntaxKind.PropertyAssignment) && (n.name?.text === "tiers")) {
            return arg.text.includes(".") ? arg.text : arg.text + ".0";
        }
        n = n.parent;
    }
    return undefined;
}
