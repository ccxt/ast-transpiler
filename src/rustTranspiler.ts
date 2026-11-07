import { BaseTranspiler } from "./baseTranspiler.js";
import { NodeFlags, SyntaxKind, type Block, type CallExpression, type Declaration, type Expression, type Identifier, type Node, type NodeArray, type ParameterDeclaration, type SourceFile, type VariableDeclaration } from "typescript/unstable/ast";
import { isArrayLiteralExpression, isArrowFunction, isAsExpression, isBinaryExpression, isBindingElement, isBlock, isCallExpression, isClassDeclaration, isClassExpression, isConditionalExpression, isDeleteExpression, isElementAccessExpression, isForInStatement, isForOfStatement, isIdentifier, isMethodDeclaration, isNoSubstitutionTemplateLiteral, isNonNullExpression, isNumericLiteral, isObjectLiteralExpression, isParameterDeclaration, isParenthesizedExpression, isPrefixUnaryExpression, isPropertyAccessExpression, isReturnStatement, isShorthandPropertyAssignment, isSourceFile, isStatement, isStringLiteral, isStringLiteralLikeNode, isTypeAssertion, isVariableDeclaration } from "typescript/unstable/ast/is";
import { IndexKind, ObjectFlags, SignatureKind, SymbolFlags, TypeFlags, type Symbol as TsSymbol, type Type } from "typescript/unstable/sync";
import { findAncestor, getAllSuperTypeNodes, isFunctionLike, signatureDeclaration, symbolDeclarations, symbolValueDeclaration, typeParts, typeTarget } from "./tsUtils.js";
import * as fs from 'fs';

// ── type-keyed native forms ──
// A plain place path (`a`, `self.a.b`): side-effect-free, so it may be read twice or evaluated eagerly.
const RUST_PLAIN_PLACE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

const parserConfig = {
    'ELSEIF_TOKEN': 'else if',
    'OBJECT_OPENING': '{',
    'OBJECT_CLOSING': '}',
    'ARRAY_OPENING_TOKEN': 'Value::from(vec![',
    'ARRAY_CLOSING_TOKEN': '])',
    'PROPERTY_ASSIGNMENT_TOKEN': ':',
    'VAR_TOKEN': 'let mut',
    'METHOD_TOKEN': 'fn',
    'FUNCTION_TOKEN': 'fn',
    'PROPERTY_ASSIGNMENT_OPEN': '',
    'PROPERTY_ASSIGNMENT_CLOSE': '',
    'SUPER_TOKEN': 'super',
    'SUPER_CALL_TOKEN': 'super',
    'FALSY_WRAPPER_OPEN': 'is_true(&',
    'FALSY_WRAPPER_CLOSE': ')',
    'COMPARISON_WRAPPER_OPEN': 'is_equal(&',
    'COMPARISON_WRAPPER_CLOSE': ')',
    'UKNOWN_PROP_WRAPPER_OPEN': '',
    'UNKOWN_PROP_WRAPPER_CLOSE': '',
    'UKNOWN_PROP_ASYNC_WRAPPER_OPEN': '',
    'UNKOWN_PROP_ASYNC_WRAPPER_CLOSE': '',
    'DYNAMIC_CALL_OPEN': '',
    'EQUALS_EQUALS_WRAPPER_OPEN': 'is_equal(&',
    'EQUALS_EQUALS_WRAPPER_CLOSE': ')',
    'DIFFERENT_WRAPPER_OPEN': '!is_equal(&',
    'DIFFERENT_WRAPPER_CLOSE': ')',
    'GREATER_THAN_WRAPPER_OPEN': 'is_greater_than(&',
    'GREATER_THAN_WRAPPER_CLOSE': ')',
    'GREATER_THAN_EQUALS_WRAPPER_OPEN': 'is_greater_than_or_equal(&',
    'GREATER_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'LESS_THAN_WRAPPER_OPEN': 'is_less_than(&',
    'LESS_THAN_WRAPPER_CLOSE': ')',
    'LESS_THAN_EQUALS_WRAPPER_OPEN': 'is_less_than_or_equal(&',
    'LESS_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'PLUS_WRAPPER_OPEN': 'add(&',
    'PLUS_WRAPPER_CLOSE': ')',
    'MINUS_WRAPPER_OPEN': 'subtract(&',
    'MINUS_WRAPPER_CLOSE': ')',
    'ARRAY_LENGTH_WRAPPER_OPEN': 'get_array_length(&',
    'ARRAY_LENGTH_WRAPPER_CLOSE': ')',
    'DIVIDE_WRAPPER_OPEN': 'divide(&',
    'DIVIDE_WRAPPER_CLOSE': ')',
    'MULTIPLY_WRAPPER_OPEN': 'multiply(&',
    'MULTIPLY_WRAPPER_CLOSE': ')',
    'INDEXOF_WRAPPER_OPEN': 'get_index_of(&',
    'INDEXOF_WRAPPER_CLOSE': ')',
    'MOD_WRAPPER_OPEN': 'mod_val(&',
    'MOD_WRAPPER_CLOSE': ')',
    'LINE_TERMINATOR': ';',
    'CONDITION_OPENING': '',
    'CONDITION_CLOSE': '',
    'AWAIT_TOKEN': '',
    'NULL_TOKEN': 'Value::Null',
    'UNDEFINED_TOKEN': 'Value::Null',
    'WHILE_TOKEN': 'while',
    'ELEMENT_ACCESS_WRAPPER_OPEN': 'get_value(&',
    'ELEMENT_ACCESS_WRAPPER_CLOSE': ')',
    'DEFAULT_PARAMETER_TYPE': 'Value',
    'DEFAULT_RETURN_TYPE': 'Value',
    'BLOCK_OPENING_TOKEN': '{',
    'TRUE_KEYWORD': 'Value::Bool(true)',
    'FALSE_KEYWORD': 'Value::Bool(false)',
};

/** Answer of `RustTranspiler.rustDeclaredLocalTypeResolver` for a local whose
 *  value provably holds a `Value::Dict` at every use. */
export type RustDeclaredLocalKind = 'dict';

/** One `let x: Value = <dict-proven initialiser>` declaration. `kind` is only
 *  answered by the resolver when `alwaysDict && stable`. */
export interface RustDeclaredDictLocalEntry {
    kind: RustDeclaredLocalKind;
    name: string;
    /** printed callee of the initialiser: a `safe_dict*` name, or `value_map`. */
    source: string;
    /** the `safe_dict*` `optionalArgs` default is itself Dict-proven, so the
     *  helper returns a Dict on every path (it returns that default when the
     *  key does not hold one). */
    alwaysDict: boolean;
    /** no later write in the enclosing function can change the kind (D2). */
    stable: boolean;
    /** use classification: element-access receiver / kind-preserving mutator / anything else. */
    uses: { elementAccess: number, mutHelper: number, other: number };
    declaration: VariableDeclaration;
    start: number;
}

/** A `Dict`/`List` parameter whose body uses are all printable reads: the
 *  printer re-binds the same name to a borrowed container at fn entry
 *  (`let x = x.as_map().unwrap_or(&__x_empty);`) so every read is native. */
export interface RustParamShadow {
    kind: RustParamShadowKind;
    /** the parameter name; the shadow re-binds it, the `Value` ABI is untouched. */
    name: string;
    declaration: ParameterDeclaration;
}

/** Shadow kinds: `&IndexMap<String, Value>` / `&Vec<Value>`. */
export type RustParamShadowKind = 'map' | 'list';

/** Vocabulary of the parameter-shadow table (`RustTranspiler.rustParamShadowOf`). */
export const RUST_PARAM_SHADOWS = {
    MAP: 'map' as RustParamShadowKind,
    LIST: 'list' as RustParamShadowKind,
    /** `this.<safe*>` reads inlined natively against a shadowed dict param. */
    SAFE_READS: new Set([
        'safeValue', 'safeString', 'safeInteger', 'safeNumber', 'safeBool',
        'safeDict', 'safeList',
    ]),
};

/** Vocabulary of the declared-Dict locals table (see
 *  `RustTranspiler.rustDeclaredLocalTypeResolver`). */
export const RUST_DECLARED_DICT_LOCALS = {
    /** value the resolver answers for a proven Dict local */
    DICT: 'dict' as RustDeclaredLocalKind,
    /** printed `self.<callee>` -> index of its `optionalArgs` parameter.
     *  `safe_dict*` returns `optional_args[0]` whenever the key holds a non-Dict. */
    SAFE_CALLEES: {
        safe_dict_k: 2,
        safe_dict: 2,
        safe_dict_n: 2,
        safe_dict2: 3,
    } as Record<string, number>,
    /** `&mut` receivers whose writes land inside the container, so a Dict local
     *  stays a Dict (`add_element_to_object` / `append_to_array` no-op on a
     *  non-container, `set_value` / `remove` write a key). */
    KIND_PRESERVING_MUTATORS: new Set([
        'add_element_to_object', 'append_to_array', 'set_value', 'remove',
        'get_value_mut',
    ]),
};

/** `x = ..` / `x += ..` — every token that writes a place. */
function rustIsAssignmentOperator(kind: SyntaxKind): boolean {
    return kind === SyntaxKind.EqualsToken ||
        (kind >= SyntaxKind.PlusEqualsToken && kind <= SyntaxKind.CaretEqualsToken);
}

/** Preorder (forEachChild order) of a scope's descendants, decoded once: `end[i]` is the index past
 *  node i's subtree; `byName` lists identifiers and name-binding declarations per name text. */
interface RustScopeIndex {
    nodes: Node[];
    end: number[];
    byName: Map<string, number[]> | undefined;
}

const RUST_NAME_BINDER_KINDS = new Set<SyntaxKind>([
    SyntaxKind.VariableDeclaration, SyntaxKind.Parameter, SyntaxKind.FunctionDeclaration,
    SyntaxKind.ClassDeclaration, SyntaxKind.PropertyDeclaration, SyntaxKind.FunctionExpression,
    SyntaxKind.ArrowFunction,
]);

const RUST_WALK_SKIP = 1;
const RUST_WALK_STOP = 2;

function rustBuildScopeIndex(scope: Node): RustScopeIndex {
    const nodes: Node[] = [];
    const end: number[] = [];
    const visit = (n: any) => {
        const i = nodes.length;
        nodes.push(n);
        end.push(0);
        n.forEachChild(visit);
        end[i] = nodes.length;
    };
    scope.forEachChild(visit);
    return { nodes, end, byName: undefined };
}

// name text decoding is the costly part, so the name table is built on first use only
function rustScopeNameTable(index: RustScopeIndex): Map<string, number[]> {
    if (index.byName !== undefined) return index.byName;
    const byName = new Map<string, number[]>();
    const add = (name: string, i: number) => {
        const list = byName.get(name);
        if (list === undefined) byName.set(name, [i]);
        else if (list[list.length - 1] !== i) list.push(i);
    };
    const nodes: any[] = index.nodes;
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const kind = n.kind;
        if (RUST_NAME_BINDER_KINDS.has(kind) && n.name?.kind === SyntaxKind.Identifier) add(n.name.text, i);
        if (kind === SyntaxKind.Identifier) add(n.text, i);
    }
    index.byName = byName;
    return byName;
}

export class RustTranspiler extends BaseTranspiler {

    private rustScopeIndexes = new WeakMap<Node, RustScopeIndex>();

    rustScopeIndex(scope: Node): RustScopeIndex {
        let index = this.rustScopeIndexes.get(scope);
        if (index === undefined) {
            index = rustBuildScopeIndex(scope);
            this.rustScopeIndexes.set(scope, index);
        }
        return index;
    }

    /** `scope.forEachChild(visit)` recursion over the cached preorder: `visit` answers
     *  RUST_WALK_SKIP to skip the node's subtree, RUST_WALK_STOP to end the walk. */
    rustWalkScope(scope: Node, visit: (n: any) => number | void): void {
        const { nodes, end } = this.rustScopeIndex(scope);
        for (let i = 0; i < nodes.length;) {
            const r = visit(nodes[i]);
            if (r === RUST_WALK_STOP) return;
            i = r === RUST_WALK_SKIP ? end[i] : i + 1;
        }
    }

    /** Scope nodes that are an identifier or a name-binding declaration spelled `name`, in walk order. */
    rustScopeNameNodes(scope: Node, name: string): Node[] {
        const index = this.rustScopeIndex(scope);
        return (rustScopeNameTable(index).get(name) ?? []).map((i) => index.nodes[i]);
    }

    // node kinds the printer types that the core per-file prefetch leaves to single round trips
    private static readonly RUST_PREFETCH_TYPE_KINDS = new Set<SyntaxKind>([
        SyntaxKind.FalseKeyword, SyntaxKind.TrueKeyword, SyntaxKind.ParenthesizedExpression,
        SyntaxKind.AwaitExpression, SyntaxKind.PrefixUnaryExpression,
        SyntaxKind.BooleanKeyword, SyntaxKind.ObjectKeyword, SyntaxKind.UnionType,
        SyntaxKind.ConditionalExpression, SyntaxKind.AsExpression,
    ]);

    /** One bulk getTypeAtLocation for the class's nodes of those kinds, seeding the checker memo. */
    rustPrefetchClassTypes(node: Node): void {
        const getType: any = this.checkerOrUndefined()?.getTypeAtLocation;
        if (getType?.seed === undefined || getType.original === undefined) return;
        const kinds = RustTranspiler.RUST_PREFETCH_TYPE_KINDS;
        const nodes: Node[] = [];
        for (const n of this.rustScopeIndex(node).nodes) {
            if (kinds.has(n.kind) && !getType.has(n)) nodes.push(n);
        }
        if (nodes.length === 0) return;
        let results: unknown[];
        try {
            results = getType.original(nodes);
        } catch (e) {
            return; // the lazy per-node path answers them
        }
        nodes.forEach((n, i) => getType.seed(n, results[i]));
    }

    binaryExpressionsWrappers;
    methodSignatures: Record<string, { requiredCount: number }>;
    forLoopCounter: number;
    /** The handler `message` parameter a shadow is being printed for (set only
     *  while its method body is printed). */
    rustProHandlerShadowParam: ParameterDeclaration | undefined;

    /** Unified methods printed with a typed public signature (`config.typedUnified`, TS names). */
    rustTypedUnified: Set<string>;

    constructor(config = {}) {
        config['parser'] = Object.assign({}, parserConfig, config['parser'] ?? {});
        super(config);
        this.rustTypedUnified = new Set(config['typedUnified'] ?? []);

        this.requiresParameterType = true;
        this.requiresReturnType = false;
        this.asyncTranspiling = true;
        this.supportsFalsyOrTruthyValues = false;
        this.id = "Rust";
        this.className = "undefined";
        this.methodSignatures = {};
        this.forLoopCounter = 0;

        this.initConfig();
        this.applyUserOverrides(config);
    }

    initConfig() {
        this.LeftPropertyAccessReplacements = {};

        this.RightPropertyAccessReplacements = {};

        this.FullPropertyAccessReplacements = {
            'console.log': 'println_val',
            'Math.floor': 'math_floor',
            'Math.ceil': 'math_ceil',
            'Math.round': 'math_round',
        };

        this.CallExpressionReplacements = {};

        this.ReservedKeywordsReplacements = {
            'type': 'type_var',
            'move': 'move_val',
            'ref': 'ref_val',
            'str': 'str_val',
            'use': 'use_val',
            'mod': 'mod_kw',
            'loop': 'loop_val',
            'match': 'match_val',
            'where': 'where_val',
            'final': 'final_val',
            'box': 'box_val',
            'become': 'become_val',
            'priv': 'priv_val',
            'override': 'override_val',
            'unsized': 'unsized_val',
            'async': 'async_val',
            'await': 'await_val',
            'try': 'try_val',
            'abstract': 'abstract_val',
            'dyn': 'dyn_val',
            'fn': 'fn_val',
            'impl': 'impl_val',
            'pub': 'pub_val',
            'self': 'self_val',
            'super': 'super_val',
            'crate': 'crate_val',
        };

        // [fnName, close] — ensureRef adds & to each operand
        this.binaryExpressionsWrappers = {
            [SyntaxKind.EqualsEqualsToken]: ['is_equal(', ')'],
            [SyntaxKind.EqualsEqualsEqualsToken]: ['is_equal(', ')'],
            [SyntaxKind.ExclamationEqualsToken]: ['!is_equal(', ')'],
            [SyntaxKind.ExclamationEqualsEqualsToken]: ['!is_equal(', ')'],
            [SyntaxKind.GreaterThanToken]: ['is_greater_than(', ')'],
            [SyntaxKind.GreaterThanEqualsToken]: ['is_greater_than_or_equal(', ')'],
            [SyntaxKind.LessThanToken]: ['is_less_than(', ')'],
            [SyntaxKind.LessThanEqualsToken]: ['is_less_than_or_equal(', ')'],
            [SyntaxKind.PlusToken]: ['add(', ')'],
            [SyntaxKind.MinusToken]: ['subtract(', ')'],
            [SyntaxKind.AsteriskToken]: ['multiply(', ')'],
            [SyntaxKind.PercentToken]: ['mod_val(', ')'],
            [SyntaxKind.SlashToken]: ['divide(', ')'],
        };
    }

    // Escaped Rust string literal for the given TS literal text — shared by
    // the `Value::Str(..)` form and the `&str` key form below.
    quotedStringLiteral(text: string): string {
        // Preserve real backslashes
        const backslashPlaceholder = "\x00";
        text = text.replaceAll("\\", backslashPlaceholder);
        text = text.replaceAll("\b", "\\b");
        text = text.replaceAll("\f", "\\f");
        text = text.replaceAll("\n", "\\n");
        text = text.replaceAll("\r", "\\r");
        text = text.replaceAll("\t", "\\t");
        text = text.replaceAll(backslashPlaceholder, "\\\\");
        text = text.replaceAll('"', '\\"');
        return `"${text}"`;
    }

    // Imported hash algorithms and ccxt error classes used as values are their names.
    static readonly RUST_NAME_VALUE_IMPORTS = new Set([
        'sha256', 'sha512', 'sha384', 'sha224', 'sha3', 'sha1', 'md5', 'keccak', 'ed25519', 'ripemd160', 'secp256k1', 'p256',
        'NotSupported', 'ArgumentsRequired', 'InvalidOrder', 'InvalidAddress', 'BadRequest', 'BadResponse', 'AuthenticationError',
        'ExchangeError', 'ExchangeNotAvailable', 'NetworkError', 'DDoSProtection', 'RateLimitExceeded', 'InsufficientFunds',
        'OrderNotFound', 'InvalidNonce', 'PermissionDenied', 'AccountNotEnabled', 'AccountSuspended', 'NotImplemented',
        'OperationFailed', 'OperationRejected', 'RequestTimeout', 'MarginModeAlreadySet', 'ManualInteractionNeeded',
        'UnsubscribeError', 'ContractUnavailable', 'MarketClosed', 'ExchangeClosedByUser', 'NullResponse', 'InvalidProxySettings',
        'ChecksumError', 'OnMaintenance', 'BadSymbol', 'NoChange', 'CancelPending', 'OrderNotCached', 'OrderImmediatelyFillable',
        'OrderNotFillable', 'DuplicateOrderId', 'RestrictedLocation', 'AddressPending', 'BaseError',
    ]);

    // Precision-mode constants imported from base/functions/number.
    static readonly RUST_NUMBER_CONSTANT_IMPORTS = new Set([
        'TICK_SIZE', 'TRUNCATE', 'ROUND', 'ROUND_UP', 'ROUND_DOWN', 'NO_PADDING', 'PAD_WITH_ZERO', 'SIGNIFICANT_DIGITS', 'DECIMAL_PLACES',
    ]);

    printIdentifier(node) {
        const name = String(node.text);
        if (RustTranspiler.RUST_NAME_VALUE_IMPORTS.has(name) && this.rustIsImportedValueName(node)) {
            return `Value::Str(${this.quotedStringLiteral(name)}.into())`;
        }
        if (RustTranspiler.RUST_NUMBER_CONSTANT_IMPORTS.has(name) && this.rustIsImportedValueName(node)) {
            return `Value::Int(crate::runtime::${name})`;
        }
        return super.printIdentifier(node);
    }

    /** A bare read of an imported (or top-level destructured) binding: never a callee, member, key or `new` target. */
    rustIsImportedValueName(node): boolean {
        const parent: any = node.parent;
        if (parent === undefined) return false;
        if ((isCallExpression(parent) || parent.kind === SyntaxKind.NewExpression) && parent.expression === node) return false;
        if (isPropertyAccessExpression(parent) || parent.kind === SyntaxKind.PropertyAssignment && parent.name === node) return false;
        if (isElementAccessExpression(parent) && parent.expression === node) return false;
        let declarations: any[];
        try {
            declarations = symbolDeclarations(this.getChecker().getSymbolAtLocation(node));
        } catch (e) {
            return false;
        }
        return declarations.length > 0 && declarations.every((d) => d.kind === SyntaxKind.ImportSpecifier
            || (isBindingElement(d) && isSourceFile(findAncestor(d, (a) => isStatement(a))?.parent)));
    }

    printStringLiteral(node) {
        const text = node.text;
        if (text in this.StringLiteralReplacements) return this.StringLiteralReplacements[text];
        // `.into()` borrows the `&'static str` into the `Cow` payload — no alloc.
        return `Value::Str(${this.quotedStringLiteral(text)}.into())`;
    }

    printNumericLiteral(node) {
        const text = node.text;
        // a decimal point or an exponent makes the literal a float
        if (text.includes('.') || /[eE]/.test(text)) return `Value::Float(${text})`;
        return `Value::Int(${text})`;
    }

    printBooleanLiteral(node) {
        return `Value::Bool(${SyntaxKind.TrueKeyword === node.kind})`;
    }

    printNullKeyword(node, identation) {
        return 'Value::Null';
    }

    // ── native equality emission ────────────────────────────────────────────
    // When the checker proves both operands hold the same primitive payload
    // (string / number / boolean, or one side is a matching literal) the
    // unwrapped payloads are compared with `==`/`!=` instead of is_equal().

    // Operators whose printed form is a bare Rust `bool` (not a Value).
    private static readonly BOOL_PRODUCING_OPERATORS = new Set([
        SyntaxKind.EqualsEqualsToken,
        SyntaxKind.EqualsEqualsEqualsToken,
        SyntaxKind.ExclamationEqualsToken,
        SyntaxKind.ExclamationEqualsEqualsToken,
        SyntaxKind.LessThanToken,
        SyntaxKind.LessThanEqualsToken,
        SyntaxKind.GreaterThanToken,
        SyntaxKind.GreaterThanEqualsToken,
        SyntaxKind.AmpersandAmpersandToken,
        SyntaxKind.BarBarToken,
        SyntaxKind.InstanceOfKeyword,
    ]);

    // Method names whose Rust helper returns a bare `bool` (not a Value).
    private static readonly BOOL_PRODUCING_CALLS = new Set([
        'isInteger',
        'isSafeInteger',
        'some',
        'every',
        'test',
    ]);

    // Receiver locals whose element writes may go native by name. `request`
    // is covered by the request-builder proof; every other receiver keeps the helper.
    private static readonly RUST_NATIVE_INSERT_RECEIVERS = new Set([
        'result',
        'account',
        'params',
        'fee',
    ]);

    // Scalar book fields the shared order-book store keeps instead of the Dict
    // (value.rs `is_book_meta_key` plus the `cache` replacement write).
    private static readonly RUST_ORDERBOOK_META_FIELDS = new Set(['timestamp', 'datetime', 'nonce', 'symbol']);
    private static readonly RUST_ORDERBOOK_READ_FIELDS = new Set(['bids', 'asks', 'timestamp', 'datetime', 'nonce', 'symbol', 'cache']);
    private static readonly RUST_ORDERBOOK_CLASSES = new Set(['OrderBook', 'WsOrderBook', 'CountedOrderBook', 'IndexedOrderBook']);

    private static readonly RUST_BOOK_META_KEYS = new Set([
        'timestamp',
        'datetime',
        'nonce',
        'symbol',
        'checksum',
        'cache',
    ]);

    // `this.<field>` receivers whose Value may be a tagged live handle (order
    // book / cache / ws client / subscriptions snapshot) — these keep the helper
    // so its store write-through stays reachable.
    private static readonly RUST_TAGGED_HANDLE_FIELDS = new Set([
        'cache',
        'client',
        'subscriptions',
        'orderbook',
    ]);

    // Fields the hand-written base keeps as a plain dict: `rust/ccxt-base/src/exchange.rs`
    // initialises each to `Value::Map(HashMap::new())` and never tags it, so an element write
    // is the whole helper even though the TS declaration is `any` (no checker shape to read).
    private static readonly RUST_PLAIN_DICT_FIELDS = new Set([
        'balance',
        'orderbooks',
        'trades',
        'tickers',
        'bidsasks',
        'ohlcvs',
        'clients',
        'transactions',
        'headers',
        'currencies',
        'has',
        'tokenBucket',
    ]);

    // Free helpers whose call prints a bare `bool` — an argument position that
    // expects a `Value` has to box them (ccxt's wrapBoolValueArgs set).
    private static readonly RUST_BOOL_VALUE_HELPERS = [
        'is_equal',
        'is_true',
        'is_greater_than',
        'is_less_than',
        'is_greater_than_or_equal',
        'is_less_than_or_equal',
        'is_array',
        'is_object',
        'in_op',
        'is_number',
        'is_string',
    ];

    // Payload accessor used to compare each primitive kind natively.
    private static readonly PAYLOAD_ACCESSORS = {
        'string': 'as_str',
        'number': 'as_f64',
        'boolean': 'as_bool',
    };

    // Primitive kind the checker proves for `type`; a union keeps the kind only
    // when every non-nullable member is that same primitive.
    primitiveKindOfType(type): string {
        if (type === undefined) return undefined;
        const flags = type.flags;
        if (this.isStringType(flags)) return 'string';
        if (flags === TypeFlags.Number || flags === TypeFlags.NumberLiteral) return 'number';
        if (flags === TypeFlags.Boolean || flags === TypeFlags.BooleanLiteral) return 'boolean';
        if (flags & TypeFlags.Union) {
            let kind = undefined;
            for (const member of typeParts(type) ?? []) {
                if (member.flags & (TypeFlags.Undefined | TypeFlags.Null)) {
                    continue;
                }
                const memberKind = this.primitiveKindOfType(member);
                if (memberKind === undefined || (kind !== undefined && kind !== memberKind)) return undefined;
                kind = memberKind;
            }
            return kind;
        }
        return undefined;
    }

    // Native truthiness of a checker-proved boolean Value: `is_true(&v)` is `v.is_truthy()`
    // (`""`/`0`/`[]`/`{}`/Null are false). When the operand is proven `bool`/`undefined` only,
    // the runtime value is `Value::Bool(..)` or `Value::Null`, so `matches!(v, Value::Bool(true))`.

    /** `true` / `false` / `boolean` (a union of BooleanLiteral members too). */
    isBooleanValueType(type: Type | undefined): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            const members: Type[] = typeParts(type) ?? [];
            return members.length > 0 && members.every((member) => this.isBooleanValueType(member));
        }
        return (type.flags & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) !== 0;
    }

    /** `boolean | undefined`: `undefined`/`null` both print `Value::Null` (false
     *  for the helper and for the `matches!` alike), so they may join the union. */
    isBooleanOrUndefinedType(type: Type | undefined): boolean {
        if (type === undefined) return false;
        const members: Type[] = (type.flags & TypeFlags.Union) ? (typeParts(type) ?? []) : [type];
        if (members.length === 0) return false;
        const onlyBooleanOrEmpty = members.every((member) =>
            this.isBooleanValueType(member) ||
            (member.flags & (TypeFlags.Undefined | TypeFlags.Void | TypeFlags.Null)) !== 0);
        return onlyBooleanOrEmpty && members.some((member) => this.isBooleanValueType(member));
    }

    /** Operands this rule handles: `safeBool`/`safeBool2`/`safeBoolN` calls (a
     *  `Value` in the port) and element accesses (printed as `get_value`). */
    isBooleanValueFamilyOperand(node): boolean {
        const inner = this.unwrapParens(node);
        if (inner === undefined) return false;
        if (isElementAccessExpression(inner)) return true;
        if (isCallExpression(inner)) {
            const name = this.callExpressionName(inner);
            return name === 'safeBool' || name === 'safeBool2' || name === 'safeBoolN';
        }
        return false;
    }

    /** Declarations `printVariableDeclarationList` emitted as `let mut x: bool`. */
    private rustBoolDeclaredLocals = new WeakSet<Node>();

    /** A bare identifier whose reads still hold a `Value` box: every declaration
     *  this printer emits as `Value` (param, destructured element, local) minus
     *  the ones the declaration site retypes to a native Rust type. */
    isBooleanValueIdentifier(node): boolean {
        const inner = this.unwrapParens(node);
        if (inner === undefined || !isIdentifier(inner) || !this.isDeclaredValueIdentifier(inner)) return false;
        const declarations = symbolDeclarations((this.getChecker() as any).getSymbolAtLocation(inner));
        return declarations.length > 0 && declarations.every((declaration) =>
            !this.rustDeclarationPrintsNativeBool(declaration));
    }

    /** The declaration site emits `let mut x: bool = …` (see
     *  `getRustBoolLocalInitializer`): its reads are native bools, not `Value`. */
    rustDeclarationPrintsNativeBool(declaration): boolean {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        if (this.rustBoolDeclaredLocals.has(declaration)) return true;
        const initializer = declaration.initializer;
        if (initializer === undefined || declaration.name?.kind !== SyntaxKind.Identifier) return false;
        return this.rustTypeIsBoolean(initializer) &&
            this.rustLocalUsesAcceptBool(declaration, declaration.name.text);
    }

    /** The emitted `matches!` is a bare Rust `bool`: it is only valid where the
     *  whole enclosing boolean expression already sits in a bool slot. A logical
     *  expression stored in a `Value` slot gets its `Value::Bool(..)` box from the
     *  ccxt post-passes, which key on the leading helper token the operand would
     *  no longer provide. */
    isBareBoolEmissionSafe(node): boolean {
        return this.isBooleanPosition(this.rustClimbLogicalWrappers(node));
    }

    /** Outermost ancestor reached through parens, `!` and `&&`/`||`. */
    rustClimbLogicalWrappers(node): any {
        let current: any = node;
        let parent: any = current.parent;
        while (parent !== undefined && (isParenthesizedExpression(parent) ||
            (parent.kind === SyntaxKind.PrefixUnaryExpression && parent.operator === SyntaxKind.ExclamationToken) ||
            (parent.kind === SyntaxKind.BinaryExpression &&
             (parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken ||
              parent.operatorToken.kind === SyntaxKind.BarBarToken)))) {
            current = parent;
            parent = parent.parent;
        }
        return current;
    }

    // The proof extends to the printer's own bool-typed sinks: a narrowed `let x: bool = …`
    // (getRustBoolLocalInitializer) and a logical boxed in `Value::Bool(…)`
    // (printCustomBinaryExpressionIfAny) both demand a `bool`, so their operands may print bare.
    rustConditionBoolSlot(node): boolean {
        if (this.isBareBoolEmissionSafe(node)) return true;
        const current = this.rustClimbLogicalWrappers(node);
        // A logical the printer boxes (`Value::Bool(<logical>)`) for a Value slot.
        const inner = this.unwrapParens(current);
        if (inner !== undefined && inner.kind === SyntaxKind.BinaryExpression &&
            (inner.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken ||
             inner.operatorToken.kind === SyntaxKind.BarBarToken) &&
            (this.hasNativeComparisonOperand(inner.left) || this.hasNativeComparisonOperand(inner.right))) {
            return true;
        }
        // The initializer of a local this printer declares `bool`.
        const declaration: any = current.parent;
        if (declaration === undefined || !isVariableDeclaration(declaration) ||
            declaration.initializer !== current || declaration.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        return this.rustNodeIsBoolExpression(declaration.initializer) &&
            this.rustTypeIsBoolean(declaration.initializer) &&
            this.rustLocalUsesAcceptBool(declaration, String(declaration.name.text));
    }

    /** Native truthiness text of the operand, or undefined to keep `is_true`. */
    printNativeTruthiness(node): string | undefined {
        if (!this.isBooleanValueFamilyOperand(node) || !this.printsValueExpression(node) ||
            !this.isBooleanOrUndefinedType(this.typeOfNodeIfAny(node)) || !this.isBareBoolEmissionSafe(node)) {
            return undefined;
        }
        return `matches!(${this.printNode(node, 0)}, Value::Bool(true))`;
    }

    /** Same native truthiness for a bare `Value`-boxed identifier of boolean type. Prints the bool-tuple
     *  truthiness text (`x.as_bool() == Some(true)`) so the typed-locals pass keeps rewriting it byte-identically. */
    printNativeIdentifierTruthiness(node): string | undefined {
        if (!this.isBooleanValueIdentifier(node) || !this.printsValueExpression(node) ||
            !this.isBooleanOrUndefinedType(this.typeOfNodeIfAny(node)) || !this.isBareBoolEmissionSafe(node)) {
            return undefined;
        }
        const text = `${this.printNode(node, 0)}.as_bool() == Some(true)`;
        let current: any = node;
        while (current.parent !== undefined && isParenthesizedExpression(current.parent)) current = current.parent;
        const negated = current.parent?.kind === SyntaxKind.PrefixUnaryExpression &&
            current.parent.operator === SyntaxKind.ExclamationToken;
        return negated ? `(${text})` : text;
    }

    // Kind of a literal operand whose printed Value variant is exactly known.
    literalKindOfNode(node): string {
        if (node === undefined) return undefined;
        switch (node.kind) {
        case SyntaxKind.StringLiteral: return 'string';
        case SyntaxKind.NumericLiteral: return 'number';
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword: return 'boolean';
        case SyntaxKind.NullKeyword: return 'null';
        case SyntaxKind.Identifier: return node.text === 'undefined' ? 'null' : undefined;
        }
        return undefined;
    }

    // Does printNode() render `node` as a Rust `Value` (and not a bare bool)?
    printsValueExpression(node): boolean {
        if (node === undefined) return false;
        switch (node.kind) {
        case SyntaxKind.ParenthesizedExpression: return this.printsValueExpression(node.expression);
        case SyntaxKind.AwaitExpression: return this.printsValueExpression(node.expression);
        case SyntaxKind.BinaryExpression: return !RustTranspiler.BOOL_PRODUCING_OPERATORS.has(node.operatorToken.kind);
        case SyntaxKind.PrefixUnaryExpression: return node.operator !== SyntaxKind.ExclamationToken;
        case SyntaxKind.CallExpression: return !RustTranspiler.BOOL_PRODUCING_CALLS.has(this.callExpressionName(node));
        case SyntaxKind.Identifier:
        case SyntaxKind.PropertyAccessExpression:
        case SyntaxKind.ElementAccessExpression:
            return !this.isClassInstanceType(this.getChecker().getTypeAtLocation(node));
        case SyntaxKind.StringLiteral:
        case SyntaxKind.NumericLiteral:
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.NullKeyword:
        case SyntaxKind.ArrayLiteralExpression:
        case SyntaxKind.ObjectLiteralExpression:
        case SyntaxKind.ConditionalExpression:
            return true;
        }
        return false;
    }

    // Class instances are emitted as their Rust struct (not a Value), so they
    // can neither be compared to Value::Null nor unwrapped with as_*().
    callExpressionName(node): string {
        const expression = node.expression;
        if (isIdentifier(expression)) return expression.text as string;
        if (isPropertyAccessExpression(expression)) return expression.name.text as string;
        return '';
    }

    // Does a string (literal text or literal-type value) parse as a number?
    // is_equal() coerces those against numeric/bool operands, a plain string
    // compare does not.
    textCoercesToNumber(text: string): boolean {
        return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) || /^[+-]?(inf|infinity|nan)$/i.test(text);
    }

    // f64 literal text for a numeric literal; undefined when it is not a Rust
    // decimal/float literal (hex/octal/binary fall back to the helper).
    numericLiteralF64Text(node): string {
        const text = node.text;
        if (text.startsWith('0x') || text.startsWith('0o') || text.startsWith('0b')) return undefined;
        if (text.startsWith('.')) return `0${text}`;
        if (text.includes('.') || text.includes('e') || text.includes('E')) return text;
        return `${text}.0`;
    }

    // The printer's own proof that a plain read prints as a Rust `Value`: `this.<field>` (every
    // declared field is `Value`) or an identifier bound to a local/param (a local is narrowed to
    // `bool` only when every use is a condition sink — never an is_equal argument).
    rustReadPrintsValue(node): boolean {
        if (node === undefined) return false;
        if (node.kind === SyntaxKind.PropertyAccessExpression && node.expression.kind === SyntaxKind.ThisKeyword) return true;
        if (node.kind !== SyntaxKind.Identifier) return false;
        const symbol: any = this.getChecker().getSymbolAtLocation(node);
        const declarations: any[] = symbolDeclarations(symbol);
        if (declarations.length === 0) return false;
        return declarations.every((declaration) => isParameterDeclaration(declaration)
            || (isVariableDeclaration(declaration)
                && declaration.initializer?.kind !== SyntaxKind.NewExpression));
    }

    // Can the checked type only hold a Bool, Null/undefined or a non-numeric
    // string? Then `x.as_bool() == Some(b)` answers exactly what is_equal(x, b)
    // does: its f64 fallback (Str parse / Bool→0|1) can never fire.
    rustBooleanComparableType(type): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            const members: any[] = typeParts(type) ?? [];
            return members.length > 0 && members.every((member) => this.rustBooleanComparableType(member));
        }
        if (type.flags & (TypeFlags.Boolean | TypeFlags.BooleanLiteral)) return true;
        if (type.flags & (TypeFlags.Undefined | TypeFlags.Null)) return true;
        if (type.flags & TypeFlags.StringLiteral) return !this.textCoercesToNumber(String((type as any).value ?? ''));
        return false;
    }

    // Native `==`/`!=` on the unwrapped payload when the checker proves the
    // Value variants line up; undefined keeps the is_equal() helper.
    printNativeEqualityComparison(left, right, op): string {
        const nativeIntResult = this.rustLengthEquality(left, right, op); if (nativeIntResult !== undefined) return nativeIntResult;
        const r12 = this.rustNativeBoolEquality(left, right, op); if (r12 !== undefined) return r12;
        const r13 = this.printRustProvenStrEquality(left, right, op); if (r13 !== undefined) return r13;
        const r20 = this.boolCallEquality(left, right, op); if (r20 !== undefined) return r20;
        const operator = (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken) ? '==' : '!=';
        const leftLiteral = this.literalKindOfNode(left);
        const rightLiteral = this.literalKindOfNode(right);
        if (leftLiteral !== undefined && rightLiteral !== undefined) return undefined;
        if (leftLiteral !== undefined || rightLiteral !== undefined) {
            const literal = leftLiteral !== undefined ? left : right;
            const literalKind = leftLiteral ?? rightLiteral;
            const other = leftLiteral !== undefined ? right : left;
            if (!this.printsValueExpression(other) && (literalKind !== 'null' || !this.rustReadPrintsValue(other))) return undefined;
            const otherType = this.getChecker().getTypeAtLocation(other);
            const otherKind = this.primitiveKindOfType(otherType);
            const typedStringLocal = this.rustStringLocalIdentifierIsTyped(other);
            if (literalKind === 'null') {
                // Exact for every runtime value: is_equal(x, null) is true only
                // when x is Null, and the derived PartialEq says the same.
                if (typedStringLocal) return `${this.printNode(other, 0)}.${operator === '==' ? 'is_none' : 'is_some'}()`;
                return `${this.printNode(other, 0)} ${operator} Value::Null`;
            }
            if (literalKind === 'string') {
                if (literal.text in this.StringLiteralReplacements) return undefined;
                if (this.textCoercesToNumber(literal.text) && otherKind !== 'string') return undefined;
                const accessor = typedStringLocal ? 'as_deref' : 'as_str';
                return `${this.printNode(other, 0)}.${accessor}() ${operator} Some(${this.quotedStringLiteral(literal.text)})`;
            }
            if (literalKind === 'number') {
                if (otherKind !== 'number') return undefined;
                const text = this.numericLiteralF64Text(literal);
                if (text === undefined) return undefined;
                return `${this.printNode(other, 0)}.as_f64() ${operator} Some(${text})`;
            }
            if (literalKind === 'boolean') {
                if (otherKind !== 'boolean' && !this.rustBooleanComparableType(otherType)) return undefined;
                const value = literal.kind === SyntaxKind.TrueKeyword ? 'true' : 'false';
                return `${this.printNode(other, 0)}.as_bool() ${operator} Some(${value})`;
            }
            return undefined;
        }
        if (!this.printsValueExpression(left) || !this.printsValueExpression(right)) return undefined;
        const leftKind = this.primitiveKindOfType(this.getChecker().getTypeAtLocation(left));
        const rightKind = this.primitiveKindOfType(this.getChecker().getTypeAtLocation(right));
        if (leftKind === undefined || leftKind !== rightKind) return undefined;
        const accessor = RustTranspiler.PAYLOAD_ACCESSORS[leftKind];
        return `${this.printNode(left, 0)}.${accessor}() ${operator} ${this.printNode(right, 0)}.${accessor}()`;
    }

    // ── checker-typed helper elimination ─────────────────────────────────
    // Each predicate proves a static TS shape for which the native Rust form
    // is exactly what the runtime helper computes; only then is the helper
    // call dropped, anything unproven keeps the helper.

    typeOfNodeIfAny(node: Node): Type | undefined {
        // A transpile without a program/checker (bare snippet) has no types.
        return this.checkerOrUndefined()?.getTypeAtLocation(node);
    }

    // Arrays/tuples/strings: `.length` is exactly what `Value::len()` returns.
    // Other shapes (Dict) keep the helper — ArrayCache / OrderBookSide markers
    // hold their length in the marker dict, which get_array_length unwraps.
    isValueLengthType(type: Type | undefined): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            const parts: Type[] = typeParts(type) ?? [];
            return parts.length > 0 && parts.every((part) => this.isValueLengthType(part));
        }
        // A `null`/`undefined` member boxes as `Value::Null`, whose `len()` is
        // the same number the helper's fallthrough returns for it.
        return (type.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void)) !== 0
            || this.getChecker().isArrayType(type)
            || this.getChecker().isTupleType(type)
            || this.isStringType(type.flags);
    }

    printArrayLength(node, identation, leftExpr = undefined) {
        const receiver = leftExpr ?? this.printNode(node.expression, 0);
        if (!this.rustIsOrderBookSide(node.expression) && this.isValueLengthType(this.typeOfNodeIfAny(node.expression))) return `Value::Int(${receiver}.len() as i64)`;
        // A read-only list bearer is a `Vec<Value>`; `len()` is the helper's answer.
        if (this.rustReadBearerKind(node.expression) === 'list') return `Value::Int(${receiver}.len() as i64)`;
        if (this.provenListValue(node.expression)) return `${receiver}.as_array().map_or(Value::Int(0), |__a| Value::Int(__a.len() as i64))`;
        return this.arrLength(node, receiver) ?? `get_array_length(&${receiver})`;
    }

    /** `orderbook['bids']` / `orderbook.asks` on an `OrderBook`-typed receiver, or a
     *  local initialised from one. The WS runtime keeps those sides as marker dicts
     *  whose levels live in the side store, so only `get_array_length` / `get_value`
     *  reach them — the checker's array type is not the runtime shape. */
    rustIsOrderBookSide(node: Node, depth = 0): boolean {
        const stripped = this.rustStripWrappers(node);
        if (stripped === undefined || depth > 4) return false;
        if (isIdentifier(stripped)) {
            const declaration = this.rustSingleLocalDeclaration(stripped);
            return declaration !== undefined && isVariableDeclaration(declaration)
                && this.rustIsOrderBookSide(declaration.initializer, depth + 1);
        }
        let receiver: Node | undefined;
        let key: string | undefined;
        if (isElementAccessExpression(stripped) && isStringLiteralLikeNode(stripped.argumentExpression)) {
            receiver = stripped.expression;
            key = stripped.argumentExpression.text;
        } else if (isPropertyAccessExpression(stripped)) {
            receiver = stripped.expression;
            key = String(stripped.name.text);
        }
        if (receiver === undefined || (key !== 'bids' && key !== 'asks')) return false;
        const symbol = (this.typeOfNodeIfAny(receiver) as any)?.getSymbol?.();
        return symbol !== undefined && /^(Indexed|Counted)?OrderBook$/.test(symbol.name);
    }

    // Native string search / slicing: `x.indexOf(y)` and `x.slice(a, b)` on a checker-proven
    // string receiver print native `str` code. The receiver is a `Value`, so the payload is reached
    // via `as_str()`; a `Value::Null` receiver takes the helper's `-1` / `Value::Null` branch.

    /** Literal integer bound of a `slice` call (`3`, `-64`), else undefined. */
    rustSliceLiteralBound(node): number | undefined {
        if (node === undefined) return undefined;
        if (isNumericLiteral(node)) {
            const value = Number(node.text);
            return Number.isSafeInteger(value) ? value : undefined;
        }
        if (isPrefixUnaryExpression(node) && node.operator === SyntaxKind.MinusToken &&
            isNumericLiteral(node.operand)) {
            const value = Number(node.operand.text);
            return Number.isSafeInteger(value) ? -value : undefined;
        }
        return undefined;
    }

    // `slice` clamps like JS: a non-negative bound is capped at the length, a
    // negative one counts from the end and is floored at 0.
    rustSliceClampedIndex(value: number): string {
        return value < 0 ? `(__l - ${-value}).max(0)` : `__l.min(${value})`;
    }

    // `x.indexOf("lit")` on a proven string receiver: `str::find` is exactly
    // the helper's `Value::Str` arm (byte index, `-1` when absent).
    printNativeStringIndexOf(node, receiverText: string): string | undefined {
        if (node === undefined || !isCallExpression(node) ||
            !isPropertyAccessExpression(node.expression) || node.arguments?.length !== 1) {
            return undefined;
        }
        if (this.primitiveKindOfType(this.typeOfNodeIfAny(node.expression.expression)) !== 'string') return undefined;
        const needle = node.arguments[0];
        if (!isStringLiteral(needle) && !isNoSubstitutionTemplateLiteral(needle)) return undefined;
        if (typeof receiverText !== 'string' || receiverText.includes('\n')) return undefined;
        const literal = this.escapeRustStringLiteral(needle.text);
        return `Value::Int(${receiverText}.as_str().and_then(|__s| __s.find("${literal}")).map(|__i| __i as i64).unwrap_or(-1))`;
    }

    // `x.slice(a)` / `x.slice(a, b)` with literal bounds on a proven string
    // receiver: the helper's char-vector clamps are inlined, so the emission
    // returns the same string (and `Value::Null` for a null receiver).
    printNativeStringSlice(node, receiverText: string): string | undefined {
        if (node === undefined || !isCallExpression(node) ||
            !isPropertyAccessExpression(node.expression)) {
            return undefined;
        }
        const args = node.arguments ?? [];
        if (args.length === 0 || args.length > 2) return undefined;
        if (this.primitiveKindOfType(this.typeOfNodeIfAny(node.expression.expression)) !== 'string') return undefined;
        if (typeof receiverText !== 'string' || receiverText.includes('\n')) return undefined;
        const start = this.rustSliceLiteralBound(args[0]);
        if (start === undefined) return undefined;
        let end = '__l';
        if (args[1] !== undefined && args[1].kind !== SyntaxKind.NullKeyword && args[1].kind !== SyntaxKind.UndefinedKeyword) {
            const bound = this.rustSliceLiteralBound(args[1]);
            if (bound === undefined) return undefined;
            end = this.rustSliceClampedIndex(bound);
        }
        const begin = this.rustSliceClampedIndex(start);
        return `${receiverText}.as_str().map(|__s| { let __c: Vec<char> = __s.chars().collect();` +
            ` let __l = __c.len() as i64; let __i = ${begin}; let __j = ${end};` +
            ` if __i <= __j { __c[__i as usize..__j as usize].iter().collect::<String>() } else { String::new() } })` +
            `.map(Value::from).unwrap_or(Value::Null)`;
    }

    // Native value predicates (`Array.isArray` / `typeof … === '…'`): each runtime predicate is a
    // single `matches!` over the `Value` variants, so on a declared `Value` place the call is
    // replaced by that same match — no helper call, operand still read exactly once.

    // `matches!` pattern of the runtime predicate, keyed by the `typeof` word.
    private static readonly RUST_TYPE_PREDICATE_PATTERNS: { [key: string]: string } = {
        'array': 'Value::Arr(_)',
        'string': 'Value::Str(_)',
        'number': 'Value::Int(_) | Value::Float(_)',
        'boolean': 'Value::Bool(_)',
        'object': 'Value::Dict(_)',
    };

    // An identifier bound by a local/param declaration: the printer declares
    // every one of them as `Value`. Imports, classes and function names print
    // as Rust items rather than as values, so they keep the helper.
    isDeclaredValueIdentifier(node): boolean {
        const declarations = symbolDeclarations((this.getChecker() as any).getSymbolAtLocation(node));
        return declarations.length > 0 && declarations.every((d) =>
            isVariableDeclaration(d) || isParameterDeclaration(d) || isBindingElement(d));
    }

    // A declared `Value` place: a local/param identifier, or a field/element
    // access rooted at `this` or at such an identifier. Those are the operands
    // whose printed text the helper already borrows as a `Value`.
    isDeclaredValuePlace(node): boolean {
        const inner = this.unwrapParens(node);
        if (inner !== undefined && isIdentifier(inner)) {
            return this.isDeclaredValueIdentifier(inner);
        }
        if (inner !== undefined && (isPropertyAccessExpression(inner) || isElementAccessExpression(inner))) {
            const root = this.unwrapParens(this.valuePlaceRoot(inner));
            return root !== undefined &&
                (root.kind === SyntaxKind.ThisKeyword || this.isDeclaredValueIdentifier(root));
        }
        return false;
    }

    valuePlaceRoot(node): any {
        let current: any = node;
        while (isPropertyAccessExpression(current) || isElementAccessExpression(current)) {
            current = current.expression;
        }
        return current;
    }

    nativeValuePredicateText(kind: string, operandNode, printedOperand: string): string | undefined {
        const pattern = RustTranspiler.RUST_TYPE_PREDICATE_PATTERNS[kind];
        if (pattern === undefined || operandNode === undefined || printedOperand === undefined ||
            !this.isDeclaredValuePlace(operandNode)) {
            return undefined;
        }
        return `matches!(${this.ensureRef(printedOperand)}, ${pattern})`;
    }

    // Object-typed values are Dicts at runtime, so `key in obj` is a plain
    // key lookup. Arrays keep the helper: `in_op` searches them element-wise.
    // A `Dict`/`Dictionary<T>` receiver is a Reference to its index-signature
    // interface, so the class/lib guards — not the Reference flag — decide it.
    isDictShapedType(type: Type | undefined): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            // `Market | undefined` style aliases: a nullish member carries no
            // value, so only the value-carrying members have to be dict-shaped.
            // `in_op` and the native insert both answer false / no-op on Null.
            const parts: Type[] = typeParts(type) ?? [];
            const valueParts = parts.filter((part) => !this.rustTypeIsNullish(part));
            return parts.length > valueParts.length && valueParts.length > 0
                && valueParts.every((part) => this.isDictShapedType(part));
        }
        const checker = this.getChecker();
        if (!(type.flags & TypeFlags.Object) || type.getCallSignatures().length !== 0
            || checker.isArrayType(type) || checker.isTupleType(type) || checker.isArrayLikeType(type)) {
            return false;
        }
        return !this.isClassInstanceType(type) && !this.isLibDeclaredType(type);
    }

    // `"key" in obj` → `matches!(&obj, Value::Dict(__d) if __d.contains_key("key"))`
    // In the TS AST `key` is the left operand and `obj` the right one.
    printNativeInOperator(key, obj) {
        if (!isStringLiteral(key) || !this.isDictShapedType(this.typeOfNodeIfAny(obj))) {
            return undefined;
        }
        const keyLiteral = this.rustStringLiteralOf(this.printStringLiteral(key));
        if (keyLiteral === undefined) {
            return undefined;
        }
        const objExpr = this.printNode(obj, 0);
        return `Value::Bool(matches!(&${objExpr}, Value::Dict(__d) if __d.contains_key(${keyLiteral})))`;
    }

    // The Rust string literal behind a printed TS string literal — the boxed
    // shapes the printer emits today (`Value::Str("k".to_string())`,
    // `Value::from("k")`) plus a bare `"k"` once an arg-shape unit drops the box.
    rustStringLiteralOf(printedKey: string): string | undefined {
        const boxed = printedKey.match(/^(?:Value::Str|Value::from)\((.+)\)$/);
        const literal = (boxed ? boxed[1].replace(/\.(?:to_string|into)\(\)$/, '') : printedKey).trim();
        return /^"(?:[^"\\]|\\.)*"$/.test(literal) ? literal : undefined;
    }

    // `X["k"] = v` on a checker-proven plain Dict receiver: mutate the Dict
    // natively. The helper's tag hooks (book meta, ws subscriptions, cache
    // hashmap) only fire on tagged dicts, which a plain object type never is.
    // `book["timestamp"|"datetime"|"nonce"|"symbol"] = v` on a local the checker types as an
    // order-book class: `Value::set_book_meta` (hand-written, value.rs) does the shared-store
    // write (`try_book_meta_write`) and otherwise defers to the same `add_element_to_object`.
    printNativeBookMetaWrite(baseExpr, keyNode, keyText, valueText): string | undefined {
        if (!isIdentifier(baseExpr) || !isStringLiteral(keyNode)) {
            return undefined;
        }
        if (!RustTranspiler.RUST_ORDERBOOK_META_FIELDS.has(keyNode.text)) {
            return undefined;
        }
        if (this.rustDictBearerDeclaration(baseExpr) !== undefined || this.rustMapParamDeclaration(baseExpr) !== undefined) {
            return undefined;
        }
        const type = this.typeOfNodeIfAny(baseExpr);
        const name = type === undefined ? undefined : (this.typeSymbolOf(type) as any)?.name;
        if ((name === undefined || !RustTranspiler.RUST_ORDERBOOK_CLASSES.has(name))
            && !this.rustReadsOrderbooksStore(baseExpr)) {
            return undefined;
        }
        const keyLiteral = keyText.match(/^Value::Str\((.+)\.(?:to_string|into)\(\)\)$/);
        if (keyLiteral === null) {
            return undefined;
        }
        let value = valueText;
        if (this.rustPrintedBoolArg(value)) {
            value = `Value::Bool(${value})`;
        }
        const receiver = baseExpr.text;
        if (new RegExp(`\\b${receiver}\\b`).test(value)) {
            return `{ let __be_tmp = ${value}; ${receiver}.set_book_meta(${keyLiteral[1]}, __be_tmp); }`;
        }
        value = RustTranspiler.cloneIfBareLocal(value.trim(), value);
        return `${receiver}.set_book_meta(${keyLiteral[1]}, ${value})`;
    }

    // `let b = this.safeValue (this.orderbooks, k)`: the checker types it `any`, but it is an
    // order book; `set_book_meta` falls back to the helper on a non-book value.
    rustReadsOrderbooksStore(ident): boolean {
        const declaration: any = this.rustDeclarationOfIdentifier(ident);
        const init: any = declaration !== undefined && isVariableDeclaration(declaration) ? declaration.initializer : undefined;
        if (init === undefined || !isCallExpression(init) || !isPropertyAccessExpression(init.expression)) return false;
        if (init.expression.name.text !== 'safeValue' || init.arguments.length < 2) return false;
        const store: any = init.arguments[0];
        return isPropertyAccessExpression(store) && store.expression.kind === SyntaxKind.ThisKeyword
            && store.name.text === 'orderbooks';
    }

    printNativeDictInsert(baseExpr, keyNode, keyText, valueText): string | undefined {
        const receiver = this.rustNativeInsertReceiver(baseExpr);
        if (receiver === undefined || !this.rustReceiverStaysDict(baseExpr, receiver)) {
            return undefined;
        }
        // A bucket read off `cache.hashmap` / client `subscriptions`/`futures` carries a runtime
        // backref: only the helper writes through to the shared store, so keep it.
        if (!receiver.isField && this.rustLocalInitReadsTaggedContainer(baseExpr)) {
            return undefined;
        }
        const keyArg = this.rustNativeInsertKeyArg(receiver, keyNode, keyText);
        if (keyArg === undefined) {
            return undefined;
        }
        const name = receiver.text;
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText;
        const insert = (val: string) =>
            `if let Value::Dict(__d) = &mut ${name} { std::sync::Arc::make_mut(__d).insert(${keyArg}, ${val}); }`;
        // Any mention of the receiver in the value operand reads it while the
        // write holds the `&mut` — ccxt's splitAddElementBorrowConflicts pass
        // hoists on the same signal, so mirror it with a temp binding.
        const readsReceiver = receiver.isField ? /\bself\b/.test(value) : new RegExp(`\\b${name}\\b`).test(value);
        if (readsReceiver) {
            return `{ let __be_tmp = ${value}; ${insert('__be_tmp')} }`;
        }
        const trimmed = value.trim();
        if (RustTranspiler.isBareLocal(trimmed)) {
            return insert(`${trimmed}.clone()`);
        }
        return insert(value);
    }

    /** The `insert` key argument. A literal becomes `"k".into()`; a proven
     *  string place becomes `crate::runtime::stringify_param(&k)` — the exact
     *  conversion the helper's dict branch applies to a non-string key, and
     *  `k.to_string()` for a string one. */
    rustNativeInsertKeyArg(receiver, keyNode, keyText: string): string | undefined {
        if (isStringLiteral(keyNode)) {
            // A book-meta key can only reach the store through a `__book_id`:
            // provable only for receivers the transpiler itself built as plain
            // maps or the hand-written base never tags (fields).
            if (RustTranspiler.RUST_BOOK_META_KEYS.has(keyNode.text) && !receiver.plain) {
                return undefined;
            }
            const keyLiteral = keyText.match(/^Value::Str\((.+)\.(?:to_string|into)\(\)\)$/);
            return keyLiteral === null ? undefined : `${keyLiteral[1]}.into()`;
        }
        // Dynamic key: a plain place, never one that reads the receiver (the
        // insert holds its `&mut`). Every other key shape keeps the helper.
        const key = keyText.trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
            || (receiver.isField ? key.includes('self') : new RegExp(`\\b${receiver.text}\\b`).test(key))) {
            return undefined;
        }
        return `crate::runtime::stringify_param(&${key})`;
    }

    // `x[k1][k2] = v` on a `Dict` parameter: the `get_value_mut` hops go native (`get_mut`) and the outer write is a
    // native `insert`. A missing/non-dict hop is a no-op either way (JS would throw there); fields stay on their own
    // passes, since a `&self` method would clone the field and lose the write.
    nestedDictWrite(baseExpr, keyNodes: any[], keyTexts: string[], valueText: string, fallbackText: string): string | undefined {
        const receiver = this.rustNativeInsertReceiver(baseExpr);
        if (receiver === undefined || receiver.isField || !this.rustReceiverStaysDict(baseExpr, receiver)) {
            return undefined;
        }
        if (this.rustLocalInitReadsTaggedContainer(baseExpr) || keyTexts.length < 2) {
            return undefined;
        }
        // A `Dict`-annotated parameter only: locals are proven by construction in the native-insert text pass,
        // a param is exactly the receiver that pass cannot read, and the checker's annotation proof covers it.
        const declaration: any = this.rustSingleLocalDeclaration(baseExpr);
        if (declaration === undefined || !isParameterDeclaration(declaration)) {
            return undefined;
        }
        const name = receiver.text;
        const last = keyTexts.length - 1;
        const hops: string[] = [];
        for (let i = 0; i < last; i++) {
            const hop = this.entryKeyArg(receiver, keyNodes[i], keyTexts[i]);
            if (hop === undefined) {
                return undefined;
            }
            hops.push(hop);
        }
        const insertKey = this.rustNativeInsertKeyArg(receiver, keyNodes[last], keyTexts[last]);
        if (insertKey === undefined) {
            return undefined;
        }
        const keyArg = insertKey.endsWith('.into()') ? `${insertKey.slice(0, -'.into()'.length)}.to_string()` : insertKey;
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText;
        const readsReceiver = new RegExp(`\\b${name}\\b`).test(value);
        // Same shape the native-insert text pass emits, so a site both can prove stays byte-identical;
        // `__rd` letters are the tags its sibling passes read as a mutation statement.
        const guard = (val: string) => {
            let body = `std::sync::Arc::make_mut(__h${last}).insert(${keyArg}, ${val});`;
            for (let i = last - 1; i >= 0; i--) {
                body = `if let Some(Value::Dict(__h${i + 1})) =`
                    + ` std::sync::Arc::make_mut(__h${i}).get_mut(${hops[i]}) { ${body} }`;
            }
            return `if let Value::Dict(__h0) = &mut ${name} { ${body} }`;
        };
        // A hop costs ~70 chars: keep the helper when it is the difference
        // between a 400-char line and a longer one (36 = deepest indent + `;`).
        const fits = (out: string) => !(fallbackText.length + 36 <= 400 && out.length + 36 > 400);
        if (readsReceiver) {
            const out = `{ let __rdt = ${value}; ${guard('__rdt')} }`;
            return fits(out) ? out : undefined;
        }
        const trimmed = value.trim();
        const out = guard(RustTranspiler.cloneIfBareLocal(trimmed, value));
        return fits(out) ? out : undefined;
    }

    /** The `get_mut` key of a nested-dict hop: a borrowed `&str` — the literal itself,
     *  or the stringification the insert's key uses. */
    entryKeyArg(receiver, keyNode, keyText: string): string | undefined {
        if (isStringLiteral(keyNode)) {
            const keyLiteral = keyText.match(/^Value::Str\((.+)\.(?:to_string|into)\(\)\)$/);
            return keyLiteral === null ? undefined : keyLiteral[1];
        }
        const key = keyText.trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key === 'self' || !this.rustKeyIsProvenString(keyNode)
            || new RegExp(`\\b${receiver.text}\\b`).test(key)) {
            return undefined;
        }
        return this.rustStringLocalIdentifierIsTyped(keyNode)
            ? `${key}.as_str()` : `&crate::runtime::stringify_param(&${key})`;
    }

    // Receivers that may be written natively: any local whose every path builds a plain
    // `Value::Map` (name-independent), or a parameter the checker proves is a plain dict.
    rustNativeInsertReceiver(expr): { text: string, isField: boolean, plain: boolean, nameNode: any } | undefined {
        if (isIdentifier(expr)) {
            const plain = this.rustInsertIdentifierReceiver(expr);
            return plain === undefined ? undefined : { text: expr.text, isField: false, plain, nameNode: expr };
        }
        if (isPropertyAccessExpression(expr) && expr.expression.kind === SyntaxKind.ThisKeyword
            && expr.name?.kind === SyntaxKind.Identifier) {
            return {
                text: `self.${expr.name.text}`, isField: true,
                plain: RustTranspiler.RUST_PLAIN_DICT_FIELDS.has(expr.name.text),
                nameNode: expr.name,
            };
        }
        return undefined;
    }

    /** Element-write receiver proof for a local: a whitelisted name (`plain: false`), a dict-shape proof plus a
     *  plain-`Value::Map` build on every path, or a plain-dict-annotated parameter whose writes keep that shape.
     *  The flag is the by-construction plainness (literal-init locals, handler tuples, plain fields) a book-meta key needs. */
    rustInsertIdentifierReceiver(ident): boolean | undefined {
        const declaration = this.rustSingleLocalDeclaration(ident);
        if (declaration !== undefined && isParameterDeclaration(declaration as any)) {
            // A default value (`params: Dict = {}`) keeps the pre-unit
            // initializer proof — `rustReceiverStaysDict` runs both it and the
            // annotation proof and rejects the site when neither holds.
            if (this.rustParamStaysPlainDict(declaration as ParameterDeclaration)
                || (declaration as ParameterDeclaration).initializer !== undefined) {
                return false;
            }
        } else if (declaration !== undefined && isVariableDeclaration(declaration as any)) {
            if (this.rustInsertReceiverBuildsPlainDict(declaration as VariableDeclaration)) {
                return true;
            }
            // A local the declared-Dict table proves holds a Dict at every use
            // (alwaysDict && stable): the helper's non-dict branches are dead,
            // so only the tag hooks and the insert remain — the key rules of
            if (this.rustDeclaredLocalEntry(ident) !== undefined
                && this.rustDeclaredInitIsTagFree(declaration as VariableDeclaration)) {
                return false;
            }
        }
        if (RustTranspiler.RUST_NATIVE_INSERT_RECEIVERS.has(ident.text)) {
            return false; // whitelist only: not a construction proof
        }
        return undefined;
    }

    /** A literal initializer must carry no runtime tag key; a call initializer
     *  is the axiom the declared-Dict table itself rests on. */
    rustDeclaredInitIsTagFree(declaration: VariableDeclaration): boolean {
        const init = this.rustStripWrappers(declaration.initializer);
        return init === undefined || !isObjectLiteralExpression(init) || this.rustPlainDictLiteral(init);
    }

    /** Skip `( … )`, `x!` and `x as T` wrappers. */
    rustStripWrappers(node: any): any {
        while (node !== undefined && (isParenthesizedExpression(node) || isNonNullExpression(node) || isAsExpression(node))) {
            node = node.expression;
        }
        return node;
    }

    /** The local's single declaration is initialised from a call that reads
     *  `x.hashmap` / `x.subscriptions` / `x.futures` — element dicts the runtime
     *  tags with a backref so writes reach the shared store, not the COW copy. */
    rustLocalInitReadsTaggedContainer(ident: Identifier): boolean {
        const declaration = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || !isVariableDeclaration(declaration)) {
            return false;
        }
        const init = this.rustStripWrappers(declaration.initializer);
        return init !== undefined && isCallExpression(init) && init.arguments.some((arg) => {
            const n = this.rustStripWrappers(arg);
            return n !== undefined && isPropertyAccessExpression(n)
                && RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(n.name.text);
        });
    }

    static readonly RUST_TAGGED_CONTAINER_FIELDS = new Set([ 'hashmap', 'subscriptions', 'futures' ]);

    /** True when every value the local can hold comes from an object literal:
     *  the runtime tags a dict (`__book_id`, `__ws_subs_url`, `__ws_sub_ref`,
     *  `__cache_backref`) only on handles its own store builds, so the helper's
     *  write-through branches are provably dead and `insert` is the whole
     *  helper. A `[ x, params ] = this.handle…(…)` tuple re-assigns the
     *  hand-written handler's own dict arguments. */
    rustInsertReceiverBuildsPlainDict(declaration: VariableDeclaration): boolean {
        const name = String((declaration.name as Identifier).text);
        const scope = this.rustEnclosingFunction(declaration);
        if (!this.rustPlainDictLiteral(declaration.initializer) || scope === undefined) {
            return false;
        }
        const declarationSymbol = this.rustSymbolOf(declaration.name as Identifier);
        let plain = true;
        this.rustWalkScope(scope, (n) => {
            if (!plain || !isBinaryExpression(n) || n.operatorToken.kind !== SyntaxKind.EqualsToken) {
                return;
            }
            const left: any = n.left;
            if (isIdentifier(left) && String(left.text) === name
                && (declarationSymbol === undefined || this.rustSymbolOf(left) === declarationSymbol)) {
                plain = this.rustPlainDictLiteral(n.right) || this.rustTypeIsUndefinedish(n.right);
            } else if (isArrayLiteralExpression(left)
                && left.elements.some((e) => isIdentifier(e) && String(e.text) === name)) {
                plain = this.rustHandlerTupleCall(n.right);
            }
        });
        return plain;
    }

    /** An object literal with no runtime tag key — the transpiler built it, so
     *  it is a fresh plain `Value::Map` on every path. */
    rustPlainDictLiteral(node: Node | undefined): boolean {
        if (node !== undefined && isParenthesizedExpression(node)) {
            return this.rustPlainDictLiteral(node.expression);
        }
        return node !== undefined && isObjectLiteralExpression(node) && node.properties.every((property: any) => {
            const key = property.name;
            if (key === undefined) {
                return false;
            }
            const text = isStringLiteral(key) ? key.text
                : (isIdentifier(key) ? String(key.text) : undefined);
            return text === undefined || !text.startsWith('__');
        });
    }

    /** `this.handle…(…)` — the hand-written `handle*AndParams` / `handleUntil…`
     *  family; each returns its own request/params dict arguments. */
    rustHandlerTupleCall(node: Node | undefined): boolean {
        const callee: any = node !== undefined && isCallExpression(node) ? node.expression : undefined;
        return callee !== undefined && isPropertyAccessExpression(callee) && callee.expression.kind === SyntaxKind.ThisKeyword
            && callee.name?.kind === SyntaxKind.Identifier && /^handle[A-Z]/.test(callee.name.text);
    }

    /** A `null`/`undefined` write leaves the receiver a non-dict, which the
     *  emitted `if let Value::Dict` no-ops exactly like the helper. */
    private rustTypeIsUndefinedish(node: Node): boolean {
        if (node.kind === SyntaxKind.NullKeyword || (isIdentifier(node) && node.text === 'undefined')) {
            return true;
        }
        const type = this.typeOfNodeIfAny(node);
        return type !== undefined && (type.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void)) !== 0;
    }

    /** The single variable declaration a local identifier binds to, or
     *  undefined when the checker cannot answer / the binding is not a local. */
    rustSingleLocalDeclaration(ident: Identifier): VariableDeclaration | ParameterDeclaration | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const declarations = symbolDeclarations(checker.getSymbolAtLocation(ident));
        const declaration: any = declarations.length === 1 ? declarations[0] : undefined;
        return declaration !== undefined && (isVariableDeclaration(declaration) || isParameterDeclaration(declaration))
            ? declaration : undefined;
    }

    // Dict-shape proof for a write receiver: an object type with no class, array or callable shape
    // — `Dictionary<T>` instantiations count (they resolve to their interface target). A union keeps
    // the proof when every member is a Dict or `undefined` (both untaggable at runtime).
    rustWriteDictShape(type): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            const parts: any[] = typeParts(type) ?? [];
            return parts.length > 0 && parts.every((part) => this.rustWriteDictShape(part));
        }
        if (type.flags & (TypeFlags.Undefined | TypeFlags.Void)) {
            return true;
        }
        const checker = this.getChecker();
        if (!(type.flags & TypeFlags.Object)
            || checker.isArrayType(type) || checker.isTupleType(type) || checker.isArrayLikeType(type)
            || ((typeTarget(type) ?? type as any).objectFlags & ObjectFlags.Class)) {
            return false;
        }
        return type.getCallSignatures().length === 0 && type.getConstructSignatures().length === 0;
    }

    // The receiver is a plain Dict on every path: its declared/initializer type is object-shaped
    // (never a class or array handle), its initializer is not an element read (the get_value COW
    // write-back pass keys on the `&mut <name>` text), and no write in scope assigns another shape.
    rustReceiverStaysDict(baseExpr, receiver): boolean {
        if (receiver.isField) {
            return this.rustFieldStaysDict(baseExpr, receiver.nameNode.text);
        }
        const ident = baseExpr;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined) {
            return false;
        }
        // The declared-Dict table is its own proof (alwaysDict && stable, D2):
        // a table local the checker cannot type (an untyped `safe_dict*`
        // default) still stays a Dict at every use.
        if (this.rustDeclaredLocalEntry(ident) !== undefined) {
            return true;
        }
        // A parameter with a default carries the transpiler's own initializer,
        // so it keeps the pre-unit proof; without one only the annotation proof
        // (`Dict`-style params, read natively) can admit it.
        if (isParameterDeclaration(declaration) && this.rustParamStaysPlainDict(declaration)) {
            return true;
        }
        const name = ident.text;
        const initializer = declaration.initializer;
        const scope = this.rustEnclosingFunction(declaration);
        if (initializer === undefined || isElementAccessExpression(initializer)
            || declaration.name?.kind !== SyntaxKind.Identifier || scope === undefined) {
            return false;
        }
        let safe = this.rustWriteDictShape(this.typeOfNodeIfAny(ident))
            && this.rustWriteDictShape(this.typeOfNodeIfAny(initializer));
        this.rustWalkScope(scope, (n) => {
            if (n !== declaration && this.rustBindsName(n, name)) {
                safe = false; // a second binding of the name in scope — stay boxed
                return RUST_WALK_STOP;
            }
            if (isBinaryExpression(n) && n.operatorToken.kind === SyntaxKind.EqualsToken
                && isIdentifier(n.left) && n.left.text === name
                && !this.rustWriteDictShape(this.typeOfNodeIfAny(n.right))) {
                safe = false;
                return RUST_WALK_STOP;
            }
        });
        return safe;
    }

    // `this.<field>` receivers: the field is a plain dict (object-shaped checker type, or held as one
    // by the hand-written base when the TS declaration is `any`) and no `this.<field> = …` in the
    // method assigns another shape. Handle fields (cache/client/subscriptions/order book) are excluded.
    rustFieldStaysDict(baseExpr, fieldName: string): boolean {
        if (RustTranspiler.RUST_TAGGED_HANDLE_FIELDS.has(fieldName)
            || (!this.rustWriteDictShape(this.typeOfNodeIfAny(baseExpr))
                && !RustTranspiler.RUST_PLAIN_DICT_FIELDS.has(fieldName))) {
            return false;
        }
        const scope = this.rustEnclosingFunction(baseExpr);
        if (scope === undefined) {
            return false;
        }
        let safe = true;
        this.rustWalkScope(scope, (n) => {
            if (isBinaryExpression(n) && n.operatorToken.kind === SyntaxKind.EqualsToken
                && isPropertyAccessExpression(n.left) && n.left.expression.kind === SyntaxKind.ThisKeyword
                && n.left.name?.text === fieldName
                && !this.rustWriteDictShape(this.typeOfNodeIfAny(n.right))) {
                safe = false;
                return RUST_WALK_STOP;
            }
        });
        return safe;
    }

    // A parameter the checker proves is a plain dict (`Dict`, `Dictionary<T>`,
    // a `Market`-style alias — the proof the native reads use) whose every
    // write in the body keeps that shape: an object literal with no runtime tag
    rustParamStaysPlainDict(declaration: ParameterDeclaration): boolean {
        if (declaration.type === undefined || declaration.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const type = this.getCheckedTypeOf(declaration.type);
        const scope = this.rustEnclosingFunction(declaration);
        if (type === undefined || !this.isProvenMapType(type) || scope === undefined) {
            return false;
        }
        const name = String((declaration.name as Identifier).text);
        let plain = true;
        this.rustWalkScope(scope, (n) => {
            if (isBinaryExpression(n) && rustIsAssignmentOperator(n.operatorToken.kind)
                && isIdentifier(n.left) && n.left.text === name
                && !this.rustPlainDictPreservingRhs(n.right, name)) {
                plain = false;
                return RUST_WALK_STOP;
            }
            if (isBinaryExpression(n) && n.operatorToken.kind === SyntaxKind.EqualsToken
                && isArrayLiteralExpression(n.left)
                && n.left.elements.some((e) => isIdentifier(e) && String((e as Identifier).text) === name)
                && !this.rustHandlerTupleCall(n.right)) {
                plain = false; // a tuple write keeps only the handle-arg family
                return RUST_WALK_STOP;
            }
        });
        return plain;
    }

    /** RHS of a write to a plain-dict parameter that keeps the shape. */
    rustPlainDictPreservingRhs(node: Node, name: string): boolean {
        // `this.handle…(…)` returns its own dict arguments (request-builder proof).
        if (this.rustPlainDictLiteral(node) || this.rustTypeIsUndefinedish(node)
            || (isIdentifier(node) && node.text === name) || this.rustHandlerTupleCall(node)) {
            return true;
        }
        if (isParenthesizedExpression(node) || isNonNullExpression(node) || isAsExpression(node)) {
            return this.rustPlainDictPreservingRhs(node.expression, name);
        }
        if (isConditionalExpression(node)) {
            return this.rustPlainDictPreservingRhs(node.whenTrue, name)
                && this.rustPlainDictPreservingRhs(node.whenFalse, name);
        }
        if (isBinaryExpression(node)
            && (node.operatorToken.kind === SyntaxKind.BarBarToken
                || node.operatorToken.kind === SyntaxKind.QuestionQuestionToken)) {
            return this.rustPlainDictPreservingRhs(node.left, name)
                && this.rustPlainDictPreservingRhs(node.right, name);
        }
        return false;
    }

    // Conservative "argument position expects a Value" bool test — the same set
    // ccxt's wrapBoolValueArgs pass uses on the helper call's value operand.
    rustPrintedBoolArg(raw: string): boolean {
        let s = raw.trim();
        while (s.startsWith('(') && s.endsWith(')')) {
            let depth = 0;
            let balanced = true;
            for (let k = 0; k < s.length; k++) {
                if (s[k] === '(') depth++;
                else if (s[k] === ')') { depth--; if (depth === 0 && k < s.length - 1) { balanced = false; break; } }
            }
            if (!balanced || depth !== 0) break;
            s = s.slice(1, -1).trim();
        }
        if (s.startsWith('!')) s = s.slice(1).trim();
        return RustTranspiler.RUST_BOOL_VALUE_HELPERS.some(fn => s.startsWith(fn + '('));
    }

    // `negate(&Value::Int(n))` is `Value::Int(-n)` (same for Float) — fold the
    // literal so no helper call is needed. Runtime `negate` also coerces
    // strings/bools/floats, so only Int/Float literals can be folded.
    foldNegateLiteral(operandText: string): string | undefined {
        const match = operandText.match(/^Value::(Int|Float)\((-?)(\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\)$/);
        // leave big literals to the runtime helper
        if (!match || match[3].replaceAll('_', '').replace('.', '').length > 18) {
            return undefined;
        }
        const sign = match[2] === '-' ? '' : '-';
        return `Value::${match[1]}(${sign}${match[3]})`;
    }

    // Ensure a & ref prefix — skip only if already a reference
    ensureRef(expr: string): string {
        return expr.startsWith('&') ? expr : `&${expr}`;
    }

    // TS `number` / number-literal type proof for a comparison operand. Unions
    // (`number | undefined`) and `any` are rejected — those keep the helper.
    isNumberTyped(node) {
        const type = this.getChecker().getTypeAtLocation(node);
        return type !== undefined && (type.flags & (TypeFlags.Number | TypeFlags.NumberLiteral)) !== 0;
    }

    // Positions whose emitted Rust is a native `bool`: if/while/do/for
    // conditions, `? :` conditions, `!` operands and `&&` / `||` operands.
    // Parentheses are transparent.
    isBooleanPosition(node) {
        let current = node;
        let parent = current.parent;
        while (parent !== undefined && isParenthesizedExpression(parent)) {
            current = parent;
            parent = parent.parent;
        }
        if (parent === undefined) {
            return false;
        }
        switch (parent.kind) {
        case SyntaxKind.IfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.DoStatement:
            return parent.expression === current;
        case SyntaxKind.ForStatement:
        case SyntaxKind.ConditionalExpression:
            return parent.condition === current;
        case SyntaxKind.PrefixUnaryExpression:
            return parent.operator === SyntaxKind.ExclamationToken;
        case SyntaxKind.BinaryExpression:
            return parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken ||
                parent.operatorToken.kind === SyntaxKind.BarBarToken;
        }
        return false;
    }

    // `is_less_than` & co. compare two `Value`s and answer `false` for
    // non-numbers; with both operands checker-typed numbers the same f64
    // comparison runs natively on `Value::as_f64()` unwraps.
    printNativeNumericComparison(node, operator, leftText, rightText) {
        const unwrap = (text: string) => `${text}.as_f64().unwrap_or(f64::NAN)`;
        const comparison = `${unwrap(leftText)} ${operator} ${unwrap(rightText)}`;
        // Conditions/logical operands already expect a bool; every other
        // position stores the result in a `Value`, so box it as before.
        return this.isBooleanPosition(node) ? comparison : `Value::Bool(${comparison})`;
    }

    // How numeric an ordered-comparison operand is: 'definite' (numeric
    // literal / `.length` / `indexOf` — Int/Float at runtime, never Null),
    // 'number' (checker-typed — Int, Float or Null, never a string), undefined.
    rustNumericOperandKind(node): string | undefined {
        const inner = this.orderedComparisonOperand(node);
        // `.length` prints through printArrayLength (`Value::Int(len)` or `get_array_length`),
        // `.indexOf(x)` through printIndexOfCall (`get_index_of`): always `Value::Int`.
        if (inner.kind === SyntaxKind.NumericLiteral
            || (isPropertyAccessExpression(inner) && inner.name.text === 'length')
            || (inner.kind === SyntaxKind.CallExpression && this.callExpressionName(inner) === 'indexOf')) {
            return 'definite';
        }
        return this.isNumberTyped(node) ? 'number' : undefined;
    }

    // Parens and `x as T` print as the operand itself (printAsExpression drops
    // the assertion), so the operand's own shape drives the emission.
    orderedComparisonOperand(node) {
        let inner = node;
        while (inner !== undefined && (isParenthesizedExpression(inner) || isAsExpression(inner))) {
            inner = inner.expression;
        }
        return inner;
    }

    // Native text for an `is_less_than`-family call, undefined unless the
    // operands prove the helper's answer: one number pins `<`/`>`; `>=`/`<=`
    // OR `is_equal` in (TRUE for two Nulls) and need a 'definite' operand.
    printNativeOrderedComparison(node, op, left, right): string | undefined {
        const operator = RustTranspiler.NATIVE_COMPARISON_OPERATORS[op];
        if (operator === undefined || !this.printsValueExpression(this.orderedComparisonOperand(left)) ||
            !this.printsValueExpression(this.orderedComparisonOperand(right))) {
            return undefined;
        }
        const leftKind = this.rustNumericOperandKind(left);
        const rightKind = this.rustNumericOperandKind(right);
        const ordered = op === SyntaxKind.LessThanToken || op === SyntaxKind.GreaterThanToken;
        const proven = leftKind === 'definite' || rightKind === 'definite' ||
            (ordered
                ? (leftKind !== undefined || rightKind !== undefined)
                : (leftKind === 'number' && rightKind === 'number'));
        if (!proven && !this.rustOrderedProven(op, left, right)) {
            return this.strOrderedComparison(node, op, left, right) ?? this.nativeLooseOrderedComparison(node, op, left, right);
        }
        return this.printNativeIndexOfLiteralTest(node, op, left, right)
            ?? this.printNativeNumericComparison(node, operator, this.printNode(left, 0), this.printNode(right, 0));
    }

    // `s.indexOf("lit") >= 0` / `> -1` / `< 0` on a proven string place and a non-empty literal needle is a `contains`
    // test: a non-Str receiver gives `""`, which contains no non-empty literal, like the `None` -> -1 arm.
    printNativeIndexOfLiteralTest(node, op, left, right): string | undefined {
        const test = this.nativeIndexOfLiteralTestText(op, left, right);
        if (test === undefined) return undefined;
        return this.isBooleanPosition(node) ? test : `Value::Bool(${test})`;
    }

    nativeIndexOfLiteralTestText(op, left, right): string | undefined {
        const call: any = this.orderedComparisonOperand(left);
        if (call === undefined || !isCallExpression(call) || !isPropertyAccessExpression(call.expression) ||
            call.expression.name.text !== 'indexOf' || call.arguments?.length !== 1) {
            return undefined;
        }
        const bound = this.rustSliceLiteralBound(this.orderedComparisonOperand(right));
        const yes = (op === SyntaxKind.GreaterThanEqualsToken && bound === 0) || (op === SyntaxKind.GreaterThanToken && bound === -1);
        const no = op === SyntaxKind.LessThanToken && bound === 0;
        if (!yes && !no) return undefined;
        const needle = call.arguments[0];
        if ((!isStringLiteral(needle) && !isNoSubstitutionTemplateLiteral(needle)) || needle.text === '') return undefined;
        const literal = this.rustNativeStringLiteralArg(needle);
        const receiver = literal === undefined ? undefined : this.rustNativeStringReceiver(call, this.printNode(call.expression.expression, 0));
        if (literal === undefined || receiver === undefined || !RUST_PLAIN_PLACE.test(receiver)) return undefined;
        return `${no ? '!' : ''}${receiver}.as_str().unwrap_or("").contains("${literal}")`;
    }

    // ── native arithmetic (`+ - * /`) ────────────────────────────────────────
    // When the checker proves both operands are numbers (`Int`/`Float` at
    // runtime) or that one is always a string and the other a string or the
    // null the helper stringifies the same way, the helper call is replaced by
    // the arithmetic itself: a 4-arm `Value` match reproducing the helper's
    // Int/Float dispatch, `as_f64()` division, or a `format!` string concat.
    // Anything the checker cannot prove keeps the runtime helper.

    // `type` (or every member of a non-empty union) has exactly one of `flags`.
    rustTypeFlagsAll(type: any, flags: Set<number>): boolean {
        if (!type) {
            return false;
        }
        if (type.flags === TypeFlags.Union && Array.isArray(typeParts(type))) {
            return typeParts(type).length > 0 && typeParts(type).every((member: any) => this.rustTypeFlagsAll(member, flags));
        }
        return flags.has(type.flags);
    }

    isNumberLikeType(type: any): boolean {
        return this.rustTypeFlagsAll(type, new Set([ TypeFlags.Number, TypeFlags.NumberLiteral ]));
    }

    isStringLikeType(type: any): boolean {
        return this.rustTypeFlagsAll(type, new Set([ TypeFlags.String, TypeFlags.StringLiteral ]));
    }

    // Types whose runtime value the `add` helper stringifies exactly as `format!` does: a string,
    // or `undefined`/`null` boxed as `Value::Null` (`stringify_simple(Value::Null)` and `Display`
    // both give "null"). `any` is absent — the Precise-dict branch has no `Display` equivalent.
    private static readonly RUST_CONCAT_SAFE_FLAGS = new Set<number>([
        TypeFlags.String,
        TypeFlags.StringLiteral,
        TypeFlags.Undefined,
        TypeFlags.Null,
    ]);

    isStringOrNullishType(type: any): boolean {
        return this.rustTypeFlagsAll(type, RustTranspiler.RUST_CONCAT_SAFE_FLAGS);
    }

    // `Str` (`string | undefined`) operands concatenate natively only against an operand proven
    // ALWAYS a string: the helper then takes its string branch, which `format!` reproduces.
    // Without that anchor (`Str + Str`) the both-null case yields `Value::Null`, not "nullnull".
    isNativeStringConcatPair(leftType: any, rightType: any): boolean {
        return this.isStringOrNullishType(leftType) && this.isStringOrNullishType(rightType)
            && (this.isStringLikeType(leftType) || this.isStringLikeType(rightType));
    }

    // `(+|-)` with the left operand of `+=`/`-=`: assignment plus the same
    // native emission as the plain binary form.
    printNativeAssignmentArithmetic(op, left, right, leftText, rightText): string | undefined {
        const native = this.printNativeArithmetic(op, left, right, leftText, rightText);
        return native === undefined ? undefined : `${leftText} = ${native}`;
    }

    printNativeArithmetic(op, left, right, leftText, rightText): string | undefined {
        if (op === SyntaxKind.PercentToken) return this.printRustNativeMod(left, right, leftText, rightText) ?? this.rustNativeArithmetic(op, left, right, leftText, rightText);
        if (op !== SyntaxKind.PlusToken && op !== SyntaxKind.MinusToken &&
            op !== SyntaxKind.AsteriskToken && op !== SyntaxKind.SlashToken) {
            return undefined;
        }
        let leftType, rightType;
        try {
            const checker = this.getChecker();
            leftType = checker.getTypeAtLocation(left);
            rightType = checker.getTypeAtLocation(right);
        } catch (e) {
            return undefined;
        }
        const nativeIntResult = this.rustNativeAddSubtract(op, left, right, leftType, rightType, leftText, rightText); if (nativeIntResult !== undefined) return nativeIntResult;
        const r16 = this.rustNativeArithmetic(op, left, right, leftText, rightText); if (r16 !== undefined) return r16;
        const r20 = this.nativeNumericAdd(op, left, right, leftText, rightText); if (r20 !== undefined) return r20;
        if (op === SyntaxKind.PlusToken && (this.isNativeStringConcatPair(leftType, rightType) || this.concatIsAnchored(left, right, leftType, rightType)
            || this.strOrNullConcatIsAnchored(left, right, leftType, rightType))) {
            return this.printNativeStringConcat(leftText, rightText);
        }
        if (!this.isNumberLikeType(leftType) || !this.isNumberLikeType(rightType)) {
            return this.nativeCoercingArithmetic(op, left, right, leftText, rightText);
        }
        return this.printNativeNumeric(op, leftText, rightText);
    }

    printNativeStringConcat(leftText: string, rightText: string): string {
        return `Value::Str(format!("{}{}", ${leftText}, ${rightText}).into())`;
    }

    // Both operands are `Int`/`Float` at runtime; `-> Value::Null` covers the
    // `Null`/non-numeric values the same way the helper's fallthrough does.
    // Always parenthesised so it composes under `&`, in argument position and
    // as an operand of another native match.
    printNativeNumeric(op, leftText: string, rightText: string): string {
        const [ left, right ] = [ `(${leftText})`, `(${rightText})` ];
        if (op === SyntaxKind.SlashToken) {
            return `(match (${left}.as_f64(), ${right}.as_f64()) { (Some(x), Some(y)) if y != 0.0 => Value::Float(x / y), _ => Value::Null })`;
        }
        const sign = op === SyntaxKind.PlusToken ? '+' : (op === SyntaxKind.MinusToken ? '-' : '*');
        return `(match (&${left}, &${right}) {` +
            ` (Value::Int(x), Value::Int(y)) => Value::Int(x ${sign} y),` +
            ` (Value::Int(x), Value::Float(y)) => Value::Float(*x as f64 ${sign} *y),` +
            ` (Value::Float(x), Value::Int(y)) => Value::Float(*x ${sign} *y as f64),` +
            ` (Value::Float(x), Value::Float(y)) => Value::Float(x ${sign} y),` +
            ` _ => Value::Null })`;
    }

    private static readonly RUST_TYPEOF_HELPERS = new Map([
        ['string', 'is_string'], ['number', 'is_number'], ['boolean', 'is_bool'], ['object', 'is_object'], ['function', 'is_function'],
    ]);

    printCustomBinaryExpressionIfAny(node, identation) {
        const { left, right } = node;
        const op = node.operatorToken.kind;
        const isAssign = op === SyntaxKind.EqualsToken;
        // Array destructuring reassignment: [a, b] = expr → bind once, reassign each
        if (isAssign && left.kind === SyntaxKind.ArrayLiteralExpression) {
            const tmpName = '__destr_tmp';
            const rhs = this.printNode(right, 0);
            const nativeList = this.rustNativeListSource(right);
            const head = nativeList
                ? `let ${tmpName}: Vec<Value> = ${rhs}.as_array().cloned().unwrap_or_default()`
                : `let ${tmpName} = ${rhs}`;
            const assignments = left.elements.map((e, idx) => `${this.printNode(e, 0)} = ${nativeList
                ? this.printTypedVecElementRead(tmpName, idx) : `get_value(&${tmpName}, &Value::Int(${idx}))`}`).join('; ');
            return `{ ${head}; ${assignments}; }`;
        }
        // Element access assignment: a[b] = v → add_element_to_object(&mut a, &b, v)
        if (isAssign && left.kind === SyntaxKind.ElementAccessExpression) {
            const keys: any[] = [];
            let baseExpr: any = left;
            while (isElementAccessExpression(baseExpr)) {
                keys.unshift(baseExpr.argumentExpression);
                baseExpr = baseExpr.expression;
            }
            let acc = `&mut ${this.printNode(baseExpr, 0)}`;
            const keyStrs = keys.map(k => this.printNode(k, 0));
            for (const key of keyStrs.slice(0, -1)) acc = `get_value_mut(${acc}, &${key})`;
            const rhs = this.printNode(right, 0);
            const helperCall = `add_element_to_object(${acc}, &${keyStrs[keyStrs.length - 1]}, ${rhs})`;
            // a nested helper write whose value was read natively binds the value first, like the ccxt hoist did
            const helperWrite = this.rustDictHoistHosts.has(node)
                ? `{ let __be_tmp = ${rhs}; add_element_to_object(${acc}, &${keyStrs[keyStrs.length - 1]}, __be_tmp); }` : helperCall;
            const nestedInsert = keyStrs.length === 2
                ? (this.rustNestedBearerInsert(baseExpr, keys[0], keyStrs[0], keys[1], keyStrs[1], rhs)
                    ?? this.nestedDictWrite(baseExpr, keys, keyStrs, rhs, helperWrite))
                : (this.nestedDictWrite(baseExpr, keys, keyStrs, rhs, helperWrite)
                    ?? this.rustNestedBearerBucket(baseExpr, keys[0], keyStrs[0], right));
            if (nestedInsert !== undefined) return nestedInsert;
            const fieldNested = this.rustFieldNestedInsert(node, baseExpr, keys, keyStrs, rhs);
            if (fieldNested !== undefined) return fieldNested;
            // `x[k1][k2] = v` on a one-level bearer — the first hop is the
            // map's own `entry`, the write below it keeps its helper.
            const bearerChain = keyStrs.length > 1
                ? this.rustBearerChainedWrite(baseExpr, keys, keyStrs, rhs) : undefined;
            if (bearerChain !== undefined) return bearerChain;
            const nativeInsert = keyStrs.length === 1 ? (this.rustBearerDictInsert(baseExpr, keys[0], keyStrs[0], rhs) ?? this.rustMapParamDictInsert(baseExpr, keys[0], keyStrs[0], rhs) ?? this.printNativeBookMetaWrite(baseExpr, keys[0], keyStrs[0], rhs) ?? this.printNativeDictInsert(baseExpr, keys[0], keyStrs[0], rhs) ?? this.rustNativeDictInsert(baseExpr, keys[0], keyStrs[0], rhs)) : undefined;
            return nativeInsert ?? helperWrite;
        }
        // Rebuilding a typed dict bearer from a plain literal (`x = { .. }`)
        if (isAssign && isIdentifier(left) && this.rustDictBearerDeclaration(left) !== undefined
            && this.rustBearerPlainLiteral(right)) {
            return `${this.printNode(left, 0)} = (${this.rustObjectLiteralBlock(this.rustSkipWrappers(right), identation)})`;
        }
        // A bearer rebuilt from a fresh-map producer (`x = this.extend(..)`)
        if (isAssign && isIdentifier(left) && this.rustDictBearerDeclaration(left) !== undefined
            && this.rustDictProducer(right)) {
            return `${this.printNode(left, 0)} = ${this.printNode(right, 0)}.as_map().cloned().unwrap_or_default()`;
        }
        // typeof comparisons
        if (left.kind === SyntaxKind.TypeOfExpression) {
            const rightText = right.text;
            const target = this.printNode(left.expression, 0);
            const isDiff = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
            const native = this.nativeValuePredicateText(rightText, left.expression, target);
            if (native !== undefined) {
                const negated = isDiff ? `!${native}` : native;
                // Conditions/logical operands expect a bool; other positions store a boxed `Value`.
                return this.isBooleanPosition(node) ? negated : `Value::Bool(${negated})`;
            }
            const helper = RustTranspiler.RUST_TYPEOF_HELPERS.get(rightText);
            if (helper !== undefined) return `${isDiff ? '!' : ''}${helper}(&${target})`;
        }
        // `in` — wrapped as Value so it composes in any context
        if (op === SyntaxKind.InKeyword) {
            const shadow = this.rustParamShadowOf(right);
            return (shadow !== undefined ? this.printShadowInOperator(shadow, left) : undefined)
                ?? this.bearerInOp(left, right) ?? this.printNativeInOperator(left, right)
                ?? this.literalInOp(left, right) ?? this.provenDictFieldInOp(left, right) ?? this.rustDictInOp(left, right)
                ?? `Value::Bool(in_op(&${this.printNode(right, 0)}, &${this.printNode(left, 0)}))`;
        }
        // `+=` / `-=` on regular variables
        if ((op === SyntaxKind.PlusEqualsToken || op === SyntaxKind.MinusEqualsToken) && left.kind !== SyntaxKind.ElementAccessExpression) {
            const isPlus = op === SyntaxKind.PlusEqualsToken;
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);
            return this.printNativeAssignmentArithmetic(isPlus ? SyntaxKind.PlusToken : SyntaxKind.MinusToken, left, right, leftText, rightText)
                ?? `${leftText} = ${isPlus ? 'add' : 'subtract'}(&${leftText}, &${rightText})`;
        }
        // Native equality on unwrapped payloads when the checker proves the variants line up
        // (see printNativeEqualityComparison); the bool is boxed like the other Value helpers.
        if (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken ||
            op === SyntaxKind.ExclamationEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken) {
            const nativeEquality = this.printNativeEqualityComparison(left, right, op);
            if (nativeEquality) return `Value::Bool(${nativeEquality})`;
        }
        // A logical expression with a native-compare operand no longer starts with a bool helper: box it.
        if ((op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken)
            && (this.hasNativeComparisonOperand(left) || this.hasNativeComparisonOperand(right))) {
            return `Value::Bool(${this.printLogicalInBooleanContext(node)})`;
        }
        // Binary wrapper functions (is_equal, add, etc.) - add & to both sides
        if (op in this.binaryExpressionsWrappers) {
            const nativeCompare = RustTranspiler.NATIVE_COMPARISON_OPERATORS[op] !== undefined
                ? this.printNativeOrderedComparison(node, op, left, right) : undefined;
            if (nativeCompare !== undefined) return nativeCompare;
            const [fnName, close] = this.binaryExpressionsWrappers[op];
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);
            return this.printNativeArithmetic(op, left, right, leftText, rightText)
                ?? `${fnName}${this.ensureRef(leftText)}, ${this.ensureRef(rightText)}${close}`;
        }
        return undefined;
    }

    printBinaryExpression(node, identation) {
        return this.printCustomBinaryExpressionIfAny(node, identation) || super.printBinaryExpression(node, identation);
    }

    // `Date.now()` → runtime helper returning current epoch millis.
    printDateNowCall(node, identation) {
        return 'date_now()';
    }

    // `str.padStart(len, pad)` / `str.padEnd(len, pad)` → runtime helpers `(&Value, &Value, &Value)`.
    printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
        return this.printNativeStringPadStart(node, name) ?? `pad_start(${this.ensureRef(name)}, ${this.ensureRef(parsedArg)}, ${this.ensureRef(parsedArg2)})`;
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return this.printNativeStringPadEnd(node, name) ?? `pad_end(${this.ensureRef(name)}, ${this.ensureRef(parsedArg)}, ${this.ensureRef(parsedArg2)})`;
    }

    printVariableDeclarationList(node, identation) {
        const declaration = node.declarations[0];
        const indent = this.getIden(identation);
        if (declaration?.name.kind === SyntaxKind.ArrayBindingPattern) {
            const parsedElements = declaration.name.elements.map(e => this.printNode(e.name, 0));
            const syntheticName = parsedElements.join('') + 'Variable';
            const nativeList = this.rustNativeListSource(declaration.initializer);
            const head = nativeList
                ? `${indent}let ${syntheticName}: Vec<Value> = ${this.printNode(declaration.initializer, 0)}.as_array().cloned().unwrap_or_default();\n`
                : `${indent}let mut ${syntheticName} = ${this.printNode(declaration.initializer, 0)};\n`;
            const lines = parsedElements.map((e, idx) => `${indent}let mut ${e}: Value = ${nativeList
                ? this.printTypedVecElementRead(syntheticName, idx) : `get_value(&${syntheticName}, &Value::Int(${idx}))`}`);
            return head + lines.join(';\n');
        }
        const varName = this.printNode(declaration.name, 0);
        if (!declaration.initializer) {
            return `${indent}let mut ${varName}: Value = Value::Null`;
        }
        const parsedValue = this.printNode(declaration.initializer, identation).trim();
        if (declaration.initializer.kind === SyntaxKind.NewExpression) {
            return `${indent}let mut ${varName} = ${parsedValue}`;
        }
        // A read-only container bearer carries the container itself.
        const readBearer = node.declarations.length === 1 ? this.rustReadBearerKindOfDeclaration(declaration) : false;
        if (readBearer === 'list') {
            return `${indent}let mut ${varName}: Vec<Value> = ${parsedValue}.as_array().cloned().unwrap_or_default()`;
        }
        if (readBearer === 'map') {
            return `${indent}let mut ${varName}: indexmap::IndexMap<String, Value> = ${parsedValue}.as_map().cloned().unwrap_or_default()`;
        }
        if (node.declarations.length === 1 && this.rustVecLocalIsTyped(declaration)) {
            const native = this.rustVecNativeLiteral(declaration);
            return `${indent}let mut ${varName}: Vec<Value> = ${native ?? 'Vec::new()'}`;
        }
        if (node.declarations.length === 1 && this.rustNestedDictLocalIsTyped(declaration)) {
            const block = this.rustNestedObjectLiteralBlock(this.rustSkipWrappers(declaration.initializer), identation);
            return `${indent}let mut ${varName}: indexmap::IndexMap<String, indexmap::IndexMap<String, Value>> = (${block})`;
        }
        if (node.declarations.length === 1 && this.rustDictLocalIsTyped(declaration)) {
            const literal = this.rustSkipWrappers(declaration.initializer);
            if (!isObjectLiteralExpression(literal)) {
                return `${indent}let mut ${varName}: indexmap::IndexMap<String, Value> = ${parsedValue}.as_map().cloned().unwrap_or_default()`;
            }
            // Parenthesised: the driver strips the `;` of a statement ending in `};`.
            const block = this.rustObjectLiteralBlock(this.rustSkipWrappers(declaration.initializer), identation);
            return `${indent}let mut ${varName}: indexmap::IndexMap<String, Value> = (${block})`;
        }
        const boolValue = this.getRustBoolLocalInitializer(declaration, parsedValue);
        if (boolValue !== undefined) {
            this.rustBoolDeclaredLocals.add(declaration);
            return `${indent}let mut ${varName}: bool = ${boolValue}`;
        }
        const methodText = node.declarations.length === 1 ? this.rustStringMethodLocalInit(declaration) : undefined;
        if (methodText !== undefined) return `${indent}let mut ${varName}: String = ${methodText}`;
        const typedStr = this.rustSafeStringLocalIsTyped(declaration);
        const nativeStr = this.rustNativeStrCalleeKind(declaration.initializer) === 'str';
        const signApi = typedStr ? this.rustSignApiElementInit(declaration) : undefined;
        if (signApi !== undefined) {
            return `${indent}let mut ${varName}: Option<String> = ${signApi.receiver}.get(${signApi.index}).and_then(Value::as_str).map(str::to_owned)`;
        }
        if (typedStr) {
            // A native-`Option<String>` callee already carries the payload; `safeString` helpers need the unwrap.
            return `${indent}let mut ${varName}: Option<String> = ${parsedValue}${nativeStr ? '' : '.as_str().map(str::to_owned)'}`;
        }
        // A callee returning `Option<String>` into a boxed local keeps the box.
        return `${indent}let mut ${varName}: Value = ${nativeStr ? this.rustNativeStrValueBox(parsedValue) : parsedValue}`;
    }

    // ── native-typed locals ───────────────────────────────────────────────────
    //
    // A local is declared `bool` (instead of `Value`) when its initializer is
    // already a bool-valued Rust expression and every use is a condition sink
    // (`is_true(&x)`) — the one sink that accepts a native bool today.
    //
    // `is_true` is generic over `IsTruthy` (impl for `bool`/`&bool` in
    // runtime.rs); every other sink takes `&Value`, so any other use keeps the
    // local boxed. Bools come in two shapes: helpers whose Rust return type is
    // already `bool` (below), and the printer's own `Value::Bool(...)` box,
    // which the declaration drops at the init site.

    private static readonly RUST_BOOL_RESULT_HELPERS = new Set([
        'is_true', 'is_equal', 'is_greater_than', 'is_greater_than_or_equal',
        'is_less_than', 'is_less_than_or_equal', 'is_array', 'is_object',
        'is_string', 'is_number', 'is_bool', 'is_integer', 'is_function',
        'is_instance', 'starts_with', 'ends_with', 'in_op', 'contains',
    ]);

    // Hand-written Rust fns outside `runtime.rs` with a `-> bool` signature, keyed by the TS callee
    // name (verified in `rust/tests/src/tests_support.rs`). A call is already a Rust bool, so the
    // condition printer's `is_true(&…)` wrapper is the identity (`IsTruthy for bool`) and is dropped.
    private static readonly RUST_BOOL_RESULT_CALLEES = new Set([
        'tickerExceptionNeedsOhlcv',
    ]);

    // Call to a hand-written `-> bool` fn: the checker must agree the TS call
    // is boolean-typed and the callee must be in the verified table above.
    rustCallPrintsBool(node): boolean {
        if (node?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const callee: any = node.expression;
        const name = callee?.kind === SyntaxKind.Identifier ? callee.text
            : callee?.kind === SyntaxKind.PropertyAccessExpression ? callee.name?.text : undefined;
        return name !== undefined && RustTranspiler.RUST_BOOL_RESULT_CALLEES.has(name) && this.rustTypeIsBoolean(node);
    }

    // Index just past the `"..."` literal opening at `i` (escapes skipped).
    private rustSkipStringLiteral(text: string, i: number): number {
        for (i++; i < text.length && text[i] !== '"'; i++) {
            if (text[i] === '\\') i++;
        }
        return i;
    }

    // `<box><expr>)` spanning the whole printed value → `<expr>`. The payload is
    // only reachable this way: the printer prints the value, not its parts.
    peelValueBox(printedValue: string, prefix: string): string | undefined {
        if (!printedValue.startsWith(prefix) || !printedValue.endsWith(')')) {
            return undefined;
        }
        let depth = 0;
        for (let i = prefix.length - 1; i < printedValue.length; i++) {
            const char = printedValue[i];
            if (char === '"') i = this.rustSkipStringLiteral(printedValue, i);
            else if (char === '(') depth++;
            else if (char === ')' && --depth === 0) {
                return i === printedValue.length - 1 ? printedValue.slice(prefix.length, i) : undefined;
            }
        }
        return undefined;
    }

    // `Value::Bool(<expr>)` spanning the whole expression → `<expr>`.
    peelValueBoolBox(printedValue: string): string | undefined {
        return this.peelValueBox(printedValue, 'Value::Bool(');
    }

    // `Value::Str(<expr>)` spanning the whole expression → `<expr>` (a String).
    peelValueStrBox(printedValue: string): string | undefined {
        return this.peelValueBox(printedValue, 'Value::Str(');
    }

    // `((expr))` → `expr` — a redundant layer kept from the TS source; the
    // right-hand side of a declaration binds the whole expression anyway.
    stripOuterParens(printedValue: string): string {
        let value = printedValue.trim();
        while (value.startsWith('(') && value.endsWith(')')) {
            let depth = 0;
            let closesAtEnd = true;
            for (let i = 0; i < value.length && closesAtEnd; i++) {
                const char = value[i];
                if (char === '"') i = this.rustSkipStringLiteral(value, i);
                else if (char === '(') depth++;
                else if (char === ')' && --depth === 0 && i !== value.length - 1) closesAtEnd = false;
            }
            if (!closesAtEnd || depth !== 0) break;
            value = value.slice(1, -1).trim();
        }
        return value;
    }

    // `is_equal(...)` / `!is_true(...)` / `contains(...)` — bare bool helper calls.
    printedBoolHelperCall(printedValue: string): boolean {
        const stripped = printedValue.startsWith('!') ? printedValue.slice(1).trim() : printedValue;
        const match = /^([a-z_][a-z0-9_]*)\(/.exec(stripped);
        return match !== null && RustTranspiler.RUST_BOOL_RESULT_HELPERS.has(match[1]);
    }

    // Source shapes the printer turns into a bool: comparisons, `&&`/`||`
    // (each operand is is_true-wrapped), `!`, `in`, `instanceof`, true/false.
    rustNodeIsBoolExpression(node): boolean {
        switch (node?.kind) {
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
            return true;
        case SyntaxKind.ParenthesizedExpression:
            return this.rustNodeIsBoolExpression(node.expression);
        case SyntaxKind.PrefixUnaryExpression:
            return node.operator === SyntaxKind.ExclamationToken;
        case SyntaxKind.BinaryExpression: {
            const kind = node.operatorToken.kind;
            return (RustTranspiler as any).COMPARISON_OPS.has(kind) || kind === SyntaxKind.AmpersandAmpersandToken
                || kind === SyntaxKind.BarBarToken || kind === SyntaxKind.InKeyword || kind === SyntaxKind.InstanceOfKeyword;
        }
        }
        return false;
    }

    rustTypeIsBoolean(node): boolean {
        try {
            const type = this.getChecker().getTypeAtLocation(node);
            return (type.flags & TypeFlags.BooleanLike) !== 0 || this.getChecker().typeToString(type).trim() === 'boolean';
        } catch (e) {
            return false; // no checker type → keep the boxed form
        }
    }

    rustTypeIsString(node): boolean {
        const checker: any = this.checkerOrUndefined();
        // no checker type → keep the boxed form
        return checker !== undefined && this.isStringLikeType(checker.getTypeAtLocation(node));
    }

    rustEnclosingFunction(node) {
        for (let current = node?.parent; current; current = current.parent) {
            switch (current.kind) {
            case SyntaxKind.MethodDeclaration:
            case SyntaxKind.FunctionDeclaration:
            case SyntaxKind.FunctionExpression:
            case SyntaxKind.ArrowFunction:
            case SyntaxKind.Constructor:
            case SyntaxKind.SourceFile:
                return current;
            }
        }
        return undefined;
    }

    rustBindsName(node, name: string): boolean {
        switch (node?.kind) {
        case SyntaxKind.VariableDeclaration:
        case SyntaxKind.Parameter:
        case SyntaxKind.FunctionDeclaration:
        case SyntaxKind.ClassDeclaration:
        case SyntaxKind.PropertyDeclaration:
        case SyntaxKind.FunctionExpression:
        case SyntaxKind.ArrowFunction:
            return node.name?.kind === SyntaxKind.Identifier && node.name.text === name;
        }
        return false;
    }

    // Only these uses compile against a native `bool` local today: `is_true(&x)`
    // (under any depth of `(...)`, `!`, `&&`/`||`), and the condition slot of
    // if/while/for/ternary — all printed is_true-wrapped.
    rustIdentifierUseIsCondition(node): boolean {
        for (let current: any = node, parent: any = node.parent; parent; current = parent, parent = parent.parent) {
            switch (parent.kind) {
            case SyntaxKind.ParenthesizedExpression:
                if (parent.expression !== current) return false;
                break;
            case SyntaxKind.PrefixUnaryExpression:
                if (parent.operator !== SyntaxKind.ExclamationToken || parent.operand !== current) return false;
                break;
            case SyntaxKind.BinaryExpression:
                if (parent.operatorToken.kind !== SyntaxKind.AmpersandAmpersandToken
                    && parent.operatorToken.kind !== SyntaxKind.BarBarToken) return false;
                break;
            case SyntaxKind.IfStatement:
            case SyntaxKind.WhileStatement:
            case SyntaxKind.DoStatement:
                return parent.expression === current;
            case SyntaxKind.ForStatement:
            case SyntaxKind.ConditionalExpression:
                return parent.condition === current;
            default:
                return false;
            }
        }
        return false;
    }

    // Visits every in-scope use of the local `name` declared by `declaration`: false as soon as the
    // name is re-bound in scope or `acceptUse(identifier)` rejects a use. `skipPropertyNames` leaves
    // `x.foo` / `{ foo }` names out of the uses.
    private rustLocalUsesAll(declaration, name: string, skipPropertyNames: boolean, acceptUse: (n) => boolean): boolean {
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined || name === undefined) {
            return false;
        }
        let safe = true;
        for (const n of this.rustScopeNameNodes(scope, name) as any[]) {
            if (n !== declaration && this.rustBindsName(n, name)) {
                safe = false; // a second binding of the name in scope — stay boxed
                break;
            }
            if (n.kind === SyntaxKind.Identifier && n !== declaration.name
                && !(skipPropertyNames && this.rustIdentifierIsPropertyName(n)) && !acceptUse(n)) {
                safe = false;
                break;
            }
        }
        return safe;
    }

    rustLocalUsesAcceptBool(declaration, sourceName: string): boolean {
        return this.rustLocalUsesAll(declaration, sourceName, false, (n) =>
            this.rustIdentifierUseIsCondition(n) || this.rustBoolParamUseAccepted(n));
    }

    // ── native `bool` parameters ──────────────────────────────────────────────
    //
    // A `boolean` parameter of a venue-local generated method prints `bool`
    // (required) or is bound with `.is_truthy()` (optional) when the checker
    // proves the type and every body read is a bool sink. Call sites and the
    // name-based dispatch arms coerce with `Value::is_truthy`, which is exactly
    // what the per-use `is_true(&x)` did, so the ABI stays a superset.

    private rustBoolParamDecisions = new Map<any, boolean>();

    rustParamPrintsBool(param): boolean {
        if (param?.kind !== SyntaxKind.Parameter) {
            return false;
        }
        let decision = this.rustBoolParamDecisions.get(param);
        if (decision === undefined) {
            this.rustBoolParamDecisions.set(param, false); // re-entrancy guard
            decision = this.rustParamPrintsBoolUncached(param);
            this.rustBoolParamDecisions.set(param, decision);
        }
        return decision;
    }

    rustParamPrintsBoolUncached(param): boolean {
        const method: any = param.parent;
        if (!isMethodDeclaration(method) || method.body === undefined) {
            return false;
        }
        if (param.name?.kind !== SyntaxKind.Identifier || param.dotDotDotToken !== undefined) {
            return false;
        }
        if ((method.modifiers ?? []).some((m: any) => m.kind === SyntaxKind.StaticKeyword)) {
            return false;
        }
        // The base tier and every base override keep the fixed `Value` ABI that
        // the hand-written trait declares.
        const baseFile = RustTranspiler.RUST_BASE_TIER_FILE;
        if (baseFile.test(param.getSourceFile().fileName)) {
            return false;
        }
        const hidden: any = this.getMethodOverride(method);
        if (hidden !== undefined && baseFile.test(hidden.getSourceFile().fileName)) {
            return false;
        }
        if (!this.rustTypeIsBoolean(param.name)) {
            return false;
        }
        // A method reference handed to `this.spawn(...)` / `.bind` keeps the
        // function-pointer shape, so the whole method stays boxed.
        if (this.rustMethodReferencedAsValue(method)) {
            return false;
        }
        return this.rustLocalUsesAll(param, param.name.text, true, (n) => this.rustBoolParamUseAccepted(n));
    }

    /** True when `this.<name>` is read as a value (not called) in the method's own file. */
    rustMethodReferencedAsValue(method): boolean {
        const name = method.name?.text;
        if (name === undefined) {
            return false;
        }
        const cached = this.rustValueReferencedMethods.get(method.getSourceFile().fileName);
        if (cached !== undefined) {
            return cached.has(name);
        }
        return this.rustValueReferenceCensus(method.getSourceFile()).has(name);
    }

    // Per-file, so the decision never depends on program membership (farm and
    // scoped regens must agree). A same-class reference is the shape that would
    // force a function pointer instead of the printed call.
    private rustValueReferencedMethods = new Map<string, Set<string>>();

    rustValueReferenceCensus(file): Set<string> {
        const names = new Set<string>();
        if (file === undefined) {
            return names;
        }
        const visit = (n: any) => {
            if (n.kind === SyntaxKind.PropertyAccessExpression && n.name?.kind === SyntaxKind.Identifier) {
                const parent = n.parent;
                const called = parent?.kind === SyntaxKind.CallExpression && parent.expression === n;
                if (!called) {
                    names.add(n.name.text);
                }
            }
            n.forEachChild(visit);
        };
        visit(file);
        this.rustValueReferencedMethods.set(file.fileName, names);
        return names;
    }

    /** Native type text of a parameter in the emitted signature. */
    rustParamType(param): string {
        if (this.rustParamPrintsBool(param)) return 'bool';
        if (this.rustParamPrintsMap(param)) return '&mut indexmap::IndexMap<String, Value>';
        if (this.rustParamPrintsStrVec(param)) return 'Vec<String>';
        return 'Value';
    }

    // A read of a native-`bool` parameter that still compiles: a condition slot,
    // or an argument of a call whose own parameter prints `bool`.
    rustBoolParamUseAccepted(node): boolean {
        if (this.rustIdentifierUseIsCondition(node)) {
            return true;
        }
        const call: any = node.parent;
        if (call?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        const at = Array.from(call.arguments).indexOf(node);
        if (at < 0) {
            return false;
        }
        const params = this.rustCalleeParams(call);
        return params !== undefined && this.rustNativeBoolArgumentSlot(params, at);
    }

    /** Parameter declarations of a call's resolved callee, when the checker has them. */
    rustCalleeParams(call): any[] | undefined {
        let declaration: any = this.rustCallDeclarations.get(call);
        if (declaration === undefined) {
            try {
                declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call)) ?? null;
            } catch (e) {
                return undefined;
            }
            this.rustCallDeclarations.set(call, declaration);
        }
        if (declaration === undefined || declaration === null) {
            return undefined;
        }
        const resolved: any = declaration.resolve?.() ?? declaration;
        return resolved.parameters === undefined ? undefined : Array.from(resolved.parameters);
    }

    /** `bool` text for an argument in a native-`bool` parameter slot. */
    rustBoolArgumentText(node, identation): string {
        const native = this.rustNativeBoolArgumentText(node);
        if (native !== undefined) {
            return native;
        }
        const printed = this.printNode(node, identation).trim();
        const peeled = this.peelValueBoolBox(this.stripOuterParens(printed));
        if (peeled !== undefined) {
            return `(${peeled})`;
        }
        // A plain path reads without the wrapping parens.
        return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(printed)
            ? `${printed}.is_truthy()`
            : `(${printed}).is_truthy()`;
    }

    /** True when the call's `at`-th argument lands in a required native-`bool` slot. */
    rustNativeBoolArgumentSlot(params, at: number): boolean {
        const param: any = params !== undefined && at < params.length ? params[at] : undefined;
        if (param === undefined || param.initializer !== undefined || param.questionToken !== undefined) {
            return false;
        }
        return this.rustParamPrintsBool(param);
    }

    /** Argument shapes the printer already emits as a Rust `bool`. */
    rustNativeBoolArgumentText(node): string | undefined {
        const inner: any = node?.kind === SyntaxKind.ParenthesizedExpression ? node.expression : node;
        if (inner?.kind === SyntaxKind.TrueKeyword) {
            return 'true';
        }
        if (inner?.kind === SyntaxKind.FalseKeyword) {
            return 'false';
        }
        if (inner?.kind === SyntaxKind.Identifier) {
            const declaration: any = this.rustDeclaredNode(inner);
            if (declaration?.kind === SyntaxKind.Parameter && this.rustParamPrintsBool(declaration)) {
                return this.printNode(inner, 0).trim();
            }
            if (declaration?.kind === SyntaxKind.VariableDeclaration
                && this.getRustBoolLocalInitializer(declaration, this.printNode(inner, 0)) !== undefined) {
                return this.printNode(inner, 0).trim();
            }
            return undefined;
        }
        if (inner?.kind === SyntaxKind.PrefixUnaryExpression && inner.operator === SyntaxKind.ExclamationToken) {
            const operand = this.rustNativeBoolArgumentText(inner.operand);
            return operand === undefined ? undefined : `!${operand}`;
        }
        return undefined;
    }

    rustDeclaredNode(node): Node | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(node);
        return symbol === undefined ? undefined : symbolValueDeclaration(symbol) ?? symbolDeclarations(symbol)[0];
    }

    /** Condition text for a bare identifier of native-`bool` type, else undefined. */
    printNativeBoolParamCondition(node): string | undefined {
        const inner: any = this.unwrapParens(node) ?? node;
        if (inner?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const declaration: any = this.rustDeclaredNode(inner);
        return declaration?.kind === SyntaxKind.Parameter && this.rustParamPrintsBool(declaration)
            ? this.printNode(inner, 0).trim()
            : undefined;
    }

    // ── owned map parameters ──────────────────────────────────────────────────
    // A `Dict`-annotated parameter whose body only takes map operations and whose every call site passes a typed
    // dict bearer prints `&mut IndexMap`, so its writes are plain `.insert` with no per-site `Arc::make_mut` guard.

    private rustMapParamDecisions = new WeakMap<any, boolean>();

    // ── native `Vec<String>` parameters ───────────────────────────────────────
    // A required `string[]` parameter of a non-base method whose every body use is
    // `p.join('lit')` prints `Vec<String>`: the join is the std `.join(..)`, no
    // closure. The dispatcher builds the list with `Value::to_string_vec`, and
    // every call site passes an array literal of plain `Value` identifiers.

    private rustStrVecParamDecisions = new WeakMap<any, boolean>();

    rustParamPrintsStrVec(param): boolean {
        if (param?.kind !== SyntaxKind.Parameter) return false;
        let decision = this.rustStrVecParamDecisions.get(param);
        if (decision === undefined) {
            this.rustStrVecParamDecisions.set(param, false); // re-entrancy guard
            try {
                decision = this.rustStrVecParamUncached(param);
            } catch (e) {
                decision = false;
            }
            this.rustStrVecParamDecisions.set(param, decision);
        }
        return decision;
    }

    rustStrVecParamUncached(param): boolean {
        const method: any = param.parent;
        if (!isMethodDeclaration(method) || method.body === undefined) return false;
        if (param.name?.kind !== SyntaxKind.Identifier || param.dotDotDotToken !== undefined) return false;
        if (param.initializer !== undefined || param.questionToken !== undefined || param.type === undefined) return false;
        if ((method.modifiers ?? []).some((m: any) => m.kind === SyntaxKind.StaticKeyword)) return false;
        const baseFile = RustTranspiler.RUST_BASE_TIER_FILE;
        if (baseFile.test(param.getSourceFile().fileName)) return false;
        const hidden: any = this.getMethodOverride(method);
        if (hidden !== undefined && baseFile.test(hidden.getSourceFile().fileName)) return false;
        const checker: any = this.checkerOrUndefined();
        const type: any = checker === undefined ? undefined : this.getCheckedTypeOf(param.type);
        if (type === undefined || !checker.isArrayType(type)) return false;
        if (this.primitiveKindOfType(checker.getTypeArguments?.(type)?.[0]) !== 'string') return false;
        if (this.rustMethodReferencedAsValue(method)) return false;
        let joins = 0;
        const usesOk = this.rustLocalUsesAll(param, String(param.name.text), true, (n) => {
            const access: any = n.parent;
            if (!isPropertyAccessExpression(access) || access.expression !== n || String(access.name.text) !== 'join') return false;
            const call: any = access.parent;
            if (!isCallExpression(call) || call.expression !== access || call.arguments.length !== 1) return false;
            if (this.rustNativeStringLiteralArg(call.arguments[0]) === undefined) return false;
            joins++;
            return true;
        });
        if (!usesOk || joins === 0) return false;
        const index = Array.from(method.parameters as any).indexOf(param);
        return index >= 0 && this.rustStrVecCallSitesOk(method, index);
    }

    /** Every call site resolving to `method` passes an array literal of plain `Value` identifiers (none is fine: the dispatcher converts). */
    rustStrVecCallSitesOk(method, index: number): boolean {
        const name = String((method.name as any)?.text ?? '');
        if (name === '') return false;
        const key = this.rustDeclarationKey(method);
        for (const call of this.rustCallSitesForName(name) as any[]) {
            const args: any[] = call.arguments ?? [];
            if (args.some((a: any) => a.kind === SyntaxKind.SpreadElement)) return false;
            let declaration: any;
            try {
                declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
            } catch (e) {
                return false;
            }
            declaration = declaration?.resolve?.() ?? declaration;
            if (declaration === undefined || declaration === null || this.rustDeclarationKey(declaration) !== key) continue;
            if (!this.rustStrVecArgumentOk(args[index])) return false;
        }
        return true;
    }

    rustStrVecArgumentOk(arg): boolean {
        const inner: any = arg === undefined ? undefined : this.rustSkipWrappers(arg);
        if (inner !== undefined && this.rustStrVecValueLocal(inner)) return true;
        if (inner === undefined || !isArrayLiteralExpression(inner) || inner.elements.length === 0) return false;
        return Array.from(inner.elements as any).every((e: any) => isIdentifier(e)
            && this.primitiveKindOfType(this.getCheckedTypeOf(e)) === 'string'
            && this.isDeclaredValueIdentifier(e) && !this.rustStringLocalIdentifierIsTyped(e)
            && this.rustDeclarationOfIdentifier(e)?.kind !== SyntaxKind.BindingElement);
    }

    /** A plain `Value` local (not a param, not a typed container): `x.to_str_vec()` converts it. */
    rustStrVecValueLocal(node): boolean {
        if (!isIdentifier(node) || !this.isDeclaredValueIdentifier(node)) return false;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name === node) return false;
        if (declaration.initializer === undefined || declaration.name?.kind !== SyntaxKind.Identifier) return false;
        if (this.rustStringLocalIdentifierIsTyped(node) || this.rustReadBearerKindOfDeclaration(declaration) !== false) return false;
        if (this.rustVecLocalIsTyped(declaration) || this.rustDictLocalIsTyped(declaration) || this.rustNestedDictLocalIsTyped(declaration)) return false;
        return this.getRustBoolLocalInitializer(declaration, '') === undefined;
    }

    rustNativeStrVecArgumentSlot(params, at: number): boolean {
        const param: any = params !== undefined && at < params.length ? params[at] : undefined;
        if (param === undefined || param.initializer !== undefined || param.questionToken !== undefined) return false;
        return this.rustParamPrintsStrVec(param);
    }

    /** `vec![a.to_string(), ..]` for an array literal landing in a `Vec<String>` slot. */
    rustStrVecArgumentText(node, identation): string {
        const inner: any = this.rustSkipWrappers(node);
        if (inner !== undefined && this.rustStrVecValueLocal(inner)) return `${this.printNode(inner, 0).trim()}.to_str_vec()`;
        if (inner === undefined || !isArrayLiteralExpression(inner)) return this.printNode(node, identation).trim();
        return `vec![${Array.from(inner.elements as any).map((e: any) => `${this.printNode(e, 0).trim()}.to_string()`).join(', ')}]`;
    }

    printStrVecParamJoin(node): string | undefined {
        const access: any = node?.expression;
        if (!isPropertyAccessExpression(access) || !isIdentifier(access.expression) || node.arguments?.length !== 1) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(access.expression);
        if (declaration === undefined || !isParameterDeclaration(declaration) || !this.rustParamPrintsStrVec(declaration)) return undefined;
        const literal = this.rustNativeStringLiteralArg(node.arguments[0]);
        if (literal === undefined) return undefined;
        return `Value::Str(${this.printNode(access.expression, 0).trim()}.join("${literal}").into())`;
    }

    rustParamPrintsMap(param): boolean {
        if (param?.kind !== SyntaxKind.Parameter) {
            return false;
        }
        let decision = this.rustMapParamDecisions.get(param);
        if (decision === undefined) {
            this.rustMapParamDecisions.set(param, false); // re-entrancy guard
            try {
                decision = this.rustMapParamIsTypedUncached(param);
            } catch (e) {
                decision = false; // no proof -> the parameter keeps its `Value` box
            }
            this.rustMapParamDecisions.set(param, decision);
        }
        return decision;
    }

    rustMapParamIsTypedUncached(param): boolean {
        const method: any = param.parent;
        if (!isMethodDeclaration(method) || method.body === undefined) {
            return false;
        }
        if (param.name?.kind !== SyntaxKind.Identifier || param.dotDotDotToken !== undefined) {
            return false;
        }
        if (param.initializer !== undefined || param.questionToken !== undefined || param.type === undefined) {
            return false; // the optional-arg path binds through `get_arg`, a `Value`
        }
        if ((method.modifiers ?? []).some((m: any) => m.kind === SyntaxKind.StaticKeyword)) {
            return false;
        }
        // The base tier and every base override keep the fixed `Value` ABI the
        // hand-written trait declares.
        const baseFile = RustTranspiler.RUST_BASE_TIER_FILE;
        if (baseFile.test(param.getSourceFile().fileName)) {
            return false;
        }
        const hidden: any = this.getMethodOverride(method);
        if (hidden !== undefined && baseFile.test(hidden.getSourceFile().fileName)) {
            return false;
        }
        const type = this.getCheckedTypeOf(param.type);
        if (type === undefined || !this.isProvenMapType(type)) {
            return false;
        }
        if (this.rustMethodReferencedAsValue(method)) {
            return false;
        }
        const index = Array.from(method.parameters as any).indexOf(param);
        if (index < 0 || !this.rustMapParamBodyUsesOk(param)) {
            return false;
        }
        return this.rustMapParamCallSitesOk(method, index);
    }

    /** Every body use is a map operation the bearered printer emits, and at
     *  least one of them writes (otherwise the read shadow already covers it). */
    rustMapParamBodyUsesOk(param): boolean {
        let writes = 0;
        const safe = this.rustLocalUsesAll(param, String((param.name as any).text), true, (n) => {
            const kind = this.rustMapParamUseKind(n);
            if (kind === 'write') {
                writes++;
            }
            return kind !== undefined;
        });
        return safe && writes > 0;
    }

    /** `read` / `write` on a single-level key, or `box` where the printer moves
     *  the map into a `Value::Map(..)`; anything else has no printed form. */
    rustMapParamUseKind(node): string | undefined {
        const parent: any = node.parent;
        if (parent === undefined) {
            return undefined;
        }
        if (isElementAccessExpression(parent) && parent.expression === node) {
            if (!this.rustDictBearerElementUse(parent, String(node.text))) {
                return undefined;
            }
            // a chained write (`p[k1][k2] = v`) has a native print only on a local bearer
            if (isElementAccessExpression(parent.parent) && parent.parent.expression === parent) {
                let root: any = parent.parent;
                while (isElementAccessExpression(root.parent) && root.parent.expression === root) root = root.parent;
                const top: any = root.parent;
                if (top !== undefined && isBinaryExpression(top) && top.left === root
                    && rustIsAssignmentOperator(top.operatorToken.kind)) {
                    return undefined;
                }
            }
            const up: any = parent.parent;
            return (up !== undefined && isBinaryExpression(up) && up.left === parent
                && rustIsAssignmentOperator(up.operatorToken.kind)) ? 'write' : 'read';
        }
        if (isReturnStatement(parent) && parent.expression === node) {
            return 'box';
        }
        if (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === node) {
            return 'box';
        }
        // `x['k'] = <this param>`: the value of a native dict write.
        if (isBinaryExpression(parent) && parent.right === node
            && parent.operatorToken.kind === SyntaxKind.EqualsToken
            && isElementAccessExpression(parent.left)) {
            return 'box';
        }
        // A `this.`/`super.` call argument, unless it lands in another map slot
        // (a reborrow the printer does not emit).
        if (isCallExpression(parent) && parent.arguments.some((a: any) => a === node)) {
            const at = Array.from(parent.arguments).indexOf(node);
            const params = this.rustCalleeParams(parent);
            return this.rustNativeMapArgumentSlot(params, at) === undefined ? 'box' : undefined;
        }
        return undefined;
    }

    /** The value operand of a `m['k'] = x` write: the receiver takes a `Value`, so
     *  the map is boxed there (a move at its last use, a clone before it). */
    rustDictWriteValue(node): boolean {
        const parent: any = node?.parent;
        return parent !== undefined && isBinaryExpression(parent) && parent.right === node
            && parent.operatorToken.kind === SyntaxKind.EqualsToken
            && isElementAccessExpression(parent.left);
    }

    /** A use that prints the map as `Value::Map(x.clone())`: the body scan's
     *  `box` positions, never a key read or a map argument slot. */
    rustMapParamBoxes(node): boolean {
        const parent: any = node.parent;
        if (parent === undefined) {
            return false;
        }
        if (isReturnStatement(parent) && parent.expression === node) {
            return true;
        }
        if (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === node) {
            return true;
        }
        if (isBinaryExpression(parent) && parent.right === node
            && parent.operatorToken.kind === SyntaxKind.EqualsToken
            && isElementAccessExpression(parent.left)) {
            return true;
        }
        if (isCallExpression(parent) && parent.arguments.some((a: any) => a === node)) {
            const at = Array.from(parent.arguments).indexOf(node);
            return this.rustNativeMapArgumentSlot(this.rustCalleeParams(parent), at) === undefined;
        }
        return false;
    }

    /** A parameter printed as a native map, or undefined. */
    rustMapParamDeclaration(node): any | undefined {
        if (!isIdentifier(node)) {
            return undefined;
        }
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isParameterDeclaration(declaration)) {
            return undefined;
        }
        return this.rustParamPrintsMap(declaration) ? declaration : undefined;
    }

    /** The `at`-th argument of a call lands in a native-map parameter slot. */
    rustNativeMapArgumentSlot(params, at: number): any | undefined {
        const param: any = params !== undefined && at < params.length ? params[at] : undefined;
        if (param === undefined || param.initializer !== undefined || param.questionToken !== undefined) {
            return undefined;
        }
        return this.rustParamPrintsMap(param) ? param : undefined;
    }

    /** `&mut <bearer>` for a map slot; every call site is proven a bearer. */
    rustMapArgumentText(node, identation): string {
        const inner: any = this.rustSkipWrappers(node);
        if (inner !== undefined && isIdentifier(inner) && this.rustMapArgumentIsBearer(inner)) {
            return `&mut ${this.printNode(inner, 0).trim()}`;
        }
        return this.printNode(node, identation).trim();
    }

    rustMapArgumentIsBearer(node): boolean {
        const inner: any = this.rustSkipWrappers(node);
        if (inner === undefined || !isIdentifier(inner)) {
            return false;
        }
        const declaration: any = this.rustDeclarationOfIdentifier(inner);
        return declaration !== undefined && isVariableDeclaration(declaration) && this.rustDictLocalIsTyped(declaration);
    }

    /** Program-wide call sites of `method`: every one passes a bearer in the slot. */
    rustMapParamCallSitesOk(method, index: number): boolean {
        const name = String((method.name as any)?.text ?? '');
        if (name === '') {
            return false;
        }
        const key = this.rustDeclarationKey(method);
        let proven = 0;
        for (const call of this.rustCallSitesForName(name) as any[]) {
            const args: any[] = call.arguments ?? [];
            if (args.some((a: any) => a.kind === SyntaxKind.SpreadElement)) {
                return false;
            }
            let declaration: any;
            try {
                declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
            } catch (e) {
                return false;
            }
            declaration = declaration?.resolve?.() ?? declaration;
            if (declaration === undefined || declaration === null || this.rustDeclarationKey(declaration) !== key) {
                continue;
            }
            const arg: any = args[index];
            if (arg === undefined || !this.rustMapArgumentIsBearer(arg)) {
                return false;
            }
            proven++;
        }
        return proven > 0;
    }

    rustDeclarationKey(node): string {
        const source = node?.getSourceFile?.();
        return source === undefined ? '' : `${source.fileName}:${node.pos}:${node.end}`;
    }

    private rustCallSitesCache = new WeakMap<any, Map<string, any[]>>();

    rustCallSitesForName(name: string): any[] {
        const program: any = this.getProgram();
        let table = this.rustCallSitesCache.get(program);
        if (table === undefined) {
            table = new Map<string, any[]>();
            this.rustCallSitesCache.set(program, table);
        }
        const cached = table.get(name);
        if (cached !== undefined) {
            return cached;
        }
        const calls: any[] = [];
        table.set(name, calls); // installed before the walk: a throwing walk admits nothing
        const names: string[] = (program.getSourceFileNames?.() ?? []) as any;
        for (const fileName of names) {
            const file: any = program.getSourceFile(fileName);
            if (file === undefined || file.isDeclarationFile) {
                continue;
            }
            const visit = (node: any) => {
                if (node?.kind === SyntaxKind.CallExpression) {
                    const callee: any = node.expression;
                    const calleeName = isPropertyAccessExpression(callee) && callee.name?.kind === SyntaxKind.Identifier
                        ? String(callee.name.text)
                        : (isIdentifier(callee) ? String(callee.text) : undefined);
                    if (calleeName === name) {
                        calls.push(node);
                    }
                }
                node.forEachChild(visit);
            };
            file.forEachChild(visit);
        }
        return calls;
    }

    /** `x['k'] = v` on a native-map parameter: the insert `add_element_to_object`
     *  performs on the same plain dict, on the map the type already is. */
    rustMapParamDictInsert(baseExpr, keyNode, keyText: string, valueText: string): string | undefined {
        const declaration = this.rustMapParamDeclaration(baseExpr);
        if (declaration === undefined) {
            return undefined;
        }
        const name = String(baseExpr.text);
        if (!this.rustDictBearerKeyOk(keyNode) && !this.rustBearerWriteKeyOk(keyNode, name)) {
            return undefined;
        }
        const keyArg = this.rustNativeInsertKeyArg({ text: name, isField: false, plain: true }, keyNode, keyText)
            ?? this.rustBearerWriteKeyArg(keyNode, keyText, name);
        if (keyArg === undefined) {
            return undefined;
        }
        return this.rustBearerInsertText(name, keyArg, valueText);
    }

    // A new string local built by `this.capitalize(v)` / `r.toUpperCase()` / `r.toLowerCase()` is a
    // native `String` when every use is a boxing move (return, object value, `this.` arg, `m[k] = x`).

    private rustStringMethodLocalDecisions = new WeakMap<any, boolean>();

    /** The native initializer text of a string-method local, else undefined. */
    rustStringMethodLocalInit(declaration): string | undefined {
        const init: any = declaration.initializer;
        if (declaration.name?.kind !== SyntaxKind.Identifier || init === undefined || !isCallExpression(init)
            || !isPropertyAccessExpression(init.expression)) return undefined;
        const callee: any = init.expression;
        const method = String(callee.name.text);
        let text: string | undefined;
        if (method === 'capitalize' && callee.expression.kind === SyntaxKind.ThisKeyword && init.arguments.length === 1) {
            text = `${this.printNode(init, 0).trim()}.to_string()`;
        } else if ((method === 'toUpperCase' || method === 'toLowerCase') && init.arguments.length === 0
            && callee.expression.kind !== SyntaxKind.ThisKeyword && isIdentifier(callee.expression)
            && this.rustParamShadowOf(callee.expression) === undefined) {
            const receiver = this.rustNativeStringReceiver(init, this.printNode(callee.expression, 0));
            if (receiver !== undefined) text = `${receiver}.as_str().map(str::${method === 'toUpperCase' ? 'to_uppercase' : 'to_lowercase'}).unwrap_or_default()`;
        }
        return text !== undefined && this.rustStringMethodLocalIsTyped(declaration) ? text : undefined;
    }

    rustStringMethodLocalIsTyped(declaration): boolean {
        let decision = this.rustStringMethodLocalDecisions.get(declaration);
        if (decision === undefined) {
            this.rustStringMethodLocalDecisions.set(declaration, false); // re-entrancy guard
            decision = this.primitiveKindOfType(this.typeOfNodeIfAny(declaration.name)) === 'string'
                && this.rustLocalUsesAll(declaration, declaration.name.text, true, (n) => this.rustStringMethodLocalBoxUse(n));
            this.rustStringMethodLocalDecisions.set(declaration, decision);
        }
        return decision;
    }

    rustStringMethodLocalBoxUse(n): boolean {
        const parent: any = n.parent;
        return isReturnStatement(parent) || this.rustDictWriteValue(n)
            || (parent?.kind === SyntaxKind.PropertyAssignment && parent.initializer === n)
            || (isCallExpression(parent) && parent.arguments.some((a) => a === n) && this.rustVecBoxingCallee(parent.expression));
    }

    // Typed string locals: `let x: Value = self.safeString(..)` is declared `Option<String>` when
    // the checker proves a string and every use is a native sink (`x.is_none()`, `x.as_deref() ==
    // Some("lit")`). The helper's Value is unwrapped with `.as_str()`; any other sink keeps the box.

    private static readonly RUST_STRING_LOCAL_HELPERS = new Set([
        'safeString', 'safeString2', 'safeStringN',
        'safeStringLower', 'safeStringLower2', 'safeStringLowerN',
        'safeStringUpper', 'safeStringUpper2', 'safeStringUpperN',
    ]);

    private rustStringLocalDecisions = new Map<any, boolean>();

    // `let x = this.safeString(..)` / `safeString(..)` — the whole initializer;
    // a call whose callee already returns `Option<String>` (a native-`Str`
    // method) is the same payload without the unwrap.
    rustSafeStringLocalInitializer(declaration): boolean {
        const initializer = declaration.initializer;
        if (declaration.name?.kind !== SyntaxKind.Identifier || initializer?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        if (this.rustNativeStrCalleeKind(initializer) === 'str') {
            return true;
        }
        const callee = initializer.expression;
        const helpers = RustTranspiler.RUST_STRING_LOCAL_HELPERS;
        if (callee?.kind === SyntaxKind.PropertyAccessExpression) {
            return callee.expression?.kind === SyntaxKind.ThisKeyword && helpers.has(callee.name.text);
        }
        return callee?.kind === SyntaxKind.Identifier && helpers.has(callee.text);
    }

    // The two uses that compile against an `Option<String>` local and print
    // natively: `x ==/!= null|undefined` and `x ==/!= "lit"`.
    rustStringLocalUseIsNative(node): boolean {
        const parent = node.parent;
        if (parent?.kind !== SyntaxKind.BinaryExpression) {
            return false;
        }
        const op = parent.operatorToken.kind;
        if (op !== SyntaxKind.EqualsEqualsToken && op !== SyntaxKind.EqualsEqualsEqualsToken
            && op !== SyntaxKind.ExclamationEqualsToken && op !== SyntaxKind.ExclamationEqualsEqualsToken) {
            return false;
        }
        const other = parent.left === node ? parent.right : (parent.right === node ? parent.left : undefined);
        if (other === undefined) {
            return false;
        }
        const otherLiteral = this.literalKindOfNode(other);
        // The string-literal compare prints as `<x>.as_deref() == Some("lit")`;
        // the printer's own rejections (replacement tokens) must match.
        return otherLiteral === 'null' || (otherLiteral === 'string' && !(other.text in this.StringLiteralReplacements));
    }

    // Every use compiles against `Option<String>`, and at least one native sink
    // consumes it (otherwise the retype buys nothing).
    rustSafeStringLocalIsTyped(declaration): boolean {
        const cached = this.rustStringLocalDecisions.get(declaration);
        if (cached !== undefined) {
            return cached;
        }
        this.rustStringLocalDecisions.set(declaration, false); // re-entrancy guard
        const decision = this.rustSignApiElementInit(declaration) !== undefined
            ? this.rustSignApiStringLocalIsTyped(declaration)
            : this.rustSafeStringLocalIsTypedUncached(declaration);
        this.rustStringLocalDecisions.set(declaration, decision);
        return decision;
    }

    // Only string-literal compares: the null compare prints `!= Value::Null` and needs the box.
    rustSignApiStringLocalIsTyped(declaration): boolean {
        if (this.primitiveKindOfType(this.typeOfNodeIfAny(declaration.name)) !== 'string') return false;
        let literalUses = 0;
        const safe = this.rustLocalUsesAll(declaration, declaration.name.text, true, (n) => {
            const other = n.parent?.kind === SyntaxKind.BinaryExpression ? (n.parent.left === n ? n.parent.right : n.parent.left) : undefined;
            if (other === undefined || this.literalKindOfNode(other) !== 'string' || !this.rustStringLocalUseIsNative(n)) return false;
            literalUses++;
            return true;
        });
        return safe && literalUses > 0;
    }

    rustSafeStringLocalIsTypedUncached(declaration): boolean {
        if (!this.rustSafeStringLocalInitializer(declaration)
            || this.primitiveKindOfType(this.typeOfNodeIfAny(declaration.name)) !== 'string') {
            return false;
        }
        let nativeUses = 0;
        const safe = this.rustLocalUsesAll(declaration, declaration.name.text, true,
            (n) => this.rustStringLocalUseIsNative(n) && ++nativeUses > 0);
        return safe && nativeUses > 0;
    }

    private static readonly RUST_SIGN_API_METHODS = new Set(['sign', 'fetch2', 'request']);

    /** The `api: string[]` / `section: string[]` parameter (position 1) of sign/fetch2/request an identifier names. */
    rustSignApiParam(node): ParameterDeclaration | undefined {
        if (node === undefined || !isIdentifier(node) || (node.text !== 'api' && node.text !== 'section')) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isParameterDeclaration(declaration)) return undefined;
        const fn: any = declaration.parent;
        if (fn === undefined || !isMethodDeclaration(fn) || !isIdentifier(fn.name)) return undefined;
        if (!RustTranspiler.RUST_SIGN_API_METHODS.has(fn.name.text) || fn.parameters.indexOf(declaration) !== 1) return undefined;
        return String(declaration.type?.getText?.() ?? '').replace(/\s+/g, '') === 'string[]' ? declaration : undefined;
    }

    /** `api[N]` on a shadowed sign-api parameter: the element read the shadow prints as `api.get(N)`. */
    rustSignApiElementInit(declaration): { receiver: string, index: number } | undefined {
        const init: any = declaration.initializer;
        if (declaration.name?.kind !== SyntaxKind.Identifier || init === undefined || !isElementAccessExpression(init)) return undefined;
        const key: any = init.argumentExpression;
        if (!isNumericLiteral(key) || !/^\d+$/.test(String(key.text)) || !isIdentifier(init.expression)) return undefined;
        if (this.rustSignApiParam(init.expression) === undefined || this.rustParamShadowOf(init.expression) === undefined) return undefined;
        return { receiver: String(init.expression.text), index: Number(key.text) };
    }

    // `x.foo` / `{ foo: 1 }` — a property name is not a use of the local.
    rustIdentifierIsPropertyName(node): boolean {
        const parent = node.parent;
        switch (parent?.kind) {
        case SyntaxKind.PropertyAccessExpression:
        case SyntaxKind.PropertyAssignment:
        case SyntaxKind.PropertySignature:
        case SyntaxKind.ShorthandPropertyAssignment:
            return parent.name === node;
        }
        return false;
    }

    // Is this identifier occurrence bound to a typed string local?
    rustStringLocalIdentifierIsTyped(node): boolean {
        const checker: any = node?.kind === SyntaxKind.Identifier ? this.checkerOrUndefined() : undefined;
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const declaration = symbolValueDeclaration(symbol) ?? symbolDeclarations(symbol)[0];
        return declaration?.kind === SyntaxKind.VariableDeclaration && this.rustSafeStringLocalIsTyped(declaration);
    }

    // `let x = <bool expr>` → the printed bool expression, or undefined.
    getRustBoolLocalInitializer(declaration, printedValue: string): string | undefined {
        const initializer = declaration.initializer;
        if (initializer === undefined || declaration.name?.kind !== SyntaxKind.Identifier) {
            return undefined;
        }
        const inner = this.stripOuterParens(printedValue);
        const peeled = this.peelValueBoolBox(inner);
        if (peeled === undefined && !this.printedBoolHelperCall(inner) && !this.rustNodeIsBoolExpression(initializer)) {
            return undefined;
        }
        if (!this.rustTypeIsBoolean(initializer) || !this.rustLocalUsesAcceptBool(declaration, declaration.name.text)) {
            return undefined;
        }
        return peeled ?? inner;
    }

    // ── native `Option<String>` returns (`: Str` methods) ─────────────────────
    //
    // An internal, non-override, non-async method declared `: Str`

    private rustNativeStrReturnDecisions = new WeakMap<Node, boolean>();

    // `ts/src/base/**` — the shared `Exchange` / `PredictionExchange` classes
    // (the transpiler synthesises variants like `.__ExchangeNoOverloads.ts`).
    private static readonly RUST_BASE_TIER_FILE = /ts[\\/]src[\\/]base[\\/]/;

    /** `'str'` when the method is emitted `-> Option<String>`, else undefined. */
    rustNativeStrReturnKind(node: Node): string | undefined {
        if (node === undefined || node.kind !== SyntaxKind.MethodDeclaration) {
            return undefined;
        }
        let decision = this.rustNativeStrReturnDecisions.get(node);
        if (decision === undefined) {
            this.rustNativeStrReturnDecisions.set(node, false); // re-entrancy guard
            decision = this.rustNativeStrReturnDecisionUncached(node);
            this.rustNativeStrReturnDecisions.set(node, decision);
        }
        return decision ? 'str' : undefined;
    }

    private rustMethodOverrides = new WeakMap<Node, Node | null>();
    private rustClassAncestorTables = new WeakMap<Node, Map<string, Node>[] | null>();

    /** Per ancestor class (nearest first): method name -> its LAST declaration; undefined when a
     *  parent class does not resolve. */
    private rustAncestorMethodTables(classDecl: Node): Map<string, Node>[] | undefined {
        const cached = this.rustClassAncestorTables.get(classDecl);
        if (cached !== undefined) {
            return cached ?? undefined;
        }
        const chain: Map<string, Node>[] = [];
        let parentClass = getAllSuperTypeNodes(classDecl)[0];
        let ok = true;
        while (parentClass !== undefined) {
            const parentClassDecl = this.getChecker().getTypeAtLocation(parentClass)?.getSymbol()?.valueDeclaration?.resolve();
            if (parentClassDecl === undefined) {
                ok = false;
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
        this.rustClassAncestorTables.set(classDecl, ok ? chain : null);
        return ok ? chain : undefined;
    }

    // base getMethodOverride rescans every parent member (getText) per call; same walk, memoized
    getMethodOverride(node: Node): Node {
        if (node === undefined || !isClassDeclaration(node.parent) || !(node.parent as any).heritageClauses) {
            return undefined;
        }
        const cached = this.rustMethodOverrides.get(node);
        if (cached !== undefined) {
            return cached ?? undefined;
        }
        const chain = this.rustAncestorMethodTables(node.parent);
        let method = undefined;
        if (chain === undefined) {
            this.warn(node, "Parent class", "Parent class not found");
        } else {
            const name = (node as any).name.text;
            for (const byName of chain) {
                method = byName.get(name) ?? method;
            }
        }
        this.rustMethodOverrides.set(node, method ?? null);
        return method;
    }

    private rustNativeStrReturnDecisionUncached(node): boolean {
        // An override's base/trait copy prints `-> Value`. The base classes are hand-tuned across the
        // whole tree: their methods are called from ~every derived file (and the hand-written runtime),
        // where the boxed `Value` ABI is load-bearing. Only per-exchange
        if (node.type === undefined || this.isAsyncFunction(node) || this.getMethodOverride(node) !== undefined
            || RustTranspiler.RUST_BASE_TIER_FILE.test(node.getSourceFile().fileName)) {
            return false;
        }
        let type: Type;
        try {
            type = this.getChecker().getTypeFromTypeNode(node.type);
        } catch (e) {
            return false;
        }
        return this.primitiveKindOfType(type) === 'string' && this.rustStrReturnPathsConvert(node.body);
    }

    /** Every `return` of the method's own body converts, and the body's last
     *  statement is one of them (so Rust sees no `()`-valued tail the
     *  `-> Value` post-passes would have patched with `Value::Null`). */
    rustStrReturnPathsConvert(body: Block): boolean {
        const last = body?.statements[body.statements.length - 1];
        if (last === undefined || !isReturnStatement(last)) {
            return false;
        }
        let ok = true;
        const visit = (n: Node) => {
            if (!ok || (n !== body && isFunctionLike(n))) {
                return; // a nested function keeps the boxed signature
            }
            if (isReturnStatement(n) && !this.rustStrReturnValueConverts(n.expression)) {
                ok = false;
                return;
            }
            n.forEachChild(visit);
        };
        body.forEachChild(visit);
        return ok;
    }

    /** A `return` value of a native-`Str` method: a nullish literal, an
     *  expression already printing an `Option<String>` (a nested retyped call
     *  or a typed string local), or a `Value`-printing expression the checker
     *  types `string | undefined`. */
    rustStrReturnValueConverts(expression: Node): boolean {
        const inner = this.unwrapParensNode(expression);
        if (inner === undefined) {
            return false;
        }
        if (this.literalKindOfNode(inner) === 'null' || this.rustStrNativeExpression(inner)) {
            return true;
        }
        return this.printsValueExpression(inner) && this.primitiveKindOfType(this.getCheckedTypeOf(inner)) === 'string';
    }

    /** An expression that already prints an `Option<String>` in a `: Str`
     *  method's return position. */
    rustStrNativeExpression(expression: Node): boolean {
        const inner = this.unwrapParensNode(expression);
        if (inner !== undefined && isCallExpression(inner)) {
            return this.rustNativeStrCalleeKind(inner) === 'str';
        }
        return inner !== undefined && isIdentifier(inner) && this.rustStringLocalIdentifierIsTyped(inner);
    }

    unwrapParensNode(node: Node): Node | undefined {
        let current = node;
        while (current !== undefined && isParenthesizedExpression(current)) {
            current = current.expression;
        }
        return current;
    }

    /** The callee declaration behind `self.<method>(..)` when it is emitted
     *  `-> Option<String>`; undefined otherwise (no proof → keep the box). */
    // call node -> resolved signature's declaration (null: none); a handle resolve per call is JS-heavy
    private rustCallDeclarations = new WeakMap<Node, Node | null>();

    rustNativeStrCalleeKind(node: Node): string | undefined {
        if (node === undefined || node.kind !== SyntaxKind.CallExpression) {
            return undefined;
        }
        let declaration = this.rustCallDeclarations.get(node);
        if (declaration === undefined) {
            try {
                declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(node)) ?? null;
            } catch (e) {
                return undefined;
            }
            this.rustCallDeclarations.set(node, declaration);
        }
        return declaration?.kind === SyntaxKind.MethodDeclaration ? this.rustNativeStrReturnKind(declaration) : undefined;
    }

    /** `Option<String>` → `Value` (exact inverse of the return conversion). The operand is already a
     *  typed `String`, so the conversion is the standard `From` impl — no `|__s|` closure between them. */
    rustNativeStrValueBox(text: string): string {
        return `${text}.map(Value::from).unwrap_or(Value::Null)`;
    }

    /** True when a call to a native-`Str` callee must be boxed back to a
     *  `Value` at this position; the declaration and return printers run the
     *  conversion themselves. */
    rustNativeStrCallNeedsBox(node: Node): boolean {
        let current: any = node;
        let parent: any = current.parent;
        while (parent !== undefined && isParenthesizedExpression(parent) && parent.expression === current) {
            current = parent;
            parent = parent.parent;
        }
        if (parent === undefined) {
            return true;
        }
        if (isVariableDeclaration(parent) && parent.initializer === current && isIdentifier(parent.name)) {
            return false; // the declaration printer binds the type / boxes it
        }
        if (isReturnStatement(parent) && parent.expression === current) {
            // only a native-`Str` method's own return printer runs the conversion
            return this.rustNativeStrReturnKind(findAncestor(parent.parent, isFunctionLike) as any) !== 'str';
        }
        return true;
    }

    /** Wrap a call text when the callee returns a native `Option<String>`
     *  and the position still needs a `Value`. */
    rustBoxNativeStrCallIfNeeded(node: Node, text: string): string {
        return this.rustNativeStrCalleeKind(node) === 'str' && this.rustNativeStrCallNeedsBox(node)
            ? this.rustNativeStrValueBox(text) : text;
    }

    // ── declared-Dict locals (`let x: Value = self.safe_dict_k(..)`) ───────────
    //
    // The printer declares non-bool locals `Value`, and the checker types a

    private declaredDictLocalsCache: { src: SourceFile, table: Map<string, RustDeclaredDictLocalEntry[]> } | undefined;

    /** All `let x: Value = <dict-proven initialiser>` declarations of the current
     *  source file, keyed by local name in declaration order. */
    rustDeclaredDictLocals(): Map<string, RustDeclaredDictLocalEntry[]> {
        const src = this.getSrc();
        if (this.declaredDictLocalsCache?.src !== src) {
            let table: Map<string, RustDeclaredDictLocalEntry[]>;
            try {
                table = this.collectRustDeclaredDictLocals(src);
            } catch (e) {
                table = new Map(); // no proof -> consumers keep the helper
            }
            this.declaredDictLocalsCache = { src, table };
        }
        return this.declaredDictLocalsCache.table;
    }

    /** Printer hook for the helper-removal units: the proven kind of a declared
     *  local, or undefined when the local is not proven Dict at every use.
     *  Accepts the receiver node of the helper call (identifier, `x['k']` chain,
     *  `this.x` chain) or the declaration itself. */
    rustDeclaredLocalTypeResolver(node: Node): RustDeclaredLocalKind | undefined {
        return this.rustDeclaredLocalEntry(node)?.kind;
    }

    /** The table entry a use site resolves to (the declaration whose binding the
     *  use refers to, proven), or undefined. */
    rustDeclaredLocalEntry(node: Node): RustDeclaredDictLocalEntry | undefined {
        if (node === undefined) return undefined;
        const name = isVariableDeclaration(node) ? (node.name as Identifier).text : this.rootPlaceText(node);
        if (name === undefined) return undefined;
        const entries = this.rustDeclaredDictLocals().get(name);
        if (entries === undefined) return undefined;
        const start = node.getStart();
        const identifier = this.rustDeclaredLocalIdentifier(node);
        const symbol = identifier === undefined ? undefined : this.rustSymbolOf(identifier);
        let best: RustDeclaredDictLocalEntry | undefined;
        for (const entry of entries) {
            if (entry.start > start || !entry.alwaysDict || !entry.stable) continue;
            const scope = this.rustEnclosingFunction(entry.declaration);
            if (scope !== undefined && !this.isNodeInsideNode(node, scope)) continue;
            if (identifier !== undefined) {
                const entrySymbol = this.rustSymbolOf((entry.declaration.name as Identifier));
                if (symbol !== undefined && entrySymbol !== undefined && symbol !== entrySymbol) continue;
            }
            if (best === undefined || entry.start > best.start) best = entry;
        }
        return best;
    }

    /** The identifier at the head of a place (`x`, `x['k']`, `this.x` is not a
     *  local) — the node the resolver matches against the table. */
    private rustDeclaredLocalIdentifier(node: Node): Identifier | undefined {
        let current: any = node;
        while (current !== undefined && !isIdentifier(current)) {
            if (isElementAccessExpression(current) || isPropertyAccessExpression(current)) {
                if (current.expression.kind === SyntaxKind.ThisKeyword) return undefined;
            } else if (!isParenthesizedExpression(current) && !isNonNullExpression(current)) {
                return undefined;
            }
            current = current.expression;
        }
        return current;
    }

    /** Binding symbol of an identifier, or undefined when the checker cannot
     *  answer (ByContent probes without a class context, for instance). */
    private rustSymbolOf(node: Identifier): TsSymbol | undefined {
        return this.checkerOrUndefined()?.getSymbolAtLocation(node);
    }

    /** True when this identifier is a use of the given declaration's binding.
     *  Without a checker answer the callers stay conservative (reject). */
    private rustIdentifierRefersToDeclaration(node: Identifier, declaration: VariableDeclaration): boolean {
        const symbol = this.rustSymbolOf(node);
        return symbol !== undefined && symbol === this.rustSymbolOf(declaration.name as Identifier);
    }

    /** Census of the current source file's table, for reports and tests. */
    rustDeclaredDictLocalCensus(): { declarators: number, dict: number, alwaysDict: number, kindUnstable: number, retypeEligible: number } {
        let declarators = 0, dict = 0, alwaysDict = 0, kindUnstable = 0, retypeEligible = 0;
        for (const entries of this.rustDeclaredDictLocals().values()) {
            for (const entry of entries) {
                declarators++;
                if (entry.alwaysDict) alwaysDict++;
                if (entry.alwaysDict && entry.stable) dict++;
                if (entry.alwaysDict && !entry.stable) kindUnstable++;
                // every later use is an element access or a kind-preserving
                // mutator -> the only uses a native declaration has to serve.
                if (entry.alwaysDict && entry.stable && entry.uses.other === 0) retypeEligible++;
            }
        }
        return { declarators, dict, alwaysDict, kindUnstable, retypeEligible };
    }

    private collectRustDeclaredDictLocals(src: SourceFile): Map<string, RustDeclaredDictLocalEntry[]> {
        const candidates: { declaration: VariableDeclaration, name: string, source: string, defaultNode: Node | undefined }[] = [];
        this.rustWalkScope(src, (node) => {
            if (isVariableDeclaration(node) && node.initializer !== undefined && node.name.kind === SyntaxKind.Identifier) {
                const info = this.rustDictInitializerInfo(node.initializer);
                if (info !== undefined) {
                    candidates.push({ declaration: node, name: String(node.name.text), source: info.source, defaultNode: info.defaultNode });
                }
            }
        });
        candidates.sort((a, b) => a.declaration.getStart() - b.declaration.getStart());
        const table = new Map<string, RustDeclaredDictLocalEntry[]>();
        for (const candidate of candidates) {
            const declaration = candidate.declaration;
            const start = declaration.getStart();
            const alwaysDict = this.rustDictProvenExpression(candidate.defaultNode, table, start);
            const scan = this.rustDictLocalWriteScan(declaration, candidate.name, table);
            const entries = table.get(candidate.name) ?? [];
            entries.push({ kind: RUST_DECLARED_DICT_LOCALS.DICT, name: candidate.name, source: candidate.source,
                alwaysDict, stable: scan.stable, uses: scan.uses, declaration, start });
            table.set(candidate.name, entries);
        }
        return table;
    }

    /** The Dict-proven initialiser shape of a declaration, or undefined. */
    private rustDictInitializerInfo(node: Node): { source: string, defaultNode: Node | undefined } | undefined {
        if (isObjectLiteralExpression(node)) {
            return { source: 'value_map', defaultNode: node };
        }
        if (isParenthesizedExpression(node) || isAsExpression(node) || isNonNullExpression(node)) {
            return this.rustDictInitializerInfo(node.expression);
        }
        if (!isCallExpression(node)) return undefined;
        const callee = this.rustSafeDictCallee(node);
        if (callee === undefined) return undefined;
        return { source: callee, defaultNode: node.arguments[RUST_DECLARED_DICT_LOCALS.SAFE_CALLEES[callee]] };
    }

    /** Printed `safe_dict*` callee name of `self.<name>(..)`, or undefined. */
    private rustSafeDictCallee(node: CallExpression): string | undefined {
        const expression = node.expression;
        if (!isPropertyAccessExpression(expression) || expression.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const printed = this.toSnakeCaseName(expression.name.text);
        return RUST_DECLARED_DICT_LOCALS.SAFE_CALLEES[printed] === undefined ? undefined : printed;
    }

    /** True when the expression can only be a Dict at run time: an object
     *  literal, a `safe_dict*` call with a Dict-proven default, an element of a
     *  one-element literal default, or an already-proven local. */
    private rustDictProvenExpression(node: Node | undefined, table: Map<string, RustDeclaredDictLocalEntry[]>, useStart: number): boolean {
        if (node === undefined) return false;
        if (isObjectLiteralExpression(node)) return true;
        if (isParenthesizedExpression(node) || isAsExpression(node) || isNonNullExpression(node)) {
            return this.rustDictProvenExpression(node.expression, table, useStart);
        }
        if (isArrayLiteralExpression(node)) {
            return node.elements.length === 1 && this.rustDictProvenExpression(node.elements[0], table, useStart);
        }
        if (isIdentifier(node)) {
            const entries = table.get(node.text) ?? [];
            return entries.some((entry) => {
                if (!entry.alwaysDict || entry.start > useStart) return false;
                const scope = this.rustEnclosingFunction(entry.declaration);
                return scope === undefined || this.isNodeInsideNode(node, scope);
            });
        }
        const info = this.rustDictInitializerInfo(node);
        return info !== undefined && this.rustDictProvenExpression(info.defaultNode, table, useStart);
    }

    /** D2 scan over the enclosing function: an assignment of a non-Dict-proven
     *  value would let the kind change. Every other write path the printer emits
     *  for a local is kind-preserving (`x['k'] = v` -> `add_element_to_object`,
     *  `x.push(v)` -> `append_to_array`, `delete x[k]` -> `remove`, nested
     *  `x['a']['b'] = v` -> `get_value_mut`/`set_value`). A *different* binding of
     *  the same name (sibling block, parameter) is not this local and does not
     *  count; when the checker cannot separate the two bindings the scan stays
     *  conservative and rejects. */
    private rustDictLocalWriteScan(declaration: VariableDeclaration, name: string, table: Map<string, RustDeclaredDictLocalEntry[]>): { stable: boolean, uses: { elementAccess: number, mutHelper: number, other: number } } {
        const uses = { elementAccess: 0, mutHelper: 0, other: 0 };
        let stable = true;
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined) return { stable, uses };
        const declarationSymbol = this.rustSymbolOf(declaration.name as Identifier);
        // every event of the scan is rooted at a node spelled `name`: a re-binding, a use, or the
        // identifier inside an assignment target / for-of-in head (the target's own node is an ancestor)
        for (const node of this.rustScopeNameNodes(scope, name) as any[]) {
            if (node !== declaration && this.rustBindsName(node, name)) {
                const otherSymbol = this.rustSymbolOf((node as any).name);
                if (declarationSymbol === undefined || otherSymbol === undefined || otherSymbol === declarationSymbol) {
                    stable = false; // same binding, or the checker cannot tell them apart
                    break;
                }
            }
            if (node.kind !== SyntaxKind.Identifier) continue;
            if (node !== declaration.name && this.rustIdentifierRefersToDeclaration(node, declaration)) {
                this.rustDictLocalClassifyUse(node, uses);
            }
            let target: any = node;
            while (target.parent !== undefined && (isParenthesizedExpression(target.parent) || isArrayLiteralExpression(target.parent)
                || isShorthandPropertyAssignment(target.parent) || isObjectLiteralExpression(target.parent))) {
                target = target.parent;
            }
            const holder: any = target.parent;
            if (holder !== undefined && isBinaryExpression(holder) && holder.left === target
                && rustIsAssignmentOperator(holder.operatorToken.kind) &&
                this.rustAssignmentWritesWholeLocal(holder.left, declaration) &&
                !this.rustDictProvenExpression(holder.right, table, declaration.getStart())) {
                stable = false; // the local itself is reassigned a non-Dict value
                break;
            }
            // `for (x of list)` / `for (x in obj)` rebind an existing local.
            if (holder !== undefined && (isForOfStatement(holder) || isForInStatement(holder)) && holder.initializer === target &&
                this.rustAssignmentWritesWholeLocal(holder.initializer, declaration)) {
                stable = false;
                break;
            }
        }
        return { stable, uses };
    }

    /** True when this assignment target writes the local ITSELF (`x = ..`,
     *  `[x, y] = ..`, `({x} = ..)`), as opposed to a write *into* it
     *  (`x['k'] = ..`, kind-preserving). */
    private rustAssignmentWritesWholeLocal(left: Node, declaration: VariableDeclaration): boolean {
        if (isIdentifier(left)) {
            return this.rustIdentifierRefersToDeclaration(left, declaration);
        }
        if (isParenthesizedExpression(left)) {
            return this.rustAssignmentWritesWholeLocal(left.expression, declaration);
        }
        if (isArrayLiteralExpression(left)) {
            return left.elements.some((element) => this.rustAssignmentWritesWholeLocal(element, declaration));
        }
        if (isObjectLiteralExpression(left)) {
            return left.properties.some((property) => {
                if (!isShorthandPropertyAssignment(property)) return false;
                return this.rustAssignmentWritesWholeLocal(property.name, declaration);
            });
        }
        return false;
    }

    /** One use of a dict-proven local: an element-access chain (`x['k']`, also
     *  the `x['k'] = v` write), a kind-preserving mutator (`x.push(v)`,
     *  `delete x[k]`), or something that would need the local to still be a
     *  `Value`. */
    private rustDictLocalClassifyUse(node: Node, uses: { elementAccess: number, mutHelper: number, other: number }): void {
        const isAccessOf = (p: any, c: Node) => p !== undefined &&
            (isElementAccessExpression(p) || isPropertyAccessExpression(p)) && p.expression === c;
        let current: any = node;
        const parent: any = current.parent;
        if (isAccessOf(parent, current)) {
            while (isAccessOf(current.parent, current)) current = current.parent;
            if (isElementAccessExpression(current)) uses.elementAccess++;
            else uses.other++; // `x.field` on a dict value
        } else if (parent !== undefined && (isDeleteExpression(parent) || (isCallExpression(parent) &&
            isPropertyAccessExpression(parent.expression) && parent.expression.expression === current &&
            parent.expression.name.text === 'push'))) {
            uses.mutHelper++;
        } else {
            uses.other++;
        }
    }


    printPropertyDeclaration(node, identation) {
        const name = this.printNode(node.name, 0);
        if (node.initializer) {
            const init = this.printNode(node.initializer, 0);
            return `${this.getIden(identation)}${name}: Value, // default: ${init}`;
        }
        return `${this.getIden(identation)}${name}: Value,`;
    }

    // Collect property declarations with their initializers for use in new()
    getStructFields(node): Array<{ name: string, init: string }> {
        return node.members.filter(m => m.kind === SyntaxKind.PropertyDeclaration).map(p => ({
            name: this.printNode(p.name, 0),
            init: p.initializer ? this.printNode(p.initializer, 0) : 'Value::Null',
        }));
    }

    printStruct(node, identation) {
        const fieldLines = this.getStructFields(node).map(f => `${this.getIden(identation + 1)}pub ${f.name}: Value,`).join('\n');
        return `#[derive(Debug, Clone)]\npub struct ${this.className} {\n${fieldLines}\n}`;
    }

    printNewMethod(node, identation) {
        const fieldInits = this.getStructFields(node).map(f => `${this.getIden(identation + 2)}${f.name}: ${f.init},`).join('\n');
        return `\nimpl ${this.className} {\n${this.getIden(identation + 1)}pub fn new() -> Self {\n${this.getIden(identation + 2)}${this.className} {\n${fieldInits}\n${this.getIden(identation + 2)}}\n${this.getIden(identation + 1)}}\n}`;
    }

    printClass(node, identation) {
        this.rustPrefetchClassTypes(node);
        this.className = node.name.text;

        // First pass: collect method signatures for optional param handling. A class's own
        // fixed-arity method drops a same-named signature left by an earlier file.
        const methods = node.members.filter(m => m.kind === SyntaxKind.MethodDeclaration);
        methods.forEach((method: any) => {
            const requiredCount = method.parameters.filter(p => !p.initializer && !p.questionToken).length;
            if (requiredCount < method.parameters.length) {
                this.methodSignatures[method.name.text] = { requiredCount };
            } else if (method.body !== undefined) {
                delete this.methodSignatures[method.name.text];
            }
        });

        const struct = this.printStruct(node, identation);
        const newMethod = this.printNewMethod(node, identation);
        const classMethods = methods.map(m => this.printMethodDeclaration(m, identation)).join('\n\n');
        return struct + newMethod + `\nimpl ${this.className} {\n${classMethods}\n}`;
    }

    printMethodDefinition(node, identation) {
        const name = (node.name as any).text;
        const typed = this.rustTypedSignature(node);
        if (typed !== undefined) {
            const args = ['&self', ...typed.params.map(p => `${p.name}: ${p.rustType}`)].join(', ');
            return `${this.getIden(identation + 1)}pub fn ${name}(${args}) -> crate::Result<${typed.ret}>`;
        }
        const params = node.parameters;
        const requiredParams = params.filter(p => !p.initializer && !p.questionToken);
        let parsedArgs = ['&self', ...requiredParams.map(p => `${this.printNode(p.name, 0)}: ${this.rustParamType(p)}`)].join(', ');
        if (requiredParams.length < params.length) {
            parsedArgs += ', optional_args: &[Value]';
        }
        const returnType = this.printRustFunctionType(node);
        const retStr = returnType ? ` -> ${returnType}` : '';
        return `${this.getIden(identation + 1)}pub fn ${name}(${parsedArgs})${retStr}`;
    }

    // Typed public parameter for a unified-method TS parameter, with its lowering back to `Value`.
    private static rustTypedParam(p: any, name: string): { rustType: string, toValue: string } | undefined {
        const ts = String(p.type?.getText?.() ?? '').replace(/\s+/g, '');
        const optional = p.initializer !== undefined || p.questionToken !== undefined;
        if ((ts === 'Dict' || ts === 'fetchEventsParams') && optional) return { rustType: 'impl Into<crate::Params> + Send', toValue: `${name}.into().into_value()` };
        if (ts === 'string' && !optional) return { rustType: '&str', toValue: `Value::from(${name})` };
        // an optional string (`Str`, `string = '1m'`, untyped `= '1m'`) is `None` for the declared default
        const strDefault = ts === '' && p.initializer?.kind === SyntaxKind.StringLiteral;
        if (((ts === 'Str' || ts === 'string' || strDefault) && optional) || ts === 'Str') return { rustType: 'Option<&str>', toValue: `${name}.map(Value::from).unwrap_or_default()` };
        if (ts === 'Int' && optional) return { rustType: 'Option<i64>', toValue: `Value::from(${name})` };
        if (ts === 'int' && !optional) return { rustType: 'i64', toValue: `Value::from(${name})` };
        if (ts === 'Strings' && optional) return { rustType: 'Option<Vec<String>>', toValue: `Value::from(${name})` };
        if ((ts === 'OrderType' || ts === 'OrderSide') && !optional) return { rustType: '&str', toValue: `Value::from(${name})` };
        if (ts === 'number' && !optional) return { rustType: 'f64', toValue: `Value::from(${name})` };
        if (ts === 'Num' && optional) return { rustType: 'Option<f64>', toValue: `Value::from(${name})` };
        if (ts === 'string[]' && !optional) return { rustType: 'Vec<String>', toValue: `Value::from(Some(${name}))` };
        if (ts === 'string[][]' && !optional) return { rustType: 'Vec<Vec<String>>', toValue: `Value::from(Some(${name}))` };
        if ((ts === 'OrderRequest[]' || ts === 'PredictionOrderRequest[]') && !optional) return { rustType: 'Vec<crate::types::OrderRequest>', toValue: `crate::types::IntoRaw::into_raw(${name})` };
        return undefined;
    }

    // Unified return kind -> Rust type; the body's `Value` result decodes through `types::FromRaw`.
    private static readonly RUST_TYPED_RETURNS: Record<string, string> = {
        fetchTicker: 'crate::types::Ticker',
        fetchTickers: 'crate::types::Tickers',
        fetchOrderBook: 'crate::types::OrderBook',
        fetchTrades: 'Vec<crate::types::Trade>',
        fetchOHLCV: 'Vec<crate::types::OHLCV>',
        fetchOrder: 'crate::types::Order',
        fetchOrders: 'Vec<crate::types::Order>',
        fetchOpenOrders: 'Vec<crate::types::Order>',
        fetchClosedOrders: 'Vec<crate::types::Order>',
        fetchMyTrades: 'Vec<crate::types::Trade>',
        createOrder: 'crate::types::Order',
        editOrder: 'crate::types::Order',
        cancelOrder: 'crate::types::Order',
        cancelOrders: 'Vec<crate::types::Order>',
        cancelAllOrders: 'Vec<crate::types::Order>',
        fetchOpenOrder: 'crate::types::Order',
        fetchClosedOrder: 'crate::types::Order',
        fetchCanceledOrders: 'Vec<crate::types::Order>',
        fetchCanceledAndClosedOrders: 'Vec<crate::types::Order>',
        fetchOrderTrades: 'Vec<crate::types::Trade>',
        createOrders: 'Vec<crate::types::Order>',
        editOrders: 'Vec<crate::types::Order>',
        createLimitOrder: 'crate::types::Order',
        createMarketOrder: 'crate::types::Order',
        createLimitBuyOrder: 'crate::types::Order',
        createLimitSellOrder: 'crate::types::Order',
        createMarketBuyOrder: 'crate::types::Order',
        createMarketSellOrder: 'crate::types::Order',
        createMarketOrderWithCost: 'crate::types::Order',
        createMarketBuyOrderWithCost: 'crate::types::Order',
        createMarketSellOrderWithCost: 'crate::types::Order',
        createPostOnlyOrder: 'crate::types::Order',
        createReduceOnlyOrder: 'crate::types::Order',
        createStopOrder: 'crate::types::Order',
        createStopLimitOrder: 'crate::types::Order',
        createStopMarketOrder: 'crate::types::Order',
        createStopLossOrder: 'crate::types::Order',
        createTakeProfitOrder: 'crate::types::Order',
        createTriggerOrder: 'crate::types::Order',
        createTrailingAmountOrder: 'crate::types::Order',
        createTrailingPercentOrder: 'crate::types::Order',
        createOrderWithTakeProfitAndStopLoss: 'crate::types::Order',
        createTwapOrder: 'crate::types::Order',
        fetchBalance: 'crate::types::Balances',
        fetchMarkets: 'Vec<crate::types::Market>',
        fetchCurrencies: 'crate::types::Currencies',
        fetchPositions: 'Vec<crate::types::Position>',
        fetchPosition: 'crate::types::Position',
        watchTicker: 'crate::types::Ticker',
        watchTickers: 'crate::types::Tickers',
        watchOrderBook: 'crate::types::OrderBook',
        watchTrades: 'Vec<crate::types::Trade>',
        watchOHLCV: 'Vec<crate::types::OHLCV>',
        watchOrders: 'Vec<crate::types::Order>',
        watchBalance: 'crate::types::Balances',
        fetchDeposits: 'Vec<crate::types::Transaction>',
        fetchWithdrawals: 'Vec<crate::types::Transaction>',
        fetchDepositsWithdrawals: 'Vec<crate::types::Transaction>',
        fetchTransactions: 'Vec<crate::types::Transaction>',
        fetchDepositAddress: 'crate::types::DepositAddress',
        fetchDepositAddresses: 'Vec<crate::types::DepositAddress>',
        withdraw: 'crate::types::Transaction',
        transfer: 'crate::types::Transfer',
        fetchTransfers: 'Vec<crate::types::Transfer>',
        fetchLedger: 'Vec<crate::types::LedgerEntry>',
        fetchTradingFee: 'crate::types::TradingFee',
        fetchTradingFees: 'crate::types::TradingFees',
        fetchDepositWithdrawFees: 'crate::types::DepositWithdrawFees',
        fetchFundingRate: 'crate::types::FundingRate',
        fetchFundingRates: 'crate::types::FundingRates',
        fetchFundingRateHistory: 'Vec<crate::types::FundingRateHistory>',
        fetchFundingHistory: 'Vec<crate::types::FundingHistory>',
        fetchLeverage: 'crate::types::Leverage',
        fetchLeverages: 'crate::types::Leverages',
        setLeverage: 'Value',
        setMarginMode: 'Value',
        fetchMarginMode: 'crate::types::MarginMode',
        fetchMarginModes: 'crate::types::MarginModes',
        addMargin: 'crate::types::MarginModification',
        reduceMargin: 'crate::types::MarginModification',
        fetchOpenInterest: 'crate::types::OpenInterest',
        fetchOpenInterestHistory: 'Vec<crate::types::OpenInterest>',
        fetchMarkPrice: 'crate::types::Ticker',
        fetchMarkPrices: 'crate::types::Tickers',
        fetchLiquidations: 'Vec<crate::types::Liquidation>',
        fetchMyLiquidations: 'Vec<crate::types::Liquidation>',
        fetchPositionsHistory: 'Vec<crate::types::Position>',
        closePosition: 'crate::types::Order',
        closeAllPositions: 'Vec<crate::types::Position>',
        fetchLeverageTiers: 'crate::types::LeverageTiers',
        fetchMarketLeverageTiers: 'Vec<crate::types::LeverageTier>',
        fetchGreeks: 'crate::types::Greeks',
        fetchOption: 'crate::types::OptionContract',
        fetchOptionChain: 'crate::types::OptionChain',
        fetchBidsAsks: 'crate::types::Tickers',
        fetchLastPrices: 'crate::types::LastPrices',
        fetchStatus: 'crate::types::Status',
        fetchTime: 'Option<i64>',
        watchTradesForSymbols: 'Vec<crate::types::Trade>',
        watchMyTrades: 'Vec<crate::types::Trade>',
        watchMyTradesForSymbols: 'Vec<crate::types::Trade>',
        watchOrderBookForSymbols: 'crate::types::OrderBook',
        watchOHLCVForSymbols: 'crate::types::OHLCVsBySymbol',
        watchOrdersForSymbols: 'Vec<crate::types::Order>',
        watchPosition: 'crate::types::Position',
        watchPositions: 'Vec<crate::types::Position>',
        watchPositionForSymbols: 'Vec<crate::types::Position>',
        watchBidsAsks: 'crate::types::Tickers',
        watchLiquidations: 'Vec<crate::types::Liquidation>',
        watchLiquidationsForSymbols: 'Vec<crate::types::Liquidation>',
        watchMyLiquidations: 'Vec<crate::types::Liquidation>',
        watchMyLiquidationsForSymbols: 'Vec<crate::types::Liquidation>',
        watchFundingRate: 'crate::types::FundingRate',
        watchFundingRates: 'crate::types::FundingRates',
        watchFundingRatesForSymbols: 'crate::types::FundingRates',
        watchMarkPrice: 'crate::types::Ticker',
        watchMarkPrices: 'crate::types::Tickers',
        createOrderWs: 'crate::types::Order',
        editOrderWs: 'crate::types::Order',
        cancelOrderWs: 'crate::types::Order',
        cancelAllOrdersWs: 'Vec<crate::types::Order>',
        fetchOrderWs: 'crate::types::Order',
        fetchOrdersWs: 'Vec<crate::types::Order>',
        fetchOpenOrdersWs: 'Vec<crate::types::Order>',
        fetchClosedOrdersWs: 'Vec<crate::types::Order>',
        fetchOrdersByStatusWs: 'Vec<crate::types::Order>',
        fetchMyTradesWs: 'Vec<crate::types::Trade>',
        fetchTradesWs: 'Vec<crate::types::Trade>',
        fetchTickerWs: 'crate::types::Ticker',
        fetchTickersWs: 'crate::types::Tickers',
        fetchOrderBookWs: 'crate::types::OrderBook',
        fetchOHLCVWs: 'Vec<crate::types::OHLCV>',
        fetchBalanceWs: 'crate::types::Balances',
        fetchPositionWs: 'Vec<crate::types::Position>',
        fetchPositionsWs: 'Vec<crate::types::Position>',
        fetchPositionsForSymbolWs: 'Vec<crate::types::Position>',
        fetchTradingFeesWs: 'crate::types::TradingFees',
        fetchDepositsWs: 'Vec<crate::types::Transaction>',
        fetchWithdrawalsWs: 'Vec<crate::types::Transaction>',
        fetchCurrenciesWs: 'crate::types::Currencies',
        fetchMarketsWs: 'Vec<crate::types::Market>',
        fetchEvents: 'Vec<crate::types::PredictionEvent>',
        fetchEvent: 'crate::types::PredictionEvent',
        fetchSettlements: 'Vec<crate::types::PredictionSettlement>',
        // unsubscribe acks are untyped (`Promise<any>`)
        unWatchBidsAsks: 'crate::Value',
        unWatchFundingRate: 'crate::Value',
        unWatchFundingRates: 'crate::Value',
        unWatchMarkPrice: 'crate::Value',
        unWatchMarkPrices: 'crate::Value',
        unWatchMyTrades: 'crate::Value',
        unWatchOHLCV: 'crate::Value',
        unWatchOHLCVForSymbols: 'crate::Value',
        unWatchOrderBook: 'crate::Value',
        unWatchOrderBookForSymbols: 'crate::Value',
        unWatchOrders: 'crate::Value',
        unWatchPositions: 'crate::Value',
        unWatchTicker: 'crate::Value',
        unWatchTickers: 'crate::Value',
        unWatchTrades: 'crate::Value',
        unWatchTradesForSymbols: 'crate::Value',
    };

    // The typed signature of a unified method listed in `config.typedUnified`, when every parameter maps;
    // the same shape for the base, prediction-base and every override, so the trait and inherents agree.
    rustTypedSignature(node): { params: Array<{ name: string, rustType: string, toValue: string, optional: boolean }>, ret: string } | undefined {
        if (node?.kind !== SyntaxKind.MethodDeclaration || node.body === undefined) return undefined;
        const name = String(node.name?.text ?? '');
        const ret = RustTranspiler.RUST_TYPED_RETURNS[name];
        if (ret === undefined || !this.rustTypedUnified.has(name)) return undefined;
        const file = String(node.getSourceFile?.()?.fileName ?? '');
        if (!/ts[/]src[/]/.test(file) || /ts[/]src[/]test[/]/.test(file)) return undefined;
        const params: Array<{ name: string, rustType: string, toValue: string, optional: boolean }> = [];
        for (const p of Array.from(node.parameters) as any[]) {
            const printed = this.printNode(p.name, 0).replace(/^mut\s+/, '');
            const t = RustTranspiler.rustTypedParam(p, printed);
            if (t === undefined) return undefined;
            params.push({ name: printed, optional: p.initializer !== undefined || p.questionToken !== undefined, ...t });
        }
        return { params, ret };
    }

    // The typed arguments lower to `Value` (`__args`, the derived-dispatch payload) and rebind as the `Value` body's
    // locals; `call_typed` turns its panics into `Err` and the result decodes through `types::FromRaw`.
    rustTypedBody(node, typed, identation: number, inner: string): string {
        const required = typed.params.filter(p => !p.optional);
        const lowered = [...required, ...typed.params.filter(p => p.optional)].map(p => p.toValue).join(', ');
        const i1 = this.getIden(identation + 1);
        const i2 = this.getIden(identation + 2);
        // the required parameters rebind by position (each is a `Value`, as the untyped signature declared it)
        const binds = required.map(p => `${i2}let mut ${p.name} = __it.next().unwrap_or_default();\n`).join('');
        return ` {\n${i2}let __args: Vec<Value> = vec![${lowered}];\n`
            + `${i2}let mut __it = __args.into_iter();\n`
            + binds
            + `${i2}let __optional_args: Vec<Value> = __it.collect();\n`
            + `${i2}Ok(crate::types::FromRaw::from_raw(crate::runtime::call_typed(async move {\n`
            + `${i2}let optional_args: &[Value] = &__optional_args;\n${inner}\n${i2}Value::Null\n`
            + `${i2}}).await?))\n${i1}}`;
    }

    // `await this.<typed unified>(args)` inside a `Value` body: bind each argument, call the typed method and
    // box the `Result` back to `Value` (an `Err` re-raises as the panic the untyped call raised).
    printTypedUnifiedCall(node): string | undefined {
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        // awaited directly, or an element of an awaited `Promise.all ([..])` array (each element is awaited in turn)
        const awaited = node.parent?.kind === SyntaxKind.AwaitExpression || node.parent?.kind === SyntaxKind.ArrayLiteralExpression;
        if (!this.rustTypedUnified.has(callee.name.text) || !awaited) return undefined;
        let decl: any;
        try {
            decl = signatureDeclaration((this.getChecker() as any).getResolvedSignature(node));
        } catch (e) {
            return undefined;
        }
        decl = decl?.resolve?.() ?? decl;
        if (decl !== undefined && decl.body === undefined) {
            decl = decl.parent?.members?.find((m: any) => m.kind === SyntaxKind.MethodDeclaration && m.body !== undefined && m.name?.text === callee.name.text);
        }
        const typed = this.rustTypedSignature(decl);
        if (typed === undefined) return undefined;
        const args = Array.from(node.arguments) as any[];
        const printed = typed.params.map((p, i) => {
            const absent = args[i] === undefined || args[i].kind === SyntaxKind.UndefinedKeyword || (isIdentifier(args[i]) && args[i].text === 'undefined');
            if (absent) return p.rustType.startsWith('impl') ? 'Value::Null' : 'None';
            const lit = RustTranspiler.rustTypedLiteralArg(args[i], p.rustType);
            if (lit !== undefined) return lit;
            const v = this.printNode(args[i], 0).trim();
            const recv = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(v) ? v : `(${v})`;
            if (p.rustType === '&str') return `${recv}.as_str().unwrap_or_default()`;
            if (p.rustType === 'Option<&str>') return `${recv}.as_str()`;
            if (p.rustType === 'Option<i64>') return `${recv}.as_i64()`;
            if (p.rustType === 'i64') return `${recv}.as_i64().unwrap_or_default()`;
            if (p.rustType === 'f64') return `${recv}.as_f64().unwrap_or_default()`;
            if (p.rustType === 'Option<f64>') return `${recv}.as_f64()`;
            if (p.rustType === 'Vec<String>') return `${recv}.to_str_vec()`;
            if (p.rustType === 'Vec<Vec<String>>') return `${recv}.to_str_vec_vec()`;
            if (p.rustType === 'Option<Vec<String>>') return `${recv}.to_opt_str_vec()`;
            if (p.rustType === 'Vec<crate::types::OrderRequest>') return `crate::types::FromRaw::from_raw(${RustTranspiler.cloneIfBareLocal(v)})`;
            return RustTranspiler.cloneIfBareLocal(v);
        });
        return `crate::types::IntoRaw::into_raw(self.${this.toSnakeCaseName(callee.name.text)}(${printed.join(', ')}).await)`;
    }

    // A literal argument of a typed unified call printed in the parameter's native type (`'market'` -> `"market"`).
    private static rustTypedLiteralArg(arg: any, rustType: string): string | undefined {
        const optional = rustType.startsWith('Option<');
        if (optional && (arg.kind === SyntaxKind.UndefinedKeyword || (arg.kind === SyntaxKind.Identifier && arg.text === 'undefined'))) return 'None';
        if (arg.kind === SyntaxKind.StringLiteral && (rustType === '&str' || rustType === 'Option<&str>')) {
            const lit = JSON.stringify(arg.text);
            return optional ? `Some(${lit})` : lit;
        }
        const neg = arg.kind === SyntaxKind.PrefixUnaryExpression && arg.operator === SyntaxKind.MinusToken && arg.operand.kind === SyntaxKind.NumericLiteral;
        const num = arg.kind === SyntaxKind.NumericLiteral ? arg.text : (neg ? `-${arg.operand.text}` : undefined);
        if (num !== undefined && /^-?\d+(\.\d+)?$/.test(num) && (rustType === 'f64' || rustType === 'Option<f64>')) {
            const f = num.includes('.') ? num : `${num}.0`;
            return optional ? `Some(${f})` : f;
        }
        return undefined;
    }

    printRustFunctionType(node): string {
        // An internal `: Str` method that proves the conversion prints the
        // native `Option<String>` (its returns run the conversion; callers
        // box back where a `Value` is still needed).
        if (this.rustNativeStrReturnKind(node) === 'str') {
            return 'Option<String>';
        }
        try {
            const checker = this.getChecker();
            if (checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(node)).flags === TypeFlags.Void) return '';
        } catch (e) {
            // ignore
        }
        return 'Value';
    }

    printMethodDeclaration(node, identation) {
        const methodDef = this.printMethodDefinition(node, identation);
        const params = node.parameters;
        const optionalParams = params.filter(p => p.initializer !== undefined || p.questionToken !== undefined);

        // Build optional param initializations
        const optionalInits = optionalParams.map((p, idx) => {
            const defaultVal = p.initializer ? this.printNode(p.initializer, 0) : 'Value::Null';
            const name = this.printNode(p.name, 0);
            // A native-`bool` optional keeps the truthiness the use sites applied.
            if (this.rustParamPrintsBool(p)) {
                return `${this.getIden(identation + 2)}let ${name}: bool = get_arg(optional_args, ${idx}, ${defaultVal}).is_truthy();\n`;
            }
            return `${this.getIden(identation + 2)}let ${name} = get_arg(optional_args, ${idx}, ${defaultVal});\n`;
        }).join('');

        const blockOpen = this.getBlockOpen(identation);
        const blockClose = this.getBlockClose(identation);
        const shadows = this.rustParamShadowLines(node, identation + 2);
        // A `handle*` method's `message: Dict` param gets a borrowed
        // `&IndexMap` shadow so its `safe_*` reads print natively.
        const shadowPlan = this.rustProHandlerShadowPlan(node, identation);
        const savedShadowParam = this.rustProHandlerShadowParam;
        if (shadowPlan !== undefined) this.rustProHandlerShadowParam = shadowPlan.param;
        const statements = node.body.statements.map(s => this.printNode(s, identation + 2)).join('\n');
        this.rustProHandlerShadowParam = savedShadowParam;
        const typed = this.rustTypedSignature(node);
        if (typed !== undefined) {
            return this.printNodeCommentsIfAny(node, identation, methodDef + this.rustTypedBody(node, typed, identation, optionalInits + shadows + (shadowPlan?.lines ?? '') + statements));
        }
        const body = blockOpen + optionalInits + shadows + (shadowPlan?.lines ?? '') + statements + blockClose;

        return this.printNodeCommentsIfAny(node, identation, methodDef + body);
    }

    // A free test-helper function with defaulted trailing parameters (`ts/src/[pro/]test/Exchange/`):
    // they collapse into `optional_args: &[Value]` like a method's, read back as `Value::Null` defaults.
    rustFreeFnFirstDefault(node): number {
        if (node?.kind !== SyntaxKind.FunctionDeclaration || node.body === undefined) return -1;
        if (!/ts[/]src[/](?:pro[/])?test[/]Exchange[/]/.test(String(node.getSourceFile().fileName))) return -1;
        return Array.from(node.parameters).findIndex((p: any) => p.initializer !== undefined);
    }

    printFunctionDefinition(node, identation) {
        const name = node.name?.text ?? '';
        const firstDefault = this.rustFreeFnFirstDefault(node);
        const params = firstDefault < 0 ? node.parameters : node.parameters.slice(0, firstDefault);
        let parsedArgs = params.map(p => `${this.printNode(p.name, 0)}: Value`).join(', ');
        if (firstDefault >= 0) parsedArgs += `${parsedArgs ? ', ' : ''}optional_args: &[Value]`;
        const returnType = this.printRustFunctionType(node);
        const retStr = returnType ? ` -> ${returnType}` : '';
        // an `async function` in a REST exchange test stays `async fn` even when its body never awaits
        const isAsync = /ts[/]src[/]test[/]Exchange[/]/.test(String(node.getSourceFile().fileName))
            && (node.modifiers ?? []).some((m: any) => m.kind === SyntaxKind.AsyncKeyword);
        return `${this.getIden(identation)}${isAsync ? 'async ' : ''}fn ${name}(${parsedArgs})${retStr}`;
    }

    printFunctionDeclaration(node, identation) {
        if (isArrowFunction(node)) {
            const parameters = node.parameters.map(p => `${this.printNode(p.name, 0)}: Value`).join(', ');
            const body = this.printNode(node.body);
            return `|${parameters}| ${body}`;
        }
        const funcDef = this.printFunctionDefinition(node, identation);
        let funcBody = super.printFunctionBody(node, identation);
        const firstDefault = this.rustFreeFnFirstDefault(node);
        if (firstDefault >= 0) {
            const decls = node.parameters.slice(firstDefault).map((p, i) => `\n${this.getIden(identation + 1)}let mut ${this.printNode(p.name, 0)}: Value = get_arg(optional_args, ${i}, Value::Null);`).join('');
            funcBody = funcBody.replace('{', '{' + decls);
        }
        return this.printNodeCommentsIfAny(node, identation, funcDef + funcBody);
    }

    printOutOfOrderCallExpressionIfAny(node, identation) {
        if (node.expression.kind !== SyntaxKind.PropertyAccessExpression) {
            return undefined;
        }

        const expr = node.expression;
        const args = node.arguments;

        if (expr.expression.kind === SyntaxKind.ThisKeyword) {
            const implicitApi = this.printImplicitApiCall(node, expr.name.text, identation);
            if (implicitApi !== undefined) return implicitApi;
        }
        if (expr.expression.kind === SyntaxKind.ThisKeyword && !this.methodSignatures[expr.name.text]) {
            return this.printRuntimeVariadicCall(node, 'self', expr.name.text, identation)
                ?? this.printTranspiledVariadicCall(node, 'self', expr.name.text, identation);
        }
        if (isIdentifier(expr.expression) && this.rustCallsTestExchange(node)) {
            return this.printRuntimeVariadicCall(node, this.printNode(expr.expression, 0), expr.name.text, identation, true, true);
        }
        if (isIdentifier(expr.expression) && this.rustCallsRuntimeHandle(node)) {
            return this.printRuntimeVariadicCall(node, this.printNode(expr.expression, 0), expr.name.text, identation, false, true);
        }
        // a ws class reaches its REST parent's methods through `self.parent`; REST `super_*` shims are fixed-arity except the network ones
        if (expr.expression.kind === SyntaxKind.SuperKeyword && (/ts[/]src[/]pro[/]/.test(String(node.getSourceFile().fileName))
            || /^network(?:CodeToId|IdToCode)$/.test(expr.name.text))) {
            return this.printRuntimeVariadicCall(node, 'super', expr.name.text, identation)
                ?? this.printTranspiledVariadicCall(node, 'super', expr.name.text, identation);
        }

        // Handle this.method(...) calls with optional params
        if (expr.expression.kind === SyntaxKind.ThisKeyword) {
            const methodName = expr.name.text;
            const sig = this.methodSignatures[methodName];
            if (sig) {
                const calleeParams = this.rustCalleeParams(node);
                const printArg = (a, at) => this.rustNativeMapArgumentSlot(calleeParams, at) !== undefined
                    ? this.rustMapArgumentText(a, 0)
                    : this.rustNativeStrVecArgumentSlot(calleeParams, at)
                        ? this.rustStrVecArgumentText(a, 0)
                        : (this.rustNativeBoolArgumentSlot(calleeParams, at)
                            ? this.rustBoolArgumentText(a, 0)
                            : this.printNode(a, 0));
                const printArgs = (list, from = 0) => list.map((a, i) => printArg(a, from + i)).join(', ');
                const requiredArgs = printArgs(args.slice(0, sig.requiredCount));
                const reqPart = requiredArgs ? `${requiredArgs}, ` : '';
                return `self.${methodName}(${reqPart}&[${printArgs(args.slice(sig.requiredCount), sig.requiredCount)}])`;
            }
        }

        return undefined;
    }

    /** A bare local name (not `self`/`true`/`false`): passing it by value needs a `.clone()`. */
    static isBareLocal(text: string): boolean {
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) && text !== 'self' && text !== 'true' && text !== 'false';
    }

    /** `text.clone()` for a bare local, else `otherwise` (default: the text itself). */
    static cloneIfBareLocal(text: string, otherwise: string = text): string {
        return RustTranspiler.isBareLocal(text) ? `${text}.clone()` : otherwise;
    }

    // Hand-written runtime methods (`exchange_stubs.rs`, `exchange.rs`, the ws `Client`/`Future` handles) take a
    // fixed number of positional `Value`s plus `optional_args: &[Value]`; their TS declarations (field aliases,
    // above-marker bodies) do not carry that arity, so it is listed here by Rust name.
    private static readonly RUST_RUNTIME_VARIADIC_ARITY: Map<string, number> = new Map(([
        [0, 'sum is_json_encoded_object uuid uuid16 uuid22 safe_market create_safe_dictionary create_safe_list ' +
            'parse_precision network_id_to_code fetch_balance fetch_positions fetch_ledger fetch_last_prices ' +
            'fetch_withdrawals fetch_transactions fetch_trading_fees sign_in load_markets fetch_tickers fetch_status ' +
            'fetch_orders fetch_open_orders fetch_order_books client spawn order_book indexed_order_book ' +
            'counted_order_book safe_order_tracker market_symbols future call resolve reject ' +
            'check_required_credentials send lock_id unlock_id lock_last_nonce unlock_last_nonce ' +
            'extend_exchange_options on_error on_close on_pong crc32 load_order_book load_accounts market_ids ' +
            'decode_proto_msg get_market_from_symbols '],
        [1, 'remove_repeated_elements_from_array string_to_base64 base16_to_binary base58_to_binary base64_to_binary ' +
            'binary_to_base58 binary_to_base16 binary_to_base64 binary_to_string binary_length number_to_be ' +
            'parse_date is_binary_message string_to_binary urlencode_base64 urlencode_nested strip sort ' +
            'eth_get_address_from_private_key int_to_base16 packb yymmdd yyyymmdd ymd ymdhms rawencode ' +
            'safe_currency_code safe_currency safe_symbol safe_trade safe_order safe_order2 safe_ticker urlencode ' +
            'network_code_to_id handle_market_type_and_params handle_sub_type_and_params ' +
            'handle_margin_mode_and_params binary_concat totp extend deep_extend keysort parse_number create_orders ' +
            'fetch_ticker fetch fetch_trading_fee fetch_trades fetch_order_book delay un_watch ' +
            'fetch_rest_order_book_safe parse_ticker parse_ohlcv parse_funding_rate parse_position find_timeframe ' +
            'exception_message is_linear is_inverse filter_by_since_limit filter_by_symbol_since_limit ' +
            'filter_by_symbols_since_limit parse_balance_custom parse_orders parse_trades parse_ohlc_vs parse_order ' +
            'parse_trade parse_position_risk safe_liquidation '],
        [2, 'safe_value safe_value_n safe_string safe_string_n safe_string_upper safe_string_lower ' +
            'safe_string_lower_n safe_string_upper_n safe_integer safe_integer_n safe_float safe_timestamp ' +
            'safe_timestamp_n safe_float_n safe_bool safe_bool_n safe_dict safe_list safe_list_n safe_dict_n ' +
            'safe_integer_omit_zero safe_number_omit_zero safe_number safe_number_n hash omit sort_by group_by ' +
            'array_slice watch watch_multiple handle_user_data_stream_subscribe handle_option handle_param_string ' +
            'filter_by_array filter_by_array_positions filter_by_array_tickers filter_by_array_adl_ranks ' +
            'currency_to_precision parse_order_book '],
        [3, 'safe_value2 safe_string2 safe_string_upper2 safe_string_lower2 safe_integer2 safe_timestamp2 ' +
            'safe_integer_product safe_integer_product_n safe_float2 safe_bool2 safe_dict2 safe_list2 safe_number2 ' +
            'handle_request_network handle_option_and_params handle_option_string_and_params ' +
            'handle_option_bool_and_params handle_option_integer_and_params hmac ecdsa eddsa jwt rsa sort_by2 ' +
            'filter_by decimal_to_precision clean_unsubscription handle_param_string2 '],
        [4, 'safe_integer_product2 handle_option_and_params2 handle_option_string_and_params2 ' +
            'handle_option_bool_and_params2 handle_option_integer_and_params2 create_order '],
    ] as [number, string][]).flatMap(([arity, names]) => names.trim().split(/\s+/).map((n) => [n, arity] as [string, number])));

    // The test crate's `ExchangeOps` trait declares these two with fixed signatures and adds two variadic base methods.
    private static readonly RUST_TEST_VARIADIC_ARITY: Map<string, number | undefined> = new Map([
        ['extend_exchange_options', undefined], ['exception_message', undefined], ['fetch2', 1], ['build_ohlcvc', 1],
    ]);

    printRuntimeVariadicCall(node, receiver: string, methodName: string, identation: number, testCrate = false, handleProven = false): string | undefined {
        if (!handleProven && !this.rustCalleeIsRuntimeBase(node)) return undefined;
        const name = this.toSnakeCaseName(methodName);
        const fixed = testCrate && RustTranspiler.RUST_TEST_VARIADIC_ARITY.has(name)
            ? RustTranspiler.RUST_TEST_VARIADIC_ARITY.get(name) : RustTranspiler.RUST_RUNTIME_VARIADIC_ARITY.get(name);
        if (fixed === undefined) return undefined;
        return this.printOptionalArgsSliceCall(node, receiver, methodName, fixed, identation);
    }

    // `receiver.m(a0..a{fixed-1}, &[rest])`; bare locals are cloned so a local reused by a later call is not moved.
    printOptionalArgsSliceCall(node, receiver: string, methodName: string, fixed: number, identation: number): string | undefined {
        const args = this.rustPrintedArgs(node, identation);
        if (args.length < fixed || (args.length > 0 && args[args.length - 1].startsWith('&['))) return undefined;
        const cloned = args.map((a) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(a) && a !== 'self' ? `${a}.clone()` : a);
        return `${receiver}.${methodName}(${cloned.slice(0, fixed).join(', ')}${fixed > 0 ? ', ' : ''}&[${cloned.slice(fixed).join(', ')}])`;
    }

    // The callee is declared in `ts/src/base/` (a base method, or a base field aliasing a helper);
    // a same-named method of the class itself keeps its own signature.
    rustCalleeIsRuntimeBase(node): boolean {
        let decl: any;
        try {
            decl = signatureDeclaration((this.getChecker() as any).getResolvedSignature(node));
        } catch (e) {
            return false;
        }
        decl = decl?.resolve?.() ?? decl;
        if (decl !== undefined && /ts[/]src[/]base[/]/.test(String(decl.getSourceFile?.()?.fileName ?? ''))) return true;
        // `base64ToBinary = base64ToBinary`: the property is declared on the base class, its function elsewhere
        const symbol: any = this.getChecker().getSymbolAtLocation(node.expression.name ?? node.expression);
        const member: any = symbol === undefined ? undefined : symbolDeclarations(symbol)?.[0];
        return member !== undefined && /ts[/]src[/]base[/]/.test(String(member.getSourceFile?.()?.fileName ?? ''));
    }

    // `exchange.m(..)` in a test source, the receiver typed as the base `Exchange` class.
    rustCallsTestExchange(node): boolean {
        if (!/ts[/]src[/]test[/]/.test(String(node.getSourceFile().fileName))) return false;
        const type: any = this.getChecker().getTypeAtLocation(node.expression.expression);
        // test helpers take the instance as an untyped `exchange: any`
        if (type !== undefined && (type.flags & TypeFlags.Any) !== 0) return node.expression.expression.text === 'exchange';
        const symbol: any = type?.getSymbol?.();
        const decl: any = symbol === undefined ? undefined : symbolDeclarations(symbol)?.[0];
        return decl !== undefined && /ts[/]src[/]base[/]Exchange\.ts$/.test(String(decl.getSourceFile?.()?.fileName ?? ''));
    }

    // `client.resolve(..)`, `future.resolve(..)`, `method.call(..)`: the callee is a ws handle method,
    // `Function.call`, or a handle method on an `any` value; all are hand-written over `&[Value]`.
    rustCallsRuntimeHandle(node): boolean {
        let decl: any;
        try {
            decl = signatureDeclaration((this.getChecker() as any).getResolvedSignature(node));
        } catch (e) {
            return false;
        }
        decl = decl?.resolve?.() ?? decl;
        // an `any` receiver prints as a `Value`, whose handle methods are these four
        if (decl === undefined) return ['resolve', 'reject', 'future', 'call'].includes(node.expression.name.text)
            && (this.getChecker().getTypeAtLocation(node.expression.expression).flags & TypeFlags.Any) !== 0;
        const file = String(decl?.getSourceFile?.()?.fileName ?? '');
        if (/ts[/]src[/]base[/]ws[/](?:Client|Future)\.ts$/.test(file)) return true;
        return node.expression.name.text === 'call' && /lib\.[\w.]*\.d\.ts$/.test(file);
    }

    // `this.<endpoint>(params)` on an implicit-API method (declared in `ts/src/abstract/[prediction/]<id>.ts`):
    // the generated `<id>_api.rs` wrapper is `async fn <snake>(&mut self, args: &[Value])`, always awaited.
    printImplicitApiCall(node, methodName: string, identation: number): string | undefined {
        let decl: any;
        try {
            decl = signatureDeclaration((this.getChecker() as any).getResolvedSignature(node));
        } catch (e) {
            return undefined;
        }
        decl = decl?.resolve?.() ?? decl;
        if (decl === undefined || decl.kind !== SyntaxKind.MethodDeclaration) return undefined;
        if (!/ts[/]src[/]abstract[/]/.test(String(decl.getSourceFile?.()?.fileName ?? ''))) return undefined;
        const args = this.printArgsForCallExpression(node, identation);
        const awaited = node.parent?.kind === SyntaxKind.AwaitExpression;
        return `self.${this.toSnakeCaseName(methodName)}(&[${args}])${awaited ? '' : '.await'}`;
    }

    // A call to a transpiled method with optional parameters: its Rust signature is the required
    // parameters plus `optional_args: &[Value]`. Hand-written base helpers keep their own ABI.
    printTranspiledVariadicCall(node, receiver: string, methodName: string, identation: number): string | undefined {
        const params = this.rustTranspiledCalleeParams(node, methodName);
        if (params === undefined || params.some((p: any) => p.dotDotDotToken !== undefined)) return undefined;
        const required = params.filter((p: any) => !p.initializer && !p.questionToken).length;
        return required === params.length ? undefined : this.printOptionalArgsSliceCall(node, receiver, methodName, required, identation);
    }

    // Parameters of the method body a call binds to (the implementation behind an overload), when that
    // body is transpiled: any exchange class, or base `Exchange` below its transpile marker.
    rustTranspiledCalleeParams(node, methodName: string): any[] | undefined {
        let decl: any;
        try {
            decl = signatureDeclaration((this.getChecker() as any).getResolvedSignature(node));
        } catch (e) {
            return undefined;
        }
        decl = decl?.resolve?.() ?? decl;
        if (decl === undefined || decl.kind !== SyntaxKind.MethodDeclaration) return undefined;
        if (decl.body === undefined) {
            decl = decl.parent?.members?.find((m: any) => m.kind === SyntaxKind.MethodDeclaration && m.body !== undefined && m.name?.text === methodName);
            if (decl === undefined) return undefined;
        }
        const sourceFile = decl.getSourceFile?.();
        const file = String(sourceFile?.fileName ?? '');
        if (!/ts[/]src[/]/.test(file) || /ts[/]src[/](?:test|abstract|base[/]ws)[/]/.test(file)) return undefined;
        if (/ts[/]src[/]base[/]/.test(file)) {
            const marker = String(sourceFile.text ?? '').indexOf('METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT');
            if (marker < 0 || decl.end < marker) return undefined;
        }
        return Array.from(decl.parameters);
    }

    // Arguments in a native-`bool` parameter slot print a Rust `bool`, carrying
    // the truthiness the callee's own use sites applied.
    printArgsForCallExpression(node, identation) {
        const params = this.rustCalleeParams(node);
        if (params === undefined) {
            return super.printArgsForCallExpression(node, identation);
        }
        return this.rustPrintedArgs(node, identation, params).join(', ');
    }

    rustPrintedArgs(node, identation, params = this.rustCalleeParams(node)): string[] {
        if (params === undefined) return Array.from(node.arguments).map((a: any) => this.printNode(a, identation).trim());
        return Array.from(node.arguments).map((arg, at) => {
            if (this.rustNativeMapArgumentSlot(params, at) !== undefined) {
                return this.rustMapArgumentText(arg, identation);
            }
            if (this.rustNativeStrVecArgumentSlot(params, at)) {
                return this.rustStrVecArgumentText(arg, identation);
            }
            return this.rustNativeBoolArgumentSlot(params, at)
                ? this.rustBoolArgumentText(arg, identation)
                : this.printNode(arg, identation).trim();
        });
    }

    // `Math.X(..)` / `Precise.X(..)` call the runtime namespaces by reference; the Precise
    // wrappers take their TS arity without the optional precision (`stringDiv` keeps it as `stringDivPrec`).
    private static readonly RUST_PRECISE_TRIMMED = /^string(?:Div|Mul|Add|Sub|Mod|Eq|Gt|Ge|Lt|Le|Min|Max|Abs|Neg)$/;

    printRustNamespaceCall(node, identation): string | undefined {
        const callee: any = node.expression;
        if (!isPropertyAccessExpression(callee) || !isIdentifier(callee.expression)) return undefined;
        const ns = String(callee.expression.text);
        let name = String(callee.name.text);
        if (ns !== 'Math' && ns !== 'Precise') return undefined;
        if (ns === 'Math' && node.arguments.length === 1 && (name === 'round' || name === 'floor' || name === 'ceil')) return undefined;
        let args = this.rustPrintedArgs(node, identation).map((a) => a.trim());
        if (ns === 'Precise' && RustTranspiler.RUST_PRECISE_TRIMMED.test(name)) {
            if (name === 'stringDiv' && args.length >= 3) name = 'stringDivPrec';
            args = args.slice(0, name === 'stringDivPrec' ? 3 : (name === 'stringAbs' || name === 'stringNeg') ? 1 : 2);
        }
        const path = ns === 'Math' ? 'crate::runtime::Math' : 'crate::precise::Precise';
        return `${path}::${name}(${args.map((a) => a.startsWith('&') ? a : `&${a}`).join(', ')})`;
    }

    // The runtime signers have fixed arities: `jwt(request, secret, hash, isRsa, opts)`, `rsa(request, secret, hash)`.
    printRustSignerCall(node, identation): string | undefined {
        const callee: any = node.expression;
        if (!isIdentifier(callee) || (callee.text !== 'jwt' && callee.text !== 'rsa')) return undefined;
        const args = this.rustPrintedArgs(node, identation);
        if (callee.text === 'rsa') return `rsa(${args.slice(0, 3).join(', ')})`;
        const defaults = ['Value::Null', 'Value::Null', 'Value::Null', 'Value::Bool(false)', 'Value::Null'];
        const fixed = args.slice(0, 5);
        while (fixed.length < 5) fixed.push(defaults[fixed.length]);
        return `jwt(${fixed.join(', ')})`;
    }

    printCallExpression(node, identation) {
        const expression = node.expression;

        // `this.safeString(<shadowed param>, 'k')` — the read inlined against
        // the parameter shadow. Ahead of the optional-arg dispatch below,
        // which prints the call for any callee with optional parameters
        const shadowSafeRead = this.printShadowSafeReadCall(node);
        if (shadowSafeRead !== undefined) return shadowSafeRead;

        // `this.safe_*(message, "k")` on a shadowed WS-handler param —
        // the native `.get("k")` match replaces the `safe_*_k` helper call.
        // Checked first: the out-of-order path would print the boxed call for
        const shadowRead = this.printProHandlerShadowRead(node);
        if (shadowRead !== undefined) return shadowRead;

        // Handle console.log specially
        if (expression.kind === SyntaxKind.PropertyAccessExpression) {
            const exprText = expression.getText().trim();
            if (exprText === 'console.log') {
                const args = node.arguments;
                if (args.length === 1) {
                    const argText = this.printNode(args[0], 0).trim();
                    return `println_val(${argText.startsWith('&') ? argText : `&${argText}`})`;
                }
                // Multiple args: print each
                const argParts = Array.from(args).map(a => {
                    const t = this.printNode(a, 0).trim();
                    return t.startsWith('Value::') || !t.startsWith('&') ? `&${t}` : t;
                }).join(', ');
                return `println_val(${argParts})`;
            }
        }

        const typedCall = this.printTypedUnifiedCall(node);
        if (typedCall !== undefined) return typedCall;

        const dynamicCall = this.printDynamicSelfCall(node, identation);
        if (dynamicCall !== undefined) return dynamicCall;

        const selfCall = this.printSelfCallShape(node, identation);
        if (selfCall !== undefined) return selfCall;

        const valueSpawn = this.printValueSpawnCall(node, identation);
        if (valueSpawn !== undefined) return valueSpawn;

        const freeFnCall = this.printFreeFnDefaultArgsCall(node, identation);
        if (freeFnCall !== undefined) return freeFnCall;

        const outOfOrder = this.printOutOfOrderCallExpressionIfAny(node, identation);
        if (outOfOrder) {
            return this.rustBoxNativeStrCallIfNeeded(node, outOfOrder);
        }

        // `parseInt`/`parseFloat` on a checker-proven string: native `str::parse`
        // instead of the runtime helper the ccxt post-pass would emit.
        const nativeParse = this.printNativeParseCall(node);
        if (nativeParse !== undefined) return nativeParse;

        const runtimeCall = this.printRustNamespaceCall(node, identation) ?? this.printRustSignerCall(node, identation);
        if (runtimeCall !== undefined) return runtimeCall;

        // `this.json(v)`: `Exchange::json` is exactly the free `json_stringify`, which takes the value
        // by reference, so the call sites' `.clone()` is dropped. `self.<field>` args keep the method:
        // the post-pass hoisting `self.<method>(…)` out of `&mut self` args ignores a `&self.<field>`.
        if (expression.kind === SyntaxKind.PropertyAccessExpression &&
            expression.expression.kind === SyntaxKind.ThisKeyword &&
            expression.name.text === 'json' && node.arguments.length === 1) {
            const argText = this.printNode(node.arguments[0], 0).trim();
            if (!argText.includes('self.')) {
                const withoutClone = argText.replace(/\.clone\(\)$/, '');
                return `json_stringify(${this.ensureRef(withoutClone)})`;
            }
        }

        return this.rustBoxNativeStrCallIfNeeded(node, super.printCallExpression(node, identation));
    }

    // `helper(a, b)` to a free function with defaulted parameters: `helper(a, &[b])`, awaited when async.
    printFreeFnDefaultArgsCall(node, identation): string | undefined {
        if (!isIdentifier(node.expression)) return undefined;
        let decl: any;
        try {
            decl = signatureDeclaration((this.getChecker() as any).getResolvedSignature(node));
        } catch (e) {
            return undefined;
        }
        decl = decl?.resolve?.() ?? decl;
        const firstDefault = this.rustFreeFnFirstDefault(decl);
        if (firstDefault < 0) return undefined;
        const args = this.rustPrintedArgs(node, identation);
        const fixed = args.slice(0, firstDefault);
        const isAsync = (decl.modifiers ?? []).some((m: any) => m.kind === SyntaxKind.AsyncKeyword);
        const awaited = node.parent?.kind === SyntaxKind.AwaitExpression;
        return `${node.expression.text}(${[...fixed, `&[${args.slice(firstDefault).join(', ')}]`].join(', ')})${isAsync && !awaited ? '.await' : ''}`;
    }

    // `this[name]` with a variable key: `self.prop(&name)` resolves the field by name at runtime.
    // Write targets and call callees keep their own forms.
    printDynamicSelfRead(node): string | undefined {
        if (node.expression.kind !== SyntaxKind.ThisKeyword || !isIdentifier(node.argumentExpression)) return undefined;
        const parent = node.parent;
        if (isCallExpression(parent) && parent.expression === node) return undefined;
        if (isBinaryExpression(parent) && parent.left === node
            && parent.operatorToken.kind >= SyntaxKind.FirstAssignment && parent.operatorToken.kind <= SyntaxKind.LastAssignment) return undefined;
        return `self.prop(&${this.printNode(node.argumentExpression, 0)})`;
    }

    // `this[name](args)`: `call_dynamic_checked` snake-cases the name, dispatches, and raises
    // NotSupported when no arm or implicit endpoint matches. Args are cloned: pagination reuses them.
    printDynamicSelfCall(node, identation): string | undefined {
        const callee = node.expression;
        if (!isElementAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword || !isIdentifier(callee.argumentExpression)) return undefined;
        const args = Array.from(node.arguments).map((a: any) => `(${this.printNode(a, identation).trim()}).clone()`);
        return `self.call_dynamic_checked(${this.printNode(callee.argumentExpression, 0)}.clone(), vec![${args.join(', ')}])`;
    }

    printThisKeyword(node, identation) {
        return 'self';
    }

    // Native string args to the runtime error constructors, audited against
    // rust/ccxt-base/src/exchange_errors.rs: `msg` is `impl ToErrorMessage` (`&str`/`String`/`Value`
    // yield the same string) and `create_error`'s class name is `&str` (bare literal only).
    private static readonly RUST_ERROR_CONSTRUCTOR_ARGS: Record<string, ('msg' | 'str')[]> = {
        ...Object.fromEntries((
            'exchange_error authentication_error permission_denied account_not_enabled account_suspended ' +
            'arguments_required bad_request bad_symbol operation_rejected no_change margin_mode_already_set ' +
            'market_closed manual_interaction_needed restricted_location insufficient_funds invalid_address ' +
            'address_pending invalid_order order_not_found order_not_cached order_immediately_fillable ' +
            'order_not_fillable duplicate_order_id contract_unavailable not_supported invalid_proxy_settings ' +
            'exchange_closed_by_user operation_failed network_error d_do_s_protection rate_limit_exceeded ' +
            'exchange_not_available on_maintenance invalid_nonce checksum_error request_timeout bad_response ' +
            'null_response cancel_pending unsubscribe_error '
        ).trim().split(' ').map((n) => [n, ['msg']])),
        create_error: ['str', 'msg'],
    };

    // A string literal prints as the bare `"lit"` (`&str` — no String
    // allocation); a checker-proven string drops the redundant `Value::Str` box.
    printErrorConstructorArg(name: string, index: number, node, identation: number): string {
        const kind = (RustTranspiler as any).RUST_ERROR_CONSTRUCTOR_ARGS[name]?.[index];
        if (kind === undefined) {
            return this.printNode(node, identation);
        }
        if (isStringLiteral(node) && !(node.text in this.StringLiteralReplacements)) {
            return this.quotedStringLiteral(node.text);
        }
        const printed = this.printNode(node, identation).trim();
        if (kind !== 'msg' || !this.rustTypeIsString(node)) {
            return printed;
        }
        const payload = this.peelValueStrBox(printed)
            ?? this.peelValueStrBox(this.stripOuterParens(printed))
            ?? printed;
        // The `Value::Str(..)` box carries the `Cow` conversion; the error
        // ctors take an `impl ToErrorMessage` (String / &str / Value).
        return payload.replace(/\.into\(\)$/, '');
    }

    // `BadRequest` → `bad_request`: the class-to-runtime-fn name the ccxt
    // post-pass applies to `X::new(..)` calls.
    rustErrorConstructorName(className: string): string {
        return this.toSnakeCaseName(className);
    }

    printNewExpression(node, identation) {
        let expression = node.expression?.text;
        expression = expression ? expression : this.printNode(node.expression);
        // Plain `new Error(msg)` becomes just the message Value so it can be
        // formatted by `panic!("{:?}", ...)` in printThrowStatement.
        if (expression === 'Error') {
            const args = node.arguments.map(a => this.printNode(a, identation)).join(', ');
            return args || 'Value::Null';
        }
        // CCXT exception classes end in "Error", "Required", "Found", etc. and
        // are constructed via `new XError(msg)`. Route them through the runtime
        // error constructors (snake_case fn calls).
        const errorClassPattern = /^(?:[A-Z][a-zA-Z]*(?:Error|Required|Found|Failed|Rejected|Available|Exceeded|Limit|Pending|Funds|Address|Order|Cached|Fillable|Closed|Maintenance|Nonce|Timeout|Response|Settings|User|Supported|Implemented|Denied|Enabled|Suspended|Symbol|Change|Unavailable|Proxy|Set|Needed))$/;
        if (typeof expression === 'string' && (errorClassPattern.test(expression) || RustTranspiler.RUST_NAME_VALUE_IMPORTS.has(expression) && /^[A-Z]/.test(expression))) {
            const snake = this.rustErrorConstructorName(expression);
            const args = node.arguments.map((a, index) => this.printErrorConstructorArg(snake, index, a, identation)).join(', ');
            return `crate::exchange_errors::${snake}(${args})`;
        }
        // A class picked at runtime (`new table[k](msg)`, or a thrown local class value)
        // constructs by name through `create_error`; a value position keeps it boxed.
        const dynamicClass = this.rustDynamicErrorClass(node);
        if (dynamicClass !== undefined) {
            const args = node.arguments.map(a => this.printNode(a, identation)).join(', ');
            const built = `crate::exchange_errors::create_error(&crate::runtime::stringify_param(&(${dynamicClass})), &crate::runtime::stringify_param(&(${args})))`;
            return node.parent?.kind === SyntaxKind.ThrowStatement ? built : `Value::from(${built})`;
        }
        // Classes the ccxt post-pass routes to the same constructors — their
        // message argument is audited too; every other `X::new(..)` prints as
        // before.
        const args = typeof expression === 'string'
            ? node.arguments.map((a, index) => this.printErrorConstructorArg(this.rustErrorConstructorName(expression), index, a, identation)).join(', ')
            : node.arguments.map(a => this.printNode(a, identation)).join(', ');
        return `${expression}::new(${args})`;
    }

    /** Printed class expression of a `new` whose class is a runtime value, else undefined. */
    rustDynamicErrorClass(node): string | undefined {
        const target: any = node.expression;
        if (isElementAccessExpression(target)) return this.printNode(target, 0).trim();
        if (!isIdentifier(target) || node.parent?.kind !== SyntaxKind.ThrowStatement) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(target);
        if (declaration === undefined || !(isVariableDeclaration(declaration) || isParameterDeclaration(declaration) || isBindingElement(declaration))) return undefined;
        return this.printNode(target, 0).trim();
    }

    /** `param.member` where `param` is a class-typed parameter, the member is
     *  string-typed and the read is a plain rvalue: `get_value_k(&param, "member")`. */
    printStringMemberOfClassParam(node: any, receiverText: string): string | undefined {
        const receiver = node.expression;
        if (!isIdentifier(receiver) || !isIdentifier(node.name)) return undefined;
        const source = node.getSourceFile ? node.getSourceFile().fileName : '';
        if (typeof source === 'string' && /\/test\//.test(source)) return undefined;
        const member = String(node.name.text);
        if (member === 'length' || member === 'hashmap' || member === 'subscriptions' || member === 'futures') return undefined;
        const declaration = this.rustSingleLocalDeclaration(receiver);
        if (declaration === undefined || !isParameterDeclaration(declaration)) return undefined;
        if (!this.isNativeAccessPositionSafe(node) || this.isNativeWriteTargetBase(node)) return undefined;
        const parent: any = node.parent;
        if (parent !== undefined && ((isPropertyAccessExpression(parent) || isElementAccessExpression(parent)) && parent.expression === node)) return undefined;
        const memberType = this.typeOfNodeIfAny(node);
        if (memberType === undefined || !this.isStringType(memberType.flags)) return undefined;
        const receiverType: any = this.typeOfNodeIfAny(receiver);
        if (receiverType === undefined || !(receiverType.flags & TypeFlags.Object) ||
            !(((typeTarget(receiverType) ?? receiverType).objectFlags) & ObjectFlags.Class)) return undefined;
        return `crate::value::get_value_k(&${receiverText}, ${this.quotedStringLiteral(member)})`;
    }

    printPropertyAccessExpression(node, identation) {
        const transformedProperty = this.transformPropertyAcessExpressionIfNeeded(node);
        if (transformedProperty) {
            return this.getIden(identation) + transformedProperty;
        }

        const rightSide = node.name.text;
        const rawExpression = node.getText().trim();

    if (this.FullPropertyAccessReplacements.hasOwnProperty(rawExpression)) { // eslint-disable-line
      return this.FullPropertyAccessReplacements[rawExpression]; // eslint-disable-line
        }

        const leftExpr = this.printNode(node.expression, 0);

        if (rightSide === 'length') {
            return this.printArrayLength(node, 0, leftExpr);
        }

        // `book.cache` / `book.nonce` on an order-book local (typed, or read off `this.orderbooks`).
        if (isIdentifier(node.name) && isIdentifier(node.expression) && !this.isCastOrParenOperand(node) && this.isNativeAccessPositionSafe(node) && !this.isNativeWriteTargetBase(node)) {
            const bookField = this.printNativeBookFieldRead(leftExpr, node.expression, rightSide, true);
            if (bookField !== undefined) return bookField;
        }

        // Typed field on a checker-proven map local (`x.field`) reads natively;
        // the ccxt post-pass otherwise rewrites it to `get_value(&x, "field")`.
        if (isIdentifier(node.name) && this.isShallowValueReceiver(node.expression) &&
            this.isNativeAccessPositionSafe(node) && !this.isNativeWriteTargetBase(node)) {
            const native = this.printNativeMapAccess(leftExpr, node.expression, String(rightSide));
            if (native) return native;
        }

        // A string-typed data member read off a class-typed parameter (a `Value`
        // in Rust, e.g. `sourceExchange.id`) is the `&str`-key lookup itself; the
        // ccxt field-access pass would turn the bare `x.id` into `get_value`.
        const stringMember = this.printStringMemberOfClassParam(node, leftExpr);
        if (stringMember !== undefined) return stringMember;

        return `${leftExpr}.${rightSide}`;
    }

    // ── native container access (`get_value(...)` -> `.get(...)`) ─────────────
    // When the TypeScript checker proves the receiver is a plain Map/List value
    // and the key is a literal, the runtime `get_value` key-marker / `__live_id`
    // paths cannot apply, so the access is emitted natively. Missing keys still
    // fall back to `Value::Null`.

    /** Methods whose Rust counterpart takes `&mut self`: a `self.<field>` read in
     *  their args must keep the `get_value(...)` shape the ccxt post-pass hoists. */
    static readonly MUT_SELF_METHODS = new Set([
        'watch', 'watch_multiple', 'fetch_order_book_snapshot', 'un_watch',
        'client', 'spawn', 'delay', 'fetch_tickers', 'extend', 'fetch',
        'send_evm_transaction',
    ]);

    /** Global parse helpers that go native (`str::parse`) on a proven string arg,
     *  keyed to the rust integer/float type their runtime helper parses into. */
    static readonly RUST_PARSE_HELPERS: Record<string, string> = {
        parseInt: 'i64',
        parseFloat: 'f64',
    };

    toSnakeCaseName(name: string): string {
        return name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase();
    }

    escapeRustStringLiteral(text: string): string {
        return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    }

    getCheckedTypeOf(node): Type | undefined {
        return this.checkerOrUndefined()?.getTypeAtLocation(node);
    }

    typeSymbolOf(type: Type): TsSymbol | undefined {
        if (type === undefined || type === null) return undefined;
        return type?.getSymbol() ?? type?.getAliasSymbol();
    }

    /** Types declared outside ts/src (Date, Response, Array, Promise, …) are never
     *  backed by a plain `Value` map in the rust port. */
    isLibDeclaredType(type: Type): boolean {
        const declarations: any[] = symbolDeclarations(this.typeSymbolOf(type));
        return declarations.some(d => {
            const file = d?.getSourceFile?.()?.fileName ?? '';
            return /[\\/]lib\.[^\\/]*\.d\.ts$/.test(file) || /[\\/]node_modules[\\/]typescript[\\/]/.test(file);
        });
    }

    isClassInstanceType(type: Type): boolean {
        if (type === undefined) return false;
        if (type.flags & (TypeFlags.Union | TypeFlags.Intersection)) {
            return (typeParts(type) ?? []).some((member) => this.isClassInstanceType(member));
        }
        const symbol: any = this.typeSymbolOf(type) ?? type.getAliasSymbol();
        if (symbol?.flags & SymbolFlags.Class) return true;
        const declarations: any[] = symbolDeclarations(symbol);
        return declarations.some(d => isClassDeclaration(d) || isClassExpression(d));
    }

    hasCallableShape(type: Type): boolean {
        const checker = this.getChecker();
        return checker.getSignaturesOfType(type, SignatureKind.Call).length > 0 ||
            checker.getSignaturesOfType(type, SignatureKind.Construct).length > 0;
    }

    isProvenListType(type: Type): boolean {
        if (!(type.flags & TypeFlags.Object)) return false;
        // Tuple references carry the Tuple flag on their target.
        const objectFlags = ((type as any).objectFlags ?? 0) | ((typeTarget(type)?.objectFlags) ?? 0);
        if (objectFlags & ObjectFlags.Tuple) return true;
        const name = (this.typeSymbolOf(type) as any)?.name;
        if (name === 'Array' || name === 'ReadonlyArray') return true;
        const targetName = (this.typeSymbolOf(typeTarget(type)) as any)?.name;
        return targetName === 'Array' || targetName === 'ReadonlyArray';
    }

    /** True only for object types the rust port represents as `Value::Dict`
     *  (plain interfaces / index-signature / literal types — never classes). */
    isProvenMapType(type: Type): boolean {
        if (type === undefined) return false;
        if (type.flags & TypeFlags.Union) {
            // `Market` / `Currency` / `Order | undefined` style aliases: the runtime value is the dict (or
            // Null), so a map receiver is proven once every value-carrying member is a proven map. An
            // all-dict union without a nullish member stays on the strict path (a class may hide behind it).
            const parts: Type[] = typeParts(type) ?? [];
            const nullish = parts.filter((p) => this.rustTypeIsNullish(p));
            const valueParts = parts.filter((p) => !this.rustTypeIsNullish(p));
            return nullish.length > 0 && valueParts.length > 0 && valueParts.every((p) => this.isProvenMapType(p));
        }
        if (!(type.flags & TypeFlags.Object)) return false;
        if (this.isProvenListType(type)) return false;
        if (this.hasCallableShape(type)) return false;
        if (this.isClassInstanceType(type)) return false;
        if (this.isLibDeclaredType(type)) return false;
        // A named type or a string index signature; a bare `object` proves nothing.
        const hasStringIndex = this.getChecker().getIndexTypeOfType(type, IndexKind.String) !== undefined;
        return hasStringIndex || this.typeSymbolOf(type) !== undefined;
    }

    /** `undefined` / `null` / `void` / `never` — a union member that carries no
     *  runtime value; `Value::Null` is the only box these ever get. */
    rustTypeIsNullish(type: Type): boolean {
        return type !== undefined && (type.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void | TypeFlags.Never)) !== 0;
    }

    isProvenMapExpression(node: Node): boolean {
        return this.isProvenMapType(this.getCheckedTypeOf(node));
    }

    isProvenListExpression(node: Node): boolean {
        if (this.rustIsOrderBookSide(node)) return false;
        const type = this.getCheckedTypeOf(node);
        return type !== undefined && this.isProvenListType(type);
    }

    /** RHS of a generator destructure that provably holds a `Value::Arr`: the
     *  checker-proven list, or a call whose callee returns an array literal on
     *  every path. */
    rustNativeListSource(node: Node): boolean {
        return this.isProvenListExpression(node) || this.rustCallReturnsProvenList(node);
    }

    /** `x.split(sep)` → the runtime `split`, which yields an array on every
     *  path (a non-string receiver gives the empty array, never a dict). */
    rustCallPrintsRuntimeSplit(node: Node): boolean {
        if (!isCallExpression(node) || node.arguments.length === 0) return false;
        const expression: any = node.expression;
        return isPropertyAccessExpression(expression) && expression.expression.kind !== SyntaxKind.ThisKeyword &&
            String(expression.name.text) === 'split';
    }

    /** True when the call's value is always a runtime array: the `handle*AndParams`
     *  family and its exchange overrides declare `any`, so the checker cannot
     *  prove the `[T, Dict]` tuple the body always builds — walk the resolved
     *  callee instead. */
    rustCallReturnsProvenList(node: Node): boolean {
        if (!isCallExpression(node)) return false;
        return this.rustProvenListCall(node, new Set());
    }

    private rustProvenListCall(node: Node, stack: Set<Node>): boolean {
        if (this.rustCallPrintsRuntimeSplit(node)) return true;
        const declaration = this.rustCalleeDeclaration(node);
        return declaration !== undefined && this.rustFunctionReturnsArrayLiteral(declaration, stack);
    }

    /** Implementation of a `x.y(..)` call, when the checker resolves one. */
    private rustCalleeDeclaration(node: Node): Node | undefined {
        if (!isCallExpression(node)) return undefined;
        if (!isPropertyAccessExpression((node as any).expression)) return undefined;
        try {
            return signatureDeclaration((this.getChecker() as any).getResolvedSignature(node));
        } catch (e) {
            return undefined;
        }
    }

    /** Every `return` in the function's own body builds an array literal, or
     *  delegates to a call that does. `throw` and fall-through (the printer's
     *  `Value::Null`) read the same through both forms. */
    private rustFunctionReturnsArrayLiteral(declaration: Node, stack: Set<Node>): boolean {
        if (stack.has(declaration)) return false;
        const body: any = (declaration as any).body;
        if (body === undefined || !isBlock(body)) return false;
        stack.add(declaration);
        try {
            let returns = 0;
            let all = true;
            const visit = (node: Node) => {
                if (!all) return;
                if (node !== body && isFunctionLike(node)) return; // nested closure
                if (isReturnStatement(node)) {
                    returns++;
                    const expression: any = node.expression;
                    all = expression !== undefined && (isArrayLiteralExpression(expression) ||
                        (isCallExpression(expression) && this.rustProvenListCall(expression, stack)) ||
                        (isParenthesizedExpression(expression) && isArrayLiteralExpression(expression.expression)));
                    return;
                }
                node.forEachChild(visit);
            };
            body.forEachChild(visit);
            return all && returns > 0;
        } finally {
            stack.delete(declaration);
        }
    }

    /** Native list-index read of a generator temp (`__destr_tmp.as_array()…`). */
    printNativeListIndex(receiverText: string, index: number, receiverNode?: Node): string {
        // The unshadowed `api` / `section` list of sign/fetch2/request reads its nth through the iterator.
        if (receiverNode !== undefined && this.rustSignApiParam(receiverNode) !== undefined) {
            return `${receiverText}.as_array().into_iter().flatten().nth(${index}).cloned().unwrap_or(Value::Null)`;
        }
        return `${receiverText}.as_array().and_then(|__arr| __arr.get(${index})).cloned().unwrap_or(Value::Null)`;
    }

    /** Element read of a `Vec<Value>` binding (a destructuring temp the printer declares typed). */
    printTypedVecElementRead(name: string, index: number): string {
        return `${name}.get(${index}).cloned().unwrap_or(Value::Null)`;
    }

    /** Native read for one chain level, or undefined to keep `get_value`. */
    // `book['bids'|'asks'|'nonce'|...]` on a checker-typed order-book class: the hand-written
    // `Value::book_field` serves the same shared-store read as `get_value_k`.
    printNativeBookFieldRead(receiverText: string, receiverNode: Node, keyText: string, viaStore = false): string | undefined {
        if (!RustTranspiler.RUST_ORDERBOOK_READ_FIELDS.has(keyText)) return undefined;
        // Test sources keep `get_value(&book, "bids")`: their side-extraction pass matches it.
        if (/\/test\//.test(String((receiverNode as any).getSourceFile?.().fileName ?? ''))) return undefined;
        if (this.rustDictBearerDeclaration(receiverNode) !== undefined || this.rustMapParamDeclaration(receiverNode) !== undefined) return undefined;
        const type = this.typeOfNodeIfAny(receiverNode);
        const name = type === undefined ? undefined : (this.typeSymbolOf(type) as any)?.name;
        if ((name === undefined || !RustTranspiler.RUST_ORDERBOOK_CLASSES.has(name)) && !(viaStore && this.rustReadsOrderbooksStore(receiverNode))) return undefined;
        return `${receiverText}.book_field("${keyText}")`;
    }

    printNativeContainerAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        // A read-only bearer holds the container itself.
        const readBearer = this.rustReadBearerKind(receiverNode);
        if (readBearer !== undefined) {
            const native = this.printReadBearerAccess(readBearer, receiverText, keyNode);
            if (native !== undefined) return native;
        }
        // A shadowed parameter reads through the borrowed container.
        const shadow = this.rustParamShadowOf(receiverNode);
        if (shadow !== undefined) {
            const native = this.printShadowContainerRead(shadow, keyNode);
            if (native !== undefined) return native;
        }
        if (isStringLiteralLikeNode(keyNode)) {
            const bookField = this.printNativeBookFieldRead(receiverText, receiverNode, keyNode.text);
            if (bookField !== undefined) return bookField;
            return this.printNativeMapAccess(receiverText, receiverNode, keyNode.text) ?? this.rustLocalDictLiteralRead(receiverText, receiverNode, keyNode.text);
        }
        if (isNumericLiteral(keyNode)) {
            const index = Number(keyNode.text);
            if (!Number.isInteger(index) || index < 0) return undefined;
            if (this.rustVecLocalDeclarationOf(receiverNode) !== undefined) {
                // A typed `Vec<Value>` local reads through the slice.
                return `${receiverText}.get(${index}).cloned().unwrap_or(Value::Null)`;
            }
            if (!this.isProvenListExpression(receiverNode) && !this.arrReadLocal(receiverNode)) return undefined;
            return this.printNativeListIndex(receiverText, index, receiverNode);
        }
        const dictRead = this.rustBearerDictDynamicRead(receiverText, receiverNode, keyNode) ?? this.printNativeDynamicMapAccess(receiverText, receiverNode, keyNode) ?? this.printNativeThisFieldDynamicMapAccess(receiverText, receiverNode, keyNode)
            ?? this.rustDynamicRead(receiverText, receiverNode, keyNode) ?? this.rustFieldDynamicRead(receiverText, receiverNode, keyNode)
            ?? this.rustLocalDictRead(receiverText, receiverNode, keyNode);
        if (dictRead !== undefined) return dictRead;
        // A non-literal index (the `for (let i = 0; …)` counter) into a
        // checker-proven list reads natively too.
        return this.printNativeDynamicListIndex(receiverText, receiverNode, keyNode) ?? this.listArithIndex(receiverText, receiverNode, keyNode);
    }

    /** `get_value(&X, &i)` for a checker-proven list `X` and a dynamic integer
     *  index local `i`: the runtime's own array branch, spelled natively.
     *  `get_value` reaches its array arm for an `Arr` receiver and its default
     *  (`Value::Null`) otherwise, so the emitted match reproduces both — an
     *  `Int` index by value (a negative or out-of-range index misses), a
     *  numeric string by parse, anything else a miss. */
    printNativeDynamicListIndex(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        if (!this.isProvenListExpression(receiverNode) && !this.arrReadLocal(receiverNode)) return undefined;
        if (this.rustVecLocalDeclarationOf(receiverNode) !== undefined) {
            // A typed `Vec<Value>` local reads through the slice.
            if (!this.isRustValueIndexKey(keyNode) || this.isWriteBackBindRead(keyNode.parent)) return undefined;
            const place = this.printNode(keyNode, 0).trim();
            if (!place || place.startsWith('&')) return undefined;
            return `${receiverText}.get((${place}).as_i64().unwrap_or(-1) as usize).cloned().unwrap_or(Value::Null)`;
        }
        if (!this.isRustValueIndexKey(keyNode)) return undefined;
        // The ccxt `writeBackIndexedMutations` pass matches the `let x = get_value(&C, &K)` text to
        // write a mutated `x` back into `C[K]`; native text is invisible to it, so a bind the next
        // statement mutates keeps the helper.
        if (this.isWriteBackBindRead(keyNode.parent)) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        // A text that already carries the post-pass `&` is not a place.
        if (!keyText || keyText.startsWith('&')) return undefined;
        if (this.rustI64CounterOf(this.rustSkipWrappers(keyNode)) !== undefined) {
            return `${receiverText}.as_array().map(Vec::as_slice).unwrap_or_default().get(${keyText} as usize).cloned().unwrap_or(Value::Null)`;
        }
        return `${receiverText}.as_array().and_then(|__arr| match &${keyText} { Value::Int(__n) => __arr.get(*__n as usize), Value::Str(__s) => __s.parse::<usize>().ok().and_then(|__n| __arr.get(__n)), _ => None }).cloned().unwrap_or(Value::Null)`;
    }

    /** True when this read initialises a local that the very next statement in
     *  the same block mutates (`x['k'] = v` -> `add_element_to_object(&mut x…)`,
     *  `x.push(v)` -> `append_to_array(&mut x…)`). */
    isWriteBackBindRead(read: Node): boolean {
        const declaration: any = read === undefined ? undefined : read.parent;
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.initializer !== read) return false;
        if (!isIdentifier(declaration.name)) return false;
        const name = String(declaration.name.text);
        let statement: any = declaration;
        while (statement !== undefined && !isStatement(statement)) statement = statement.parent;
        const siblings: any[] = statement?.parent?.statements ?? [];
        const at = siblings.indexOf(statement);
        if (at < 0 || at + 1 >= siblings.length) return false;
        return this.rustStatementMutatesLocal(siblings[at + 1], name);
    }

    /** A statement containing a write into a local (`x['k'] = v`, `x.k = v`,
     *  `x.push(v)`). */
    rustStatementMutatesLocal(node: Node, name: string): boolean {
        let mutated = false;
        const visit = (n: Node) => {
            if (mutated) return;
            if ((isBinaryExpression(n) && rustIsAssignmentOperator(n.operatorToken.kind) && this.rootPlaceText(n.left) === name) ||
                (isCallExpression(n) && isPropertyAccessExpression(n.expression) &&
                n.expression.name.text === 'push' && this.rootPlaceText(n.expression.expression) === name)) {
                mutated = true;
                return;
            }
            n.forEachChild(visit);
        };
        node.forEachChild(visit);
        return mutated;
    }

    /** A dynamic index the printer emits as a `Value` number: a `let x = <numeric
     *  literal>` declaration of the same function (the C-style loop counter).
     *  Any other shape keeps the helper — the printed local could be a native
     *  `i64`/`f64`, which the `Value` match would not compile against. */
    isRustValueIndexKey(node: Node): boolean {
        const current: any = this.rustSkipWrappers(node);
        if (!isIdentifier(current)) return false;
        const type = this.getCheckedTypeOf(current);
        if (type === undefined || !(type.flags & (TypeFlags.Number | TypeFlags.NumberLiteral))) return false;
        const declaration: any = this.rustDeclarationOfIdentifier(current);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.initializer === undefined) return false;
        return isNumericLiteral(this.rustSkipWrappers(declaration.initializer));
    }

    /** Strips `( )`, `as T` and `!` wrappers. */
    rustSkipWrappers(node: any): any {
        while (node !== undefined && (isParenthesizedExpression(node) || isAsExpression(node) || isNonNullExpression(node))) node = node.expression;
        return node;
    }

    // Typed-parameter dict reads: a checker-proven plain dict param (`Dict`, `Dictionary<T>`,
    // `Market`-style alias) holds the dict or `Value::Null`, so `get_value`'s marker routes cannot
    // fire and the read is `m.get(k)`. The key must be a proven `Str` box so `.as_str()` reproduces it.

    /** The parameter declaration behind a receiver when its *annotation* proves
     *  a plain dict; undefined otherwise (no proof → keep the helper). */
    rustProvenDictParameter(node: Node): ParameterDeclaration | undefined {
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isParameterDeclaration(declaration)) return undefined;
        if (declaration.type === undefined) return undefined;
        const type = this.getCheckedTypeOf(declaration.type);
        if (type === undefined || !this.isProvenMapType(type)) return undefined;
        // D2: a later write can change the kind.
        return this.rustLocalIsReassigned(declaration, String((declaration.name as any).text)) ? undefined : declaration;
    }

    /** `Str` (`string | undefined`) — the key box is `Value::Str` or Null. */
    rustKeyIsProvenString(node: Node): boolean {
        const type = this.getCheckedTypeOf(node);
        if (type === undefined) return false;
        const parts: Type[] = (type.flags & TypeFlags.Union) ? (typeParts(type) ?? []) : [type];
        let strings = 0;
        for (const part of parts) {
            if (part.flags & (TypeFlags.String | TypeFlags.StringLiteral)) {
                strings++;
                continue;
            }
            if (this.rustTypeIsNullish(part)) continue;
            return false;
        }
        return strings > 0;
    }

    /** The local/parameter proof of a dynamic-key map read: a parameter whose
     *  annotation proves a plain dict, or any local whose checker type
     *  proves a plain map and which nothing in the enclosing function
     *  re-assigns (D2). Returns the proven declaration. */
    rustProvenDynamicMapReceiver(node: Node): Declaration | undefined {
        const parameter = this.rustProvenDictParameter(node);
        if (parameter !== undefined) return parameter;
        if (!isIdentifier(node)) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration)) return undefined;
        if (declaration.initializer === undefined) return undefined;
        if (!this.isProvenMapExpression(node)) return undefined;
        if (this.rustLocalIsReassigned(declaration, String(node.text))) return undefined;
        return declaration;
    }

    /** The element-access read a key node belongs to (`x[k]`, `x[(k)]`). */
    rustElementReadOfKey(keyNode: Node): Node | undefined {
        let current: any = keyNode;
        while (current !== undefined && (isParenthesizedExpression(current) || isAsExpression(current) || isNonNullExpression(current))) {
            current = current.parent;
        }
        const parent: any = current === undefined ? undefined : current.parent;
        if (parent === undefined || !isElementAccessExpression(parent) || parent.argumentExpression !== current) return undefined;
        return parent;
    }

    /** `x[k]` where `x` is a proven-dict parameter and `k` a proven string. */
    printNativeDynamicMapAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        if (this.rustProvenDynamicMapReceiver(receiverNode) === undefined) return undefined;
        if (!this.rustKeyIsProvenString(keyNode)) return undefined;
        // The ccxt `writeBackIndexedMutations` pass matches the
        // `let x = get_value(&C, &K)` text to write a mutated `x` back into
        // `C[K]`; the native text is invisible to it, so a bind the next
        const read = this.rustElementReadOfKey(keyNode);
        if (read !== undefined && this.isWriteBackBindRead(read)) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        // A plain place keeps the borrow local; a call/temporary text does not.
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyText)) return undefined;
        if (this.rustNodeIsKeyUnsafePlace(keyText)) return undefined;
        return this.rustDictRead(receiverText, keyText, receiverNode);
    }

    /** Keys `get_value` serves from the book store / cache bucket / live
     *  snapshot instead of the dict itself — a dynamic read cannot prove the
     *  key away, so a place named after one stays boxed. */
    rustNodeIsKeyUnsafePlace(keyText: string): boolean {
        return RustTranspiler.RUST_DICT_LOCAL_UNSAFE_KEYS.has(keyText);
    }

    // ── parameter shadows (`let x = x.as_map().unwrap_or(&__x_empty)`) ─────────
    //
    // A `Dict`/`List` parameter holds the container or `Value::Null`, and

    private paramShadowCache: { src: SourceFile, tables: Map<Node, Map<string, RustParamShadow>> } | undefined;

    /** Functions whose shadow lines were actually emitted — a read converts
     *  only inside one of those (an arrow body prints inline and gets none). */
    private paramShadowEmitted: { src: SourceFile, fns: Set<Node> } | undefined;

    private rustParamShadowEmittedSet(): Set<Node> {
        const src = this.getSrc();
        if (this.paramShadowEmitted === undefined || this.paramShadowEmitted.src !== src) {
            this.paramShadowEmitted = { src, fns: new Set() };
        }
        return this.paramShadowEmitted.fns;
    }

    rustParamShadowTables(): Map<Node, Map<string, RustParamShadow>> {
        const src = this.getSrc();
        if (this.paramShadowCache === undefined || this.paramShadowCache.src !== src) {
            this.paramShadowCache = { src, tables: new Map() };
        }
        return this.paramShadowCache.tables;
    }

    /** Emitted shadow lines for a function, or '' when no parameter qualifies.
     *  The caller must use this before printing the body statements (it both
     *  registers the function as shadowed and computes the lines). */
    rustParamShadowLines(fn: Node, identation: number): string {
        const table = this.rustParamShadowTable(fn);
        if (table.size === 0) return '';
        const idn = this.getIden(identation);
        const lines: string[] = [];
        for (const shadow of table.values()) {
            const empty = `__${shadow.name}_empty`;
            if (this.rustFunctionDeclaresName(fn, empty)) continue;
            const map = shadow.kind === RUST_PARAM_SHADOWS.MAP;
            const accessor = map ? 'as_map' : 'as_array';
            lines.push(`${idn}let ${empty} = ${map ? 'indexmap::IndexMap::new()' : 'Vec::new()'};`);
            lines.push(`${idn}let ${shadow.name} = ${shadow.name}.${accessor}().unwrap_or(&${empty});`);
        }
        if (lines.length === 0) return '';
        this.rustParamShadowEmittedSet().add(fn);
        return lines.join('\n') + '\n';
    }

    private rustParamShadowTable(fn: Node): Map<string, RustParamShadow> {
        const tables = this.rustParamShadowTables();
        let table = tables.get(fn);
        if (table === undefined) {
            try {
                table = this.collectRustParamShadows(fn);
            } catch (e) {
                table = new Map(); // no proof -> every read keeps its helper
            }
            tables.set(fn, table);
        }
        return table;
    }

    /** The shadow a read receiver resolves to, or undefined (no proof → helper). */
    rustParamShadowOf(node: Node): RustParamShadow | undefined {
        const current: any = this.rustSkipWrappers(node);
        if (current === undefined || !isIdentifier(current)) return undefined;
        const name = String(current.text);
        const declaration = this.rustDeclarationOfIdentifier(current);
        if (declaration === undefined || !isParameterDeclaration(declaration)) return undefined;
        const emitted = this.rustParamShadowEmittedSet();
        let scope: any = current.parent;
        while (scope !== undefined) {
            if (isFunctionLike(scope)) {
                const entry = emitted.has(scope) ? this.rustParamShadowTable(scope).get(name) : undefined;
                if (entry !== undefined && entry.declaration === declaration) return entry;
            }
            scope = scope.parent;
        }
        return undefined;
    }

    /** True when the enclosing function already binds this name somewhere. */
    private rustFunctionDeclaresName(fn: Node, name: string): boolean {
        let found = false;
        this.rustWalkScope(fn, (node: Node) => {
            if (isFunctionLike(node)) return RUST_WALK_SKIP; // nested closure: own scope
            if ((isVariableDeclaration(node) || isParameterDeclaration(node)) && isIdentifier(node.name) && node.name.text === name) {
                found = true;
                return RUST_WALK_STOP;
            }
        });
        return found;
    }

    private collectRustParamShadows(fn: Node): Map<string, RustParamShadow> {
        const table = new Map<string, RustParamShadow>();
        const parameters: any[] = (fn as any).parameters ?? [];
        const body: any = (fn as any).body;
        if (body === undefined) return table;
        for (const param of parameters) {
            if (!isParameterDeclaration(param) || !isIdentifier(param.name)) continue;
            const name = String(param.name.text);
            if (name === 'optional_args') continue;
            if (param.type === undefined) continue;
            const type = this.getCheckedTypeOf(param.type);
            if (type === undefined) continue;
            // A ws order-book parameter is a `Value::Dict` in the port, but its TS class
            // carries methods, so only literal-key reads are proven for it.
            const wsDict = !this.isProvenMapType(type) && this.rustWsOrderBookClassType(type);
            const kind: RustParamShadowKind | undefined = (this.isProvenMapType(type) || wsDict) ? RUST_PARAM_SHADOWS.MAP :
                this.isProvenShadowListType(type) ? RUST_PARAM_SHADOWS.LIST : undefined;
            if (kind === undefined) continue;
            if (this.rustParameterIsClientHandle(param)) continue;
            if (this.rustParamShadowUseCensus(fn, param, kind, wsDict) === undefined) continue;
            table.set(name, { kind, name, declaration: param });
        }
        return table;
    }

    /** A checker-proven array parameter type (`Vec<Value>` on the rust side);
     *  tuples are excluded (their printed shape is not a plain `Vec`). */
    isProvenShadowListType(type: Type): boolean {
        if (type === undefined) return false;
        if (!(type.flags & TypeFlags.Object)) return false;
        const objectFlags = ((type as any).objectFlags ?? 0) | ((typeTarget(type)?.objectFlags) ?? 0);
        if (objectFlags & ObjectFlags.Tuple) return false;
        if (this.hasCallableShape(type)) return false;
        if (this.isClassInstanceType(type)) return false;
        const name = (this.typeSymbolOf(type) as any)?.name;
        if (name === 'Array' || name === 'ReadonlyArray') return true;
        const targetName = (this.typeSymbolOf(typeTarget(type)) as any)?.name;
        return targetName === 'Array' || targetName === 'ReadonlyArray';
    }

    /** Every reference to the parameter must be a printable read, and at least
     *  one must exist; anything else (a write, a `Value` pass-through, a Null
     *  comparison, a marker key) answers undefined and the parameter keeps its
     *  box. */
    private rustParamShadowUseCensus(fn: Node, param: ParameterDeclaration, kind: RustParamShadowKind, literalKeys = false): { reads: number } | undefined {
        const name = String((param.name as Identifier).text);
        const paramSymbol = this.rustSymbolOf(param.name as Identifier);
        if (paramSymbol === undefined) return undefined;
        let reads = 0;
        let ok = true;
        const visit = (node: Node) => {
            if (!ok) return;
            if (isIdentifier(node) && node.text === name && node !== param.name) {
                if (this.rustSymbolOf(node) !== paramSymbol || !this.rustParamUseIsRead(node, kind, literalKeys)) {
                    ok = false;
                    return;
                }
                reads++;
            }
            node.forEachChild(visit);
        };
        (fn as any).body.forEachChild(visit);
        return ok && reads > 0 ? { reads } : undefined;
    }

    /** One reference of a shadow candidate: true only for a read the shadow can
     *  print exactly (same proofs the emitted forms re-check). */
    private rustParamUseIsRead(id: Identifier, kind: RustParamShadowKind, literalKeys = false): boolean {
        const parent: any = id.parent;
        if (parent === undefined) return false;
        // `x[k]` — element read. Writes (`x[k] = v`, `x[k].push(..)`) and the
        // post-pass write-back binds keep the box.
        if (isElementAccessExpression(parent) && parent.expression === id) {
            if (this.isNativeWriteTargetBase(id)) return false;
            if (!this.isNativeAccessPositionSafe(id)) return false;
            if (this.isWriteBackBindRead(parent)) return false;
            if (literalKeys) return this.rustShadowKeyIsLiteral(parent.argumentExpression);
            return this.rustShadowKeyIsReadable(parent.argumentExpression, kind);
        }
        // `x.length` — array length read.
        if (isPropertyAccessExpression(parent) && parent.expression === id) {
            return kind === RUST_PARAM_SHADOWS.LIST && String(parent.name.text) === 'length';
        }
        // `'k' in x` / `k in x`.
        if (isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.InKeyword && parent.right === id) {
            if (kind !== RUST_PARAM_SHADOWS.MAP) return false;
            if (literalKeys) return this.rustShadowKeyIsLiteral(parent.left);
            return this.rustShadowKeyIsReadable(parent.left, RUST_PARAM_SHADOWS.MAP);
        }
        // `this.safe<Type>(x, 'k'[, default])` — the read families the shadow
        // inlines (literal keys only). Any other call keeps the box.
        if (isCallExpression(parent) && kind === RUST_PARAM_SHADOWS.MAP) {
            if (this.rustShadowSafeCallee(parent) === undefined) return false;
            const args: NodeArray<Expression> = parent.arguments;
            if (args[0] !== id || args.length < 2 || args.length > 3) return false;
            return this.rustShadowKeyIsLiteral(args[1]);
        }
        return false;
    }

    /** A key a shadow read can print: dicts take a bare string literal or a
     *  proven-string place, lists a literal non-negative index; the `safe_*`
     *  inline takes the literal key form only. Marker-route key names and keys
     *  whose text needs escaping are excluded. */
    private rustShadowKeyIsReadable(key: any, kind: RustParamShadowKind): boolean {
        if (key === undefined) return false;
        if (kind === RUST_PARAM_SHADOWS.MAP) {
            if (isStringLiteralLikeNode(key)) return this.rustShadowKeyIsLiteral(key);
            if (isIdentifier(key)) {
                return this.rustKeyIsProvenString(key) && !this.rustNodeIsKeyUnsafePlace(String(key.text));
            }
            return false;
        }
        if (isNumericLiteral(key)) {
            const index = Number(key.text);
            return Number.isInteger(index) && index >= 0;
        }
        // A loop-counter place (`for (let i = 0; ...)`) is a `Value::Int` on
        // every path, so the slice read below answers the helper's Int arm.
        return this.isRustValueIndexKey(key);
    }

    private rustShadowKeyIsLiteral(key: any): boolean {
        if (key === undefined || !isStringLiteralLikeNode(key)) return false;
        const text = String(key.text);
        return this.rustShadowKeyLiteral(text) && !this.rustNodeIsKeyUnsafePlace(text);
    }

    /** Keys whose text is safe to inline into a rust string literal. */
    private rustShadowKeyLiteral(text: string): boolean {
        return /^[A-Za-z0-9_./-]*$/.test(text) && text.length > 0;
    }

    /** `this.safeString`-style callee of a call, or undefined. */
    private rustShadowSafeCallee(node: CallExpression): string | undefined {
        const callee: any = (node as any).expression;
        if (callee === undefined || !isPropertyAccessExpression(callee)) return undefined;
        if (callee.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        const name = String(callee.name.text);
        return RUST_PARAM_SHADOWS.SAFE_READS.has(name) ? name : undefined;
    }

    /** `x['k']` / `x[i]` / `'k' in x` on a shadowed parameter: the native read, or undefined to keep
     *  the helper (the shadow proof guarantees it never happens for an emitted shadow). */
    printShadowContainerRead(shadow: RustParamShadow, keyNode: Node): string | undefined {
        const key: any = keyNode;
        if (shadow.kind === RUST_PARAM_SHADOWS.MAP) {
            const k = this.rustShadowMapKey(key);
            if (k === undefined) return undefined;
            return k.literal !== undefined ? `${shadow.name}.get("${k.literal}").cloned().unwrap_or(Value::Null)`
                : this.rustShadowKeyRead(shadow.name, k.place, keyNode);
        }
        if (isNumericLiteral(key)) {
            const index = Number(key.text);
            if (!Number.isInteger(index) || index < 0) return undefined;
            return `${shadow.name}.get(${index}).cloned().unwrap_or(Value::Null)`;
        }
        if (!this.isRustValueIndexKey(key)) return undefined;
        const place = this.printNode(key, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(place)) return undefined;
        // a typed `i64` loop counter indexes the slice directly
        if (this.rustI64CounterOf(this.rustSkipWrappers(key)) !== undefined) return `${shadow.name}.get(${place} as usize).cloned().unwrap_or(Value::Null)`;
        return `${shadow.name}.get((${place}).as_i64().unwrap_or(-1) as usize).cloned().unwrap_or(Value::Null)`;
    }

    /** `'k' in x` on a shadowed dict parameter. */
    printShadowInOperator(shadow: RustParamShadow, keyNode: Node): string | undefined {
        if (shadow.kind !== RUST_PARAM_SHADOWS.MAP) return undefined;
        const k = this.rustShadowMapKey(keyNode);
        if (k === undefined) return undefined;
        return k.literal !== undefined ? `Value::Bool(${shadow.name}.contains_key("${k.literal}"))`
            : `Value::Bool(${this.rustShadowKeyHas(shadow.name, k.place, keyNode)})`;
    }

    /** A shadow dict key: an inlinable literal, or a proven-string plain place. */
    private rustShadowMapKey(key: any): { literal?: string, place?: string } | undefined {
        if (isStringLiteralLikeNode(key)) {
            const text = String(key.text);
            return this.rustShadowKeyLiteral(text) && !this.rustNodeIsKeyUnsafePlace(text) ? { literal: text } : undefined;
        }
        if (!isIdentifier(key) || !this.rustKeyIsProvenString(key) || this.rustNodeIsKeyUnsafePlace(String(key.text))) return undefined;
        const place = this.printNode(key, 0).trim();
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(place) ? { place } : undefined;
    }

    /** `x.length` on a shadowed list parameter — `get_array_length` natively. */
    printShadowLength(shadow: RustParamShadow): string | undefined {
        if (shadow.kind !== RUST_PARAM_SHADOWS.LIST) return undefined;
        return `Value::Int(${shadow.name}.len() as i64)`;
    }

    /** `this.safe<Type>(x, 'k'[, default])` on a shadowed dict parameter: the
     *  runtime helper's exact semantics over `.get(..)`. */
    printShadowSafeReadCall(node: CallExpression): string | undefined {
        const callee = this.rustShadowSafeCallee(node);
        if (callee === undefined) return undefined;
        const args: any[] = (node as any).arguments ?? [];
        if (args.length < 2 || args.length > 3) return undefined;
        const shadow = this.rustParamShadowOf(args[0]);
        if (shadow === undefined || shadow.kind !== RUST_PARAM_SHADOWS.MAP) return undefined;
        const key: any = args[1];
        if (!isStringLiteralLikeNode(key)) return undefined;
        const text = String(key.text);
        if (!this.rustShadowKeyLiteral(text) || this.rustNodeIsKeyUnsafePlace(text)) return undefined;
        const fallback = args.length === 3 ? this.printNode(args[2], 0).trim() : 'Value::Null';
        const get = `${shadow.name}.get("${text}")`;
        // The ccxt post-pass strips the `;` of a statement ending in `};`
        // (`[/\};(\s*\n)/g, '}$1']`), so the match — like the printer's other
        // block-valued expressions — is parenthesized.
        const wrap = (text: string) => `(${text})`;
        switch (callee) {
        case 'safeValue':
            return wrap(`match ${get} { Some(__v) if !matches!(__v, Value::Null) && !matches!(__v, Value::Str(__s) if __s.is_empty()) => __v.clone(), _ => ${fallback} }`);
        case 'safeString':
            return wrap(`match ${get} { Some(Value::Str(__s)) if !__s.is_empty() => Value::Str(__s.clone()), Some(Value::Int(__n)) => Value::Str(__n.to_string().into()), Some(Value::Float(__f)) => Value::Str(__f.to_string().into()), _ => ${fallback} }`);
        case 'safeInteger':
            return wrap(`match ${get} { Some(Value::Int(__n)) => Value::Int(*__n), Some(Value::Float(__f)) => Value::Int(*__f as i64), Some(Value::Str(__s)) => match __s.parse::<i64>() { Ok(__n) => Value::Int(__n), Err(_) => match __s.parse::<f64>() { Ok(__f) if __f.is_finite() => Value::Int(__f as i64), _ => ${fallback} } }, _ => ${fallback} }`);
        case 'safeNumber':
            return wrap(`match ${get} { Some(Value::Float(__f)) => Value::Float(*__f), Some(Value::Int(__n)) => Value::Float(*__n as f64), Some(Value::Str(__s)) => match __s.parse::<f64>() { Ok(__n) => Value::Float(__n), Err(_) => ${fallback} }, _ => ${fallback} }`);
        case 'safeBool':
            return wrap(`match ${get} { Some(Value::Bool(__b)) => Value::Bool(*__b), _ => ${fallback} }`);
        case 'safeDict':
            return wrap(`match ${get} { Some(__v) if matches!(__v, Value::Dict(_)) => __v.clone(), _ => ${fallback} }`);
        case 'safeList':
            return wrap(`match ${get} { Some(__v) if matches!(__v, Value::Arr(_)) => __v.clone(), _ => ${fallback} }`);
        }
        return undefined;
    }

    // ── pro-tier WS handler `message` shadow ─────────────────────────────────
    // `handle_x (client: Client, message: Dict)` is dispatched by NAME with
    // `Value` args, so the printed signature keeps `Value`; the annotation still

    /** The borrowed view bound by the shadow. */
    private static readonly PRO_HANDLER_SHADOW_NAME = '__pro_message';

    /** TS helper name -> emitted match kind. */
    private static readonly PRO_HANDLER_SHADOW_SAFE_READS: Record<string, string> = {
        'safeValue': 'value',
        'safeString': 'string',
        'safeInteger': 'integer',
        'safeNumber': 'float',
        'safeFloat': 'float',
        'safeDict': 'dict',
        'safeList': 'list',
        'safeBool': 'bool',
    };

    /** The `message: Dict` parameter of a WS handler method (2nd param of a
     *  `handle*` method), undefined when unproven or written (D2). */
    rustProHandlerMessageParam(node: Node): ParameterDeclaration | undefined {
        if (node === undefined || !isMethodDeclaration(node) || node.body === undefined) return undefined;
        const params: any[] = (node.parameters ?? []) as any;
        if (params.length < 2) return undefined;
        const methodName: any = node.name;
        if (methodName === undefined || !/^handle[A-Z]/.test(String(methodName.text ?? ''))) return undefined;
        const param: any = params[1];
        if (param === undefined || !isIdentifier(param.name) || param.type === undefined) return undefined;
        // The ws-handler shape `handle_x (client: Client, message: Dict)`: the
        // message is a required parameter and the first one is the Client
        // class handle. (Base helpers like `handleMarginModeAndParams
        if (param.initializer !== undefined || param.questionToken !== undefined) return undefined;
        const clientParam: any = params[0];
        if (clientParam === undefined || clientParam.type === undefined) return undefined;
        const clientType = this.getCheckedTypeOf(clientParam.type);
        if (clientType === undefined || !this.isClassInstanceType(clientType)) return undefined;
        const type = this.getCheckedTypeOf(param.type);
        if (type === undefined || !this.isProvenMapType(type)) return undefined;
        const name = String(param.name.text);
        return this.rustProHandlerParamIsWritten(param, name) ? undefined : param;
    }

    /** D2: a write rooted at the parameter (reassignment, element/property
     *  write, a merge/splice onto it) can reshape the dict after the shadow is
     *  taken — the shadow is skipped and every read keeps the helper. */
    rustProHandlerParamIsWritten(param: ParameterDeclaration, name: string): boolean {
        if (this.rustLocalIsReassigned(param, name)) return true;
        const scope = this.rustEnclosingFunction(param);
        if (scope === undefined) return true;
        if (this.rustStatementMutatesLocal(scope, name)) return true;
        const merging = ['deepExtend', 'extend', 'addElementToObject', 'remove'];
        let written = false;
        this.rustWalkScope(scope, (n: Node) => {
            if (isCallExpression(n) && n.arguments.length > 0 && isIdentifier(n.arguments[0]) && (n.arguments[0] as any).text === name) {
                const callee: any = n.expression;
                written = merging.includes(isPropertyAccessExpression(callee) ? String(callee.name?.text ?? '') :
                    isIdentifier(callee) ? String(callee.text ?? '') : '');
                if (written) return RUST_WALK_STOP;
            }
        });
        return written;
    }

    /** Shadow plan for a handler: the parameter plus the two binding lines,
     *  present only when some body read actually turns native (no dead shed). */
    rustProHandlerShadowPlan(node: Node, identation: number): { param: ParameterDeclaration, lines: string } | undefined {
        const param = this.rustProHandlerMessageParam(node);
        if (param === undefined) return undefined;
        // a parameter shadow already rebinds the name to the borrowed map; its reads are native
        if (this.rustParamShadowTable(node).has(String((param.name as any).text))) return undefined;
        const saved = this.rustProHandlerShadowParam;
        this.rustProHandlerShadowParam = param;
        let hasRead = false;
        const scope = this.rustEnclosingFunction(param);
        this.rustWalkScope(scope, (n: Node) => {
            if (isCallExpression(n) && this.printProHandlerShadowRead(n, true) !== undefined) {
                hasRead = true;
                return RUST_WALK_STOP;
            }
        });
        this.rustProHandlerShadowParam = saved;
        if (!hasRead) return undefined;
        const name = String((param.name as any).text);
        const view = RustTranspiler.PRO_HANDLER_SHADOW_NAME;
        const arc = `${view}_arc`;
        const map = 'indexmap::IndexMap<String, Value>';
        const ind = this.getIden(identation + 2);
        // an owned Arc clone keeps the shadow from borrowing the parameter (it may move later)
        const lines =
            `${ind}let ${arc}: std::sync::Arc<${map}> = (if let Value::Dict(__d) = &${name} { __d.clone() } else { std::sync::Arc::new(indexmap::IndexMap::new()) });\n` +
            `${ind}let ${view}: &${map} = &${arc};\n`;
        return { param, lines };
    }

    /** The `safe_*` call on the shadowed parameter prints as a native
     *  `.get("k")` match, or undefined when the call is not one. In `probe`
     *  mode the shape is checked without printing (the pre-scan must not print
     *  a node twice). */
    printProHandlerShadowRead(node: Node, probe = false): string | undefined {
        const param = this.rustProHandlerShadowParam;
        if (param === undefined || node === undefined || !isCallExpression(node)) return undefined;
        const callee: any = node.expression;
        if (callee === undefined || !isPropertyAccessExpression(callee)) return undefined;
        if (callee.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        const kind = RustTranspiler.PRO_HANDLER_SHADOW_SAFE_READS[String(callee.name?.text ?? '')];
        if (kind === undefined) return undefined;
        const args: any[] = (node.arguments ?? []) as any;
        if (args.length < 2 || args.length > 3) return undefined;
        const receiver: any = args[0];
        if (receiver === undefined || receiver.kind !== SyntaxKind.Identifier) return undefined;
        if (this.rustDeclarationOfIdentifier(receiver) !== param) return undefined;
        const key: any = args[1];
        if (key === undefined || !isStringLiteral(key)) return undefined;
        const keyText = key.text;
        if (keyText === '' || RustTranspiler.RUST_DICT_LOCAL_UNSAFE_KEYS.has(keyText)) return undefined;
        if (args.length === 3 && !this.rustProHandlerShadowDefaultShape(args[2])) return undefined;
        if (probe) return 'native';
        const dflt = args.length === 3 ? this.rustProHandlerShadowDefault(args[2]) : 'Value::Null';
        if (dflt === undefined) return undefined;
        return this.rustProHandlerShadowReadText(kind, this.escapeRustStringLiteral(keyText), dflt);
    }

    /** A miss-arm default the match can hold: absent (`Value::Null`) or a
     *  literal; a computed default keeps the helper (its Value is not
     *  re-printable inside an arm without re-evaluating it twice). */
    rustProHandlerShadowDefaultShape(node: Node): boolean {
        return node.kind === SyntaxKind.StringLiteral || node.kind === SyntaxKind.NumericLiteral ||
            node.kind === SyntaxKind.TrueKeyword || node.kind === SyntaxKind.FalseKeyword ||
            node.kind === SyntaxKind.NullKeyword || node.kind === SyntaxKind.ArrayLiteralExpression ||
            node.kind === SyntaxKind.ObjectLiteralExpression ||
            (isIdentifier(node) && (node as any).text === 'undefined');
    }

    rustProHandlerShadowDefault(node: Node): string | undefined {
        if (!this.rustProHandlerShadowDefaultShape(node)) return undefined;
        const text = this.printNode(node, 0).trim();
        return text === '' ? undefined : text;
    }

    /** Exact native form of the runtime `_k` helper: same value kinds, same
     *  empty-string-is-missing rule, same default (verified against
     *  `exchange_stubs.rs`). `.cloned()` keeps the emitted line clone-free for
     *  the ccxt clone-pruning passes; the parenthesised `match` keeps the
     *  driver's `};` trailing-block replacement off the statement's `;`. */
    rustProHandlerShadowReadText(kind: string, key: string, dflt: string): string {
        const m = RustTranspiler.PRO_HANDLER_SHADOW_NAME;
        const at = `${m}.get("${key}").cloned()`;
        switch (kind) {
        case 'value':
            return `(match ${at} { Some(Value::Str(__s)) if __s.is_empty() => ${dflt}, Some(__v) => __v, None => ${dflt} })`;
        case 'string':
            return `(match ${at} { Some(Value::Str(__s)) if !__s.is_empty() => Value::Str(__s), Some(Value::Int(__n)) => Value::Str(__n.to_string().into()), Some(Value::Float(__f)) => Value::Str(__f.to_string().into()), _ => ${dflt} })`;
        case 'integer':
            return `(match ${at} { Some(Value::Int(__n)) => Value::Int(__n), Some(Value::Float(__f)) => Value::Int(__f as i64), Some(Value::Str(__s)) if !__s.is_empty() => match __s.parse::<i64>() { Ok(__n) => Value::Int(__n), Err(_) => match __s.parse::<f64>() { Ok(__f) if __f.is_finite() => Value::Int(__f as i64), _ => ${dflt} } }, _ => ${dflt} })`;
        case 'float':
            return `(match ${at} { Some(Value::Float(__f)) => Value::Float(__f), Some(Value::Int(__n)) => Value::Float(__n as f64), Some(Value::Str(__s)) if !__s.is_empty() => match __s.parse::<f64>() { Ok(__f) => Value::Float(__f), Err(_) => ${dflt} }, _ => ${dflt} })`;
        case 'dict':
            return `(match ${at} { Some(__v) if matches!(__v, Value::Dict(_)) => __v, _ => ${dflt} })`;
        case 'list':
            return `(match ${at} { Some(__v) if matches!(__v, Value::Arr(_)) => __v, _ => ${dflt} })`;
        case 'bool':
            return `(match ${at} { Some(__v) if matches!(__v, Value::Bool(_)) => __v, _ => ${dflt} })`;
        }
        return undefined;
    }

    // ── closure-free dict reads / membership ──
    // A read keyed by a Str place prints `(if let (Some(__m), Some(__k)) = (M.as_map(), K.as_str()) { .. })`; `k in D`
    // on a proven Dict prints `D.as_map().is_some_and(..)`. Each site picks helper/closure/closure-free by line length.

    private rustDictPhase: 'normal' | 'probe' | 'final' = 'normal';
    private rustDictSites: Array<{ guarded: boolean, fc: number, ch: number, free: boolean }> = [];
    private rustDictDecisions: Array<'free' | 'closure' | 'helper'> = [];
    private rustDictOwnerDepth = 0;
    private rustDictHoistHosts = new Set<Node>();

    /** Base `Exchange` fields that hold plain, tag-free runtime state (never a cache/book marker). */
    static readonly RUST_DICT_FIELDS = new Set([
        'options', 'urls', 'markets', 'markets_by_id', 'currencies', 'currencies_by_id', 'commonCurrencies',
        'baseCurrencies', 'quoteCurrencies', 'timeframes', 'precision', 'limits', 'fees', 'has', 'exceptions',
        'features', 'api', 'accounts', 'accountsById', 'tokenBucket', 'headers', 'requiredCredentials',
        'networkAliases', 'balance', 'positions', 'ohlcvs', 'tickers', 'bidsasks', 'orderbooks', 'trades',
        'orders', 'myTrades', 'liquidations', 'myLiquidations', 'fundingRates', 'triggerOrders',
        'transactions', 'clients',
    ]);
    /** Fields whose values are themselves Dicts (cache containers / client handles). */
    static readonly RUST_DICT_VALUE_FIELDS = new Set([
        'ohlcvs', 'tickers', 'bidsasks', 'orderbooks', 'trades', 'orders', 'myTrades', 'liquidations',
        'myLiquidations', 'fundingRates', 'triggerOrders', 'positions', 'clients',
    ]);
    static readonly RUST_DICT_TAGGED_ENTRY_FIELDS = new Set([
        'options', 'urls', 'fees', 'exceptions', 'markets', 'currencies', 'headers', 'has', 'tokenBucket',
        'markets_by_id', 'currencies_by_id',
    ]);
    static readonly RUST_DICT_MARKER_KEYS = /^(?:timestamp|datetime|nonce|symbol|checksum|cache|hashmap|subscriptions|futures|\d+)$/;
    /** Base callees that only ever return a Dict (the content may still carry a marker). */
    static readonly RUST_DICT_CALLEES = new Set([
        'safeDict', 'safeDict2', 'safeDictN', 'safeDictionary', 'createSafeDictionary', 'extend', 'deepExtend',
        'omit', 'groupBy', 'indexBy', 'filterByArray',
    ]);

    /** Name of the base-Exchange runtime-state field behind `this.<name>`, else undefined. */
    rustDictField(node: Node): string | undefined {
        const n: any = this.rustSkipWrappers(node);
        if (n === undefined || !isPropertyAccessExpression(n) || n.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        const name = String(n.name.text);
        if (!RustTranspiler.RUST_DICT_FIELDS.has(name)) return undefined;
        let declaration: any;
        try {
            declaration = symbolValueDeclaration(this.getChecker().getSymbolAtLocation(n.name));
        } catch (e) {
            return undefined;
        }
        if (declaration === undefined || declaration.kind !== SyntaxKind.PropertyDeclaration) return undefined;
        return /ts[\\/]src[\\/]base[\\/](?:\.__ExchangeNoOverloads|Exchange)\.ts$/.test(String(declaration.getSourceFile().fileName)) ? name : undefined;
    }

    /** One dict-read site. `free` = closure-free text, `closure` = closure text, `helper` = the helper call;
     *  `guarded` = the helper form is kept when the closure would push the line over 400 chars. */
    rustDictSite(site: { free?: string, closure: string, helper?: string, guarded?: boolean }): string {
        const k = this.rustDictSites.length;
        const guarded = site.guarded === true && site.helper !== undefined;
        this.rustDictSites.push({
            guarded, free: site.free !== undefined,
            fc: site.free !== undefined ? site.free.length - site.closure.length : 0,
            ch: guarded ? site.closure.length - (site.helper as string).length : 0,
        });
        if (this.rustDictPhase === 'probe') return `\u0001${k}\u0002${guarded ? site.helper : site.closure}\u0003`;
        if (this.rustDictPhase === 'final') {
            const d = this.rustDictDecisions[k];
            if (d === 'helper' && site.helper !== undefined) return site.helper;
            if (d === 'closure' || site.free === undefined) return site.closure;
            return site.free;
        }
        return site.free ?? site.closure;
    }

    /** Dict read keyed by a Str place: closure-free when both operands are side-effect-free places. */
    rustDictRead(recv: string, key: string, node: Node, guarded = false): string {
        const free = RUST_PLAIN_PLACE.test(recv) && RUST_PLAIN_PLACE.test(key) && !this.isTestSource(node)
            ? `(if let (Some(__m), Some(__k)) = (${recv}.as_map(), ${key}.as_str()) { __m.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null })` : undefined;
        return this.rustDictSite({
            free, guarded, helper: `get_value(&${recv}, &${key})`,
            closure: `${recv}.as_map().and_then(|__m| ${key}.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null)`,
        });
    }

    /** `K.as_str().and_then(|__k| D.get(__k))` on a shadowed parameter map. */
    rustShadowKeyRead(shadow: string, key: string, node: Node): string {
        const free = RUST_PLAIN_PLACE.test(key) && !this.isTestSource(node)
            ? `(if let Some(__k) = ${key}.as_str() { ${shadow}.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null })` : undefined;
        return this.rustDictSite({ free, closure: `${key}.as_str().and_then(|__k| ${shadow}.get(__k)).cloned().unwrap_or(Value::Null)` });
    }

    /** `K.as_str().map(|__k| D.contains_key(__k)).unwrap_or(false)` on a shadowed parameter map. */
    rustShadowKeyHas(shadow: string, key: string, node: Node): string {
        const free = RUST_PLAIN_PLACE.test(key) && !this.isTestSource(node)
            ? `matches!(${key}.as_str(), Some(__k) if ${shadow}.contains_key(__k))` : undefined;
        return this.rustDictSite({ free, closure: `${key}.as_str().map(|__k| ${shadow}.contains_key(__k)).unwrap_or(false)` });
    }

    /** Key text a dict read can take as `K.as_str()`: any printed place/expression that is not a boxed literal. */
    rustDictKeyText(keyNode: Node): string | undefined {
        const keyType = this.getCheckedTypeOf(keyNode);
        if (keyType === undefined || (keyType.flags & (TypeFlags.NumberLike | TypeFlags.BigIntLike | TypeFlags.BooleanLike)) !== 0) return undefined;
        const key = this.printNode(keyNode, 0).trim();
        if (key === '' || /^(?:crate::)?Value::(?:Str|Int|Float|Bool|Null)\b/.test(key) || key.startsWith('&')) return undefined;
        return key;
    }

    /** `this.<field>[k]` with a non-literal key: the runtime reads the key as a Str and yields
     *  Null for anything else, which is `K.as_str()`; the field container is never tagged. */
    rustFieldDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        const field = this.rustDictField(receiverNode);
        if (field === undefined || field === 'accounts' || this.isTestSource(receiverNode)) return undefined;
        const key = this.rustDictKeyText(keyNode);
        if (key === undefined) return undefined;
        return this.rustDictRead(receiverText, key, receiverNode);
    }

    /** A local whose declaration and every write pin a Dict. 'plain': fresh object literals and nullish only
     *  (never tagged by the runtime); 'dicty': also dict-only base callees (content unproven). */
    rustDictLocalProof(ident: Node): 'plain' | 'dicty' | undefined {
        if (!isIdentifier(ident) || this.rustParamShadowOf(ident) !== undefined) return undefined;
        if (this.rustDictBearerDeclaration(ident) !== undefined || this.rustMapParamDeclaration(ident) !== undefined) return undefined;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || declaration.initializer === undefined) return undefined;
        // the printer declares these as typed maps / vectors, not as `let x: Value`
        if (this.rustReadBearerKindOfDeclaration(declaration) || this.rustDictLocalIsTyped(declaration)
            || this.rustNestedDictLocalIsTyped(declaration) || this.rustVecLocalIsTyped(declaration)) return undefined;
        const scope = this.rustEnclosingFunction(declaration);
        const symbol = this.rustSymbolOf(declaration.name);
        if (scope === undefined || isSourceFile(scope) || symbol === undefined) return undefined;
        let proof = this.rustDictSource(declaration.initializer, false);
        if (proof === undefined) return undefined;
        const name = String(ident.text);
        for (const n of this.rustScopeNameNodes(scope, name) as any[]) {
            if (n === declaration) continue;
            if (this.rustBindsName(n, name)) {
                if (this.rustSymbolOf(n.name) === undefined) return undefined;
                continue;
            }
            if (n.kind !== SyntaxKind.Identifier || n === declaration.name || this.rustSymbolOf(n) !== symbol) continue;
            let target: any = n;
            while (target.parent !== undefined && (isParenthesizedExpression(target.parent) || isNonNullExpression(target.parent) || isAsExpression(target.parent))) target = target.parent;
            const parent: any = target.parent;
            if (parent === undefined) continue;
            if (isBinaryExpression(parent) && parent.left === target && rustIsAssignmentOperator(parent.operatorToken.kind)) {
                if (parent.operatorToken.kind !== SyntaxKind.EqualsToken || this.rustEnclosingFunction(n) !== scope) return undefined;
                const rhs = this.rustDictSource(parent.right, true);
                if (rhs === undefined) return undefined;
                if (rhs === 'dicty') proof = 'dicty';
                continue;
            }
            if (parent.kind === SyntaxKind.PrefixUnaryExpression || parent.kind === SyntaxKind.PostfixUnaryExpression
                || ((isForOfStatement(parent) || isForInStatement(parent)) && parent.initializer === target)) return undefined;
            // a destructuring write `[x, y] = ..`
            if (parent.kind === SyntaxKind.ArrayLiteralExpression && isBinaryExpression(parent.parent) && parent.parent.left === parent) return undefined;
        }
        return proof;
    }

    /** 'plain' for a fresh object literal (or nullish when `allowNullish`), 'dicty' for a dict-only base callee. */
    rustDictSource(node: any, allowNullish: boolean): 'plain' | 'dicty' | undefined {
        const n: any = this.rustSkipWrappers(node);
        if (n === undefined) return undefined;
        if (isObjectLiteralExpression(n)) {
            return n.properties.some((p: any) => p.kind === SyntaxKind.SpreadAssignment) ? undefined : 'plain';
        }
        if (allowNullish && (n.kind === SyntaxKind.NullKeyword || (isIdentifier(n) && String(n.text) === 'undefined'))) return 'plain';
        if (isCallExpression(n) && isPropertyAccessExpression(n.expression) && n.expression.expression.kind === SyntaxKind.ThisKeyword
            && RustTranspiler.RUST_DICT_CALLEES.has(String(n.expression.name.text)) && this.rustCalleeIsBase(n)) return 'dicty';
        return undefined;
    }

    /** `X[k]` on a proven local with a non-literal key. */
    rustLocalDictRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        if (this.rustDictLocalProof(receiverNode) !== 'plain') return undefined;
        const key = this.rustDictKeyText(keyNode);
        if (key === undefined) return undefined;
        return this.rustDictRead(receiverText, key, receiverNode, true);
    }

    /** `X['k']` on a proven local, for a key the runtime does not route to a marker store. */
    rustLocalDictLiteralRead(receiverText: string, receiverNode: Node, keyText: string): string | undefined {
        const proof = this.rustDictLocalProof(receiverNode);
        if (proof === undefined || RustTranspiler.RUST_DICT_MARKER_KEYS.test(keyText)) return undefined;
        const literal = `"${this.escapeRustStringLiteral(keyText)}"`;
        return this.rustDictSite({
            guarded: true, helper: `get_value(&${receiverText}, &Value::Str(${literal}.into()))`,
            closure: `${receiverText}.as_map().and_then(|__m| __m.get(${literal})).cloned().unwrap_or(Value::Null)`,
        });
    }

    /** `k in D` on a base-field / field-container map or a proven local: `in_op`'s Dict arm. */
    rustDictInOp(key: Node, obj: Node): string | undefined {
        const recv: any = this.rustSkipWrappers(obj);
        if (recv === undefined) return undefined;
        let guarded = false;
        if (this.rustDictField(recv) === undefined) {
            const nested = isElementAccessExpression(recv) && recv.argumentExpression !== undefined
                && RustTranspiler.RUST_DICT_VALUE_FIELDS.has(String(this.rustDictField(recv.expression)))
                && !isStringLiteralLikeNode(recv.argumentExpression);
            if (!nested) {
                const proof = this.rustDictLocalProof(recv);
                // a dict-callee local keeps `in_op` for a computed key (content unproven); literal keys only
                if (proof === undefined || (proof !== 'plain' && !isStringLiteral(key))) return undefined;
                guarded = true;
            } else if (this.isTestSource(obj)) {
                return undefined;
            }
        } else if (this.isTestSource(obj)) {
            return undefined;
        }
        const recvText = this.printNode(recv, 0).trim();
        let keyText: string;
        if (isStringLiteral(key)) {
            const literal = this.rustStringLiteralOf(this.printStringLiteral(key));
            if (literal === undefined || (guarded && RustTranspiler.RUST_DICT_MARKER_KEYS.test(String(key.text)))) return undefined;
            return `Value::Bool(${this.rustDictSite({
                guarded, helper: `in_op(&${recvText}, &Value::Str(${literal}.into()))`,
                closure: `${recvText}.as_map().is_some_and(|__m| __m.contains_key(${literal}))`,
            })})`;
        }
        const printed = this.rustDictKeyText(key);
        if (printed === undefined) return undefined;
        // eslint-disable-next-line prefer-const
        keyText = printed;
        return `Value::Bool(${this.rustDictSite({
            guarded, helper: `in_op(&${recvText}, &${keyText})`,
            closure: `${recvText}.as_map().is_some_and(|__m| ${keyText}.as_str().is_some_and(|__k| __m.contains_key(__k)))`,
        })})`;
    }

    /** `this.F['k1']['k2'] = v` as a statement on a base runtime-state field: the first hop is the map's own
     *  `entry`, the write below it an `insert`; a value that reads `self` keeps the helper pair. */
    rustFieldNestedInsert(node: Node, baseExpr: any, keys: any[], keyStrs: string[], rhs: string): string | undefined {
        const field = this.rustDictField(baseExpr);
        // fields whose entries may be books / caches keep the tag-aware chain the native-insert pass prints
        if (keys.length !== 2 || field === undefined || RustTranspiler.RUST_DICT_TAGGED_ENTRY_FIELDS.has(field) || this.isTestSource(node)) return undefined;
        const parent: any = node.parent;
        if (parent === undefined || parent.kind !== SyntaxKind.ExpressionStatement || /\bself\b/.test(rhs)) return undefined;
        if (!isStringLiteral(keys[0]) || !isStringLiteral(keys[1])) return undefined;
        const k1 = this.rustStringLiteralOf(keyStrs[0]);
        const k2 = this.rustStringLiteralOf(keyStrs[1]);
        if (k1 === undefined || k2 === undefined) return undefined;
        const recv = this.printNode(baseExpr, 0).trim();
        const trimmed = rhs.trim();
        const value = this.rustPrintedBoolArg(rhs) ? `Value::Bool(${rhs})`
            : RustTranspiler.cloneIfBareLocal(trimmed, rhs);
        return `if let Value::Dict(__r08a) = &mut ${recv} { let __r08e = std::sync::Arc::make_mut(__r08a).entry(${k1}.to_string()).or_insert(Value::Null);`
            + ` if let Value::Dict(__r08b) = __r08e { std::sync::Arc::make_mut(__r08b).insert(${k2}.to_string(), ${value}); } }`;
    }

    /** `x[k] = f(x[k])`: the read sits in the value of an assignment the printer writes as a native
     *  insert (which binds the value first, `{ let __be_tmp = ..; insert }`), so the position rule that
     *  protects the helper-form write passes does not apply to it. */
    rustDictReadInNativeInsert(acc: string, receiver: Node, key: Node, chain: Node): string | undefined {
        if (this.isNativeWriteTargetBase(chain) || this.isTestSource(chain)) return undefined;
        const root = this.rootPlaceText(chain);
        if (root === undefined) return undefined;
        let host: any;
        for (let current: any = chain.parent; current; current = current.parent) {
            if (isStatement(current) || isSourceFile(current) || isFunctionLike(current)) break;
            if (isBinaryExpression(current) && current.operatorToken.kind === SyntaxKind.EqualsToken
                && this.isNodeInsideNode(chain, current.right) && this.rootPlaceText(current.left) === root) host = current;
        }
        if (host === undefined || !isElementAccessExpression(host.left)
            || host.parent?.kind !== SyntaxKind.ExpressionStatement || !this.isNativeAccessPositionSafe(chain, host)) return undefined;
        const base: any = host.left.expression;
        const keyNode: any = host.left.argumentExpression;
        const keyText = this.printNode(keyNode, 0);
        const writesNatively = !isElementAccessExpression(base) && (this.rustBearerDictInsert(base, keyNode, keyText, 'x') ?? this.rustMapParamDictInsert(base, keyNode, keyText, 'x')
            ?? this.printNativeBookMetaWrite(base, keyNode, keyText, 'x') ?? this.printNativeDictInsert(base, keyNode, keyText, 'x')
            ?? this.rustNativeDictInsert(base, keyNode, keyText, 'x')) !== undefined;
        if (isStringLiteralLikeNode(key)) return undefined;
        const read = this.rustFieldDynamicRead(acc, receiver, key) ?? this.rustLocalDictRead(acc, receiver, key);
        if (read !== undefined && !writesNatively) this.rustDictHoistHosts.add(host);
        return read;
    }

    /** Characters the ccxt clone passes add to a printed line afterwards: every bare local passed by value in a
     *  call or array-literal argument slot gets a `.clone()` (`autoCloneCallArgs` / `cloneInArrayLiterals`). */
    rustDictCloneGrowth(line: string): number {
        // a dynamic `throw new E[k](m)` prints `(read)::new(m)`; the ccxt create_error rewrite wraps both operands
        const thrown = /^\s*panic!\("\{\}", .*::new\(/.test(line)
            ? 'crate::exchange_errors::create_error(&crate::runtime::stringify_param(&('.length + ')), &crate::runtime::stringify_param(&('.length + ')))'.length - '::new('.length - 1 : 0;
        const masked = line.replace(/"(?:[^"\\]|\\.)*"/g, (m) => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"');
        let n = 0;
        // eslint-disable-next-line no-useless-escape
        for (const m of masked.matchAll(/(?<=[(\[,]\s?)([A-Za-z_][A-Za-z0-9_]*)(?=\s*[,)\]])/g)) {
            const start = m.index as number;
            const before = masked.slice(Math.max(0, start - 6), start);
            if (/&\s*(?:mut\s+)?$/.test(before) || /\bmut\s+$/.test(before) || /[:.]$/.test(before.trimEnd())) continue;
            if (/^(?:self|true|false|None|Some|Ok|Err|Value|i64|f64|String|usize|bool|__\w+)$/.test(m[1])) continue;
            n += 8;
        }
        return n + thrown;
    }

    /** `this.<field>['k'].length`: a read-only use of a literal-key read off a base runtime-state field. */
    rustFieldLengthRead(acc: string, receiver: Node, key: Node, chain: Node): string | undefined {
        const parent: any = chain.parent;
        if (parent === undefined || !isPropertyAccessExpression(parent) || parent.expression !== chain || String(parent.name.text) !== 'length') return undefined;
        if (this.rustDictField(receiver) === undefined || !isStringLiteralLikeNode(key) || this.isTestSource(chain) || !RUST_PLAIN_PLACE.test(acc)) return undefined;
        const text = String((key as any).text);
        if (text === '' || !/^[A-Za-z0-9_./-]+$/.test(text)) return undefined;
        const literal = `"${text}"`;
        return this.rustDictSite({
            guarded: true, helper: `get_value(&${acc}, &Value::Str(${literal}.into()))`,
            closure: `${acc}.as_map().and_then(|__m| __m.get(${literal})).cloned().unwrap_or(Value::Null)`,
        });
    }

    /** Statement-like nodes whose finished lines the 400-char budget is measured on. */
    private rustDictIsOwner(node: Node): boolean {
        switch (node.kind) {
        case SyntaxKind.ExpressionStatement:
        case SyntaxKind.VariableStatement:
        case SyntaxKind.ReturnStatement:
        case SyntaxKind.ThrowStatement:
        case SyntaxKind.IfStatement:
        case SyntaxKind.WhileStatement:
        case SyntaxKind.ForStatement:
            return true;
        default:
            return false;
        }
    }

    printNode(node, identation = 0): string {
        if (this.rustDictOwnerDepth > 0 || !this.rustDictIsOwner(node)) return super.printNode(node, identation);
        this.rustDictOwnerDepth++;
        try {
            return this.rustDictPrintOwner(node, identation);
        } finally {
            this.rustDictOwnerDepth--;
        }
    }

    /** Print a statement; when a finished line of it passes 400 chars, decide each dict site against the
     *  line it sits on (the budget the closure-free / closure / helper forms are chosen under). */
    private rustDictPrintOwner(node: Node, identation: number): string {
        const loops = this.forLoopCounter;
        this.rustDictPhase = 'normal';
        this.rustDictSites = [];
        const out = super.printNode(node, identation);
        const sites = this.rustDictSites;
        this.rustDictSites = [];
        if (sites.length === 0 || !sites.some((s) => s.fc > 0 || s.ch > 0) || !out.split('\n').some((l) => l.length > 400)) return out;
        this.rustDictPhase = 'probe';
        this.forLoopCounter = loops;
        const probe = super.printNode(node, identation);
        const probed = this.rustDictSites.length;
        this.rustDictSites = [];
        if (probed !== sites.length) return out;
        const decisions: Array<'free' | 'closure' | 'helper'> = sites.map(() => 'free');
        // Each site is judged against the line as the earlier stage left it (not cumulatively):
        // guarded sites first (helper vs closure), then closure vs closure-free.
        for (const line of probe.split('\n')) {
            // eslint-disable-next-line no-control-regex
            const ids = [ ...line.matchAll(/\u0001(\d+)\u0002/g) ].map((m) => Number(m[1]));
            if (ids.length === 0) continue;
            // eslint-disable-next-line no-control-regex
            const plain = line.replace(/\u0001\d+\u0002|\u0003/g, '');
            const base = plain.length + this.rustDictCloneGrowth(plain);
            let closureLen = base;
            for (const k of ids) {
                const s = sites[k];
                if (!s.guarded || s.ch <= 0) continue;
                if (base <= 400 && base + s.ch > 400) decisions[k] = 'helper';
                else closureLen += s.ch;
            }
            for (const k of ids) {
                const s = sites[k];
                if (decisions[k] === 'helper') continue;
                if (!s.free) { decisions[k] = 'closure'; continue; }
                if (closureLen <= 400 && closureLen + s.fc > 400) decisions[k] = 'closure';
            }
        }
        this.rustDictPhase = 'final';
        this.rustDictDecisions = decisions;
        this.forLoopCounter = loops;
        try {
            const final = super.printNode(node, identation);
            return this.rustDictSites.length === sites.length ? final : out;
        } finally {
            this.rustDictPhase = 'normal';
            this.rustDictSites = [];
            this.rustDictDecisions = [];
        }
    }

    printNativeMapAccess(receiverText: string, receiverNode: Node, keyText: string): string | undefined {
        // `client.url` on a ws `Client`: the handle's own accessor, no map closure.
        if (keyText === 'url' && this.rustIsWsClientType(this.getCheckedTypeOf(receiverNode))) return `${receiverText}.url()`;
        // A native-map parameter is an `&mut IndexMap` too.
        if (this.rustMapParamDeclaration(receiverNode) !== undefined && RustTranspiler.rustBearerKeyTextOk(keyText)) {
            return `${receiverText}.get("${this.escapeRustStringLiteral(keyText)}").cloned().unwrap_or(Value::Null)`;
        }
        // A typed dict bearer is a bare IndexMap, so the read is the
        // map lookup itself — no `as_map()` box and no `|__m|` closure.
        if (this.rustDictBearerDeclaration(receiverNode) !== undefined) {
            if (!RustTranspiler.rustBearerKeyTextOk(keyText)) return undefined;
            return `${receiverText}.get("${this.escapeRustStringLiteral(keyText)}").cloned().unwrap_or(Value::Null)`;
        }
        if (!this.isProvenMapExpression(receiverNode) && !this.rustLiteralReadOk(receiverNode, keyText)) {
            // Declared-Dict locals read natively too (see the classifier below).
            if (!this.rustIsDeclaredDictLocal(receiverNode)) return undefined;
            if (RustTranspiler.RUST_DICT_LOCAL_UNSAFE_KEYS.has(keyText)) return undefined;
            if (keyText === '' || /^\d+$/.test(keyText)) return undefined;
        }
        const key = this.escapeRustStringLiteral(keyText);
        return `${receiverText}.as_map().and_then(|__m| __m.get("${key}")).cloned().unwrap_or(Value::Null)`;
    }

    // Declared-Dict locals: the checker types many dict-holding locals `any`, losing the proof
    // above, but the declaration still proves a plain dict (object literal, `getArg(.., {})` bag,
    // `this.safeDict`, `extend` onto those, or an element of a map-typed container) at every read.

    /** Keys `get_value(_k)` serves from the book store, a cache bucket or a
     *  live `__live_id` snapshot instead of from the dict itself: those routes
     *  are invisible to a plain map read, so they keep the helper. */
    static readonly RUST_DICT_LOCAL_UNSAFE_KEYS = new Set([
        'timestamp', 'datetime', 'nonce', 'symbol', 'checksum', 'cache',
        'hashmap', 'subscriptions', 'futures',
    ]);

    rustDeclarationOfIdentifier(node: Node): Declaration | undefined {
        if (!isIdentifier(node)) return undefined;
        try {
            const symbol: any = this.getChecker().getSymbolAtLocation(node);
            return symbolValueDeclaration(symbol);
        } catch (e) {
            return undefined;
        }
    }

    /** Initializer shapes that construct or return a plain dict. */
    rustDictProducingInitializer(node: Node | undefined, seen: Set<Node>): boolean {
        if (node === undefined || node === null || seen.has(node)) return false;
        seen.add(node);
        if (isObjectLiteralExpression(node)) return true;
        if (isParenthesizedExpression(node) || isAsExpression(node) ||
            isNonNullExpression(node) || isTypeAssertion(node)) {
            return this.rustDictProducingInitializer((node as any).expression, seen);
        }
        if (isIdentifier(node)) {
            const declaration: any = this.rustDeclarationOfIdentifier(node);
            if (declaration === undefined || !isVariableDeclaration(declaration)) return false;
            return this.rustDictProducingInitializer(declaration.initializer, seen);
        }
        if (isElementAccessExpression(node)) {
            // `this.markets[symbol]`: the container's declared element type is
            // what the rust port stores there.
            const containerType = this.getCheckedTypeOf((node as any).expression);
            if (containerType === undefined) return false;
            const elementType = this.getChecker().getIndexTypeOfType(containerType, IndexKind.String);
            return elementType !== undefined && this.isProvenMapType(elementType);
        }
        if (!isCallExpression(node)) return false;
        const callee: any = (node as any).expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        const name = String(callee.name.text);
        // Readers whose rust counterpart returns the stored dict itself.
        // `this.client(url)` returns the WS client handle Dict the runtime keeps
        // (`Map{url, subscriptions, futures}`), never a class instance.
        if (['safeDict', 'safeMarketStructure', 'market', 'currency', 'safeMarket', 'safeCurrency', 'client'].includes(name)) return true;
        // `extend`/`deepExtend` merge onto their first argument.
        if (name === 'extend' || name === 'deepExtend') {
            return this.rustDictProducingInitializer((node as any).arguments[0], seen);
        }
        return false;
    }

    /** D2: the proof holds only while nothing re-assigns the local. */
    rustLocalIsReassigned(declaration: Declaration, name: string): boolean {
        let scope: Node | undefined = declaration;
        while (scope !== undefined && !isFunctionLike(scope) && !isSourceFile(scope)) scope = scope.parent;
        if (scope === undefined) return true;
        // only an identifier spelled `name` can be the assignment's left side
        return this.rustScopeNameNodes(scope, name).some((id: any) => {
            const node: any = id.parent;
            return id.kind === SyntaxKind.Identifier && node !== undefined && isBinaryExpression(node) && node.left === id
                && node.operatorToken.kind >= SyntaxKind.FirstAssignment && node.operatorToken.kind <= SyntaxKind.LastAssignment;
        });
    }

    /** True when the receiver is a local declared as (or provably holding) a
     *  plain dict — `get_value(_k)` and this read agree on every key the
     *  runtime does not route elsewhere. */
    rustIsDeclaredDictLocal(node: Node): boolean {
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined) return false;
        const name = declaration.name?.text;
        if (typeof name !== 'string') return false;
        if (isParameterDeclaration(declaration)) {
            // A `Client`-typed parameter is the WS handle passed to `handle_message`/`handle*`
            // (`ws_client::client_value`): a `Value::Dict{url, subscriptions, futures}` in the port, not
            // the TS class. Its fields are plain map reads.
            if (!this.rustParameterIsClientHandle(declaration) && !this.rustDictProducingInitializer(declaration.initializer, new Set())) return false;
        } else if (isVariableDeclaration(declaration)) {
            if (!this.rustDictProducingInitializer(declaration.initializer, new Set())) return false;
        } else {
            return false;
        }
        return !this.rustLocalIsReassigned(declaration, name);
    }

    /** The ws `OrderBook` class (`ts/src/base/ws/OrderBook.ts`): the rust port never
     *  builds a struct for it — `order_book()` returns a `Value::Dict` — so its
     *  element reads are plain map reads on a proven map. */
    rustWsOrderBookClassType(type: Type | undefined): boolean {
        if (type === undefined) return false;
        if (type.flags & (TypeFlags.Union | TypeFlags.Intersection)) {
            return (typeParts(type) ?? []).some((member: Type) => this.rustWsOrderBookClassType(member));
        }
        if (!(type.flags & TypeFlags.Object)) return false;
        const symbol: any = this.typeSymbolOf(type);
        if (symbol === undefined || symbol.name !== 'OrderBook' || (symbol.flags & SymbolFlags.Class) === 0) return false;
        const members = (type.getProperties?.() ?? []).map((p: any) => String(p.name));
        return members.includes('bids') && members.includes('asks');
    }

    /** Types the port stores as a plain `Value::Dict`: a checker-proven map, or the
     *  ws order book class. */
    rustDictBearerType(type: Type | undefined): boolean {
        return this.isProvenMapType(type as Type) || this.rustWsOrderBookClassType(type);
    }

    /** A parameter declared as the ws `Client` class (or a union with it). The
     *  class is the default export of `ts/src/base/ws/Client.ts`, so its type
     *  symbol is named `default`; the declaration itself carries the name. */
    rustParameterIsClientHandle(declaration: ParameterDeclaration): boolean {
        return this.rustIsWsClientType(this.getCheckedTypeOf(declaration.name));
    }

    /** The ws `Client` class (or a union with it); its type symbol is the file's `default` export. */
    rustIsWsClientType(type: Type | undefined): boolean {
        const named = (t: Type | undefined): boolean => {
            if (t === undefined) return false;
            return symbolDeclarations(this.typeSymbolOf(t)).some((d: any) => {
                if (!isClassDeclaration(d) || d.name === undefined || d.name.text !== 'Client') return false;
                const file = String(d.getSourceFile().fileName).replace(/\\/g, '/');
                return file.endsWith('/ws/Client.ts') || file.endsWith('/ws/Client.d.ts');
            });
        };
        return named(type) || (typeParts(type) ?? []).some((member: Type) => named(member));
    }

    /** Constant string argument of `parseInt`/`parseFloat` folded the way rust's
     *  `str::parse` would; undefined when the fold is not obviously exact. */
    foldParsedStringLiteral(name: string, text: string): string | undefined {
        const t = text.trim();
        if (name === 'parseInt') {
            if (!/^[+-]?[0-9]+$/.test(t)) return undefined;
            const value = BigInt(t.replace(/^\+/, '') || '0');
            if (value < -9223372036854775808n || value > 9223372036854775807n) return undefined;
            return `Value::Int(${value.toString()})`;
        }
        if (!/^[+-]?[0-9]+(?:\.[0-9]+)?$/.test(t)) return undefined;
        const value = Number(t);
        // `String(value)` must re-read as a rust float literal holding the same f64;
        // `-0` prints as `0`, which would drop the sign the runtime keeps.
        if (!Number.isFinite(value) || Object.is(value, -0)) return undefined;
        if (!/^-?[0-9]+(?:\.[0-9]+)?$/.test(String(value))) return undefined;
        return `Value::Float(${String(value)})`;
    }

    /** `parseInt(x)` / `parseFloat(x)` with a single checker-proven string argument
     *  become the runtime helper's own match with native `str::parse`; every other
     *  argument shape keeps the helper call the ccxt post-pass rewrites. */
    printNativeParseCall(node: CallExpression): string | undefined {
        const callee = node.expression;
        if (!isIdentifier(callee)) return undefined;
        const name = String(callee.text);
        const helper = RustTranspiler.RUST_PARSE_HELPERS[name];
        if (helper === undefined) return undefined;
        if (node.arguments.length !== 1) return undefined; // radix / unknown arity
        const arg = node.arguments[0];
        const type = this.getCheckedTypeOf(arg);
        if (type === undefined || !this.isStringType(type.flags)) return undefined;
        if (isStringLiteralLikeNode(arg)) {
            const folded = this.foldParsedStringLiteral(name, arg.text);
            if (folded !== undefined) return folded;
        }
        const argText = this.printNode(arg, 0).trim();
        // The post-pass adds the `&`; a text that already carries one is not a place.
        if (!argText || argText.startsWith('&')) return undefined;
        if (helper === 'i64') {
            return `(match &${argText} { Value::Str(__parse_s) => __parse_s.trim().parse::<i64>().map(Value::Int).unwrap_or(Value::Null), Value::Int(__parse_n) => Value::Int(*__parse_n), Value::Float(__parse_f) => Value::Int(*__parse_f as i64), _ => Value::Null })`;
        }
        return `(match &${argText} { Value::Str(__parse_s) => __parse_s.trim().parse::<f64>().map(Value::Float).unwrap_or(Value::Null), Value::Float(__parse_f) => Value::Float(*__parse_f), Value::Int(__parse_n) => Value::Float(*__parse_n as f64), _ => Value::Null })`;
    }

    isNodeInsideNode(node: Node, container: Node): boolean {
        return node.pos >= container.pos && node.end <= container.end;
    }

    /** Root place of an access chain (`x` for `x['a']['b']`, `this.balance` for
     *  `this.balance['usdt']`), or undefined for a temporary. */
    rootPlaceText(node: Node): string | undefined {
        let current: any = node;
        while (isPropertyAccessExpression(current) || isElementAccessExpression(current) || isParenthesizedExpression(current)) {
            if (!isParenthesizedExpression(current) && current.expression.kind === SyntaxKind.ThisKeyword) return current.getText().trim();
            current = current.expression;
        }
        return current && (isIdentifier(current) || current.kind === SyntaxKind.ThisKeyword) ? current.getText().trim() : undefined;
    }

    /** The ccxt post-passes hoist `get_value(...)` reads out of `&mut` calls by
     *  matching their text; the native form is invisible to them, so it is only
     *  emitted where no such hoist is needed. */
    isNativeAccessPositionSafe(node: Node, ignoreAssign?: Node): boolean {
        const parent = node.parent;
        // `x['k'].push(...)` / `x['k'](...)`: the post-pass rewrites the target.
        if (parent && (isPropertyAccessExpression(parent) || isCallExpression(parent)) && parent.expression === node && !this.pureStringMethodReceiver(node)) return false;
        const root = this.rootPlaceText(node);
        for (let current: any = node.parent; current; current = current.parent) {
            if (isStatement(current) || isSourceFile(current) || isFunctionLike(current)) break;
            if (isBinaryExpression(current) && this.isNodeInsideNode(node, current.right)) {
                const op = current.operatorToken.kind;
                const isAssign = op === SyntaxKind.EqualsToken || (op >= SyntaxKind.PlusEqualsToken && op <= SyntaxKind.CaretEqualsToken);
                if (isAssign && root !== undefined && current !== ignoreAssign && this.rootPlaceText(current.left) === root) return false;
            }
            if (isCallExpression(current) && isPropertyAccessExpression(current.expression) &&
                this.isNodeInsideNode(node, current) && current.arguments.some(a => this.isNodeInsideNode(node, a))) {
                const callee = current.expression;
                // Same-place receiver (`x.push(x[0])`) is rewritten to `&mut x` args.
                if (root !== undefined && this.rootPlaceText(callee.expression) === root) return false;
                // `&mut self.<method>(...)` arg lists are hoisted by the ccxt
                // pass because a `&self` reborrow conflicts with the outer `&mut self`.
                if (callee.expression.kind === SyntaxKind.ThisKeyword &&
                    RustTranspiler.MUT_SELF_METHODS.has(this.toSnakeCaseName(String(callee.name.text))) &&
                    (root === undefined || root === 'this' || root.startsWith('this.'))) return false;
            }
        }
        return true;
    }

    /** `(x.k as T).push(..)`: the cast wrapper hides the push receiver from the position check. */
    isCastOrParenOperand(node: Node): boolean {
        return node.parent !== undefined && (isAsExpression(node.parent) || isParenthesizedExpression(node.parent));
    }

    /** Receiver shapes whose printed text is a single `Value` place (`x`, `this.x`). */
    isShallowValueReceiver(node: Node): boolean {
        return isIdentifier(node) || (isPropertyAccessExpression(node) && node.expression.kind === SyntaxKind.ThisKeyword);
    }

    /** True when this read is the receiver of an element-access chain that is
     *  written (`x['a'] = v`, `x['a']['b'] = v`, `delete x['a']['b']`), or a
     *  property write itself (`x.k = v`, `delete x.k`). The ccxt write passes
     *  match the `get_value(&…)` / `x.k` text to reach the real container, so a
     *  native read would write into a discarded clone. */
    isNativeWriteTargetBase(node: Node): boolean {
        const isWrite = (n: any, target: any) => n !== undefined && (isDeleteExpression(n) ||
            (isBinaryExpression(n) && n.left === target && rustIsAssignmentOperator(n.operatorToken.kind)));
        const parent: any = node.parent;
        if (isWrite(parent, node)) return true;
        if (parent === undefined || !isElementAccessExpression(parent) || parent.expression !== node) return false;
        let current: any = parent;
        while (current.parent !== undefined && isElementAccessExpression(current.parent) && current.parent.expression === current) current = current.parent;
        return isWrite(current.parent, current);
    }

    transformPropertyAcessExpressionIfNeeded(node) {
        // Printed here (as before) so the receiver's loop-flag numbering in the
        // generated file matches the pinned baseline for non-length accesses.
        const leftExpr = this.printNode(node.expression, 0);
        if (node.name.text !== 'length') return undefined;
        const shadow = this.rustParamShadowOf(node.expression);
        const native = shadow !== undefined ? this.printShadowLength(shadow) : undefined;
        return native ?? this.printArrayLength(node, 0, leftExpr);
    }

    // `crate::value::get_value_k` is `get_value` for a `&str` key — the same
    // dict lookup minus the per-read `Value::Str` allocation. Three literal-key
    // families reach branches only `get_value` has (numeric cache/side indices,
    // the cache `hashmap` bucket, live client `subscriptions`/`futures`) and a
    // `this`/class receiver is not a `Value`, so those keep `get_value`.
    staticKeyLookup(node, container): string | undefined {
        if (!isStringLiteral(node)) return undefined;
        // Test sources keep the allocating form: the test-only post-passes
        // pattern-match `get_value(&…, &Value::Str(…))` call sites.
        const source = (node as any).getSourceFile ? (node as any).getSourceFile().fileName : '';
        if (typeof source === 'string' && /\/test\//.test(source)) return undefined;
        if (container.kind === SyntaxKind.ThisKeyword) return undefined;
        const text = node.text;
        if (text === '' || text in this.StringLiteralReplacements) return undefined;
        if (/^\d+$/.test(text) || text === 'hashmap' || text === 'subscriptions' || text === 'futures') return undefined;
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) return undefined;
        const type = checker.getTypeAtLocation(container);
        if (type !== undefined && ((type as any).objectFlags & ObjectFlags.Class)) return undefined;
        return this.quotedStringLiteral(text);
    }

    printElementAccessExpression(node, identation) {
        const special = this.printElementAccessExpressionExceptionIfAny(node);
        if (special) return special;
        const dynamicField = this.printDynamicSelfRead(node);
        if (dynamicField !== undefined) return dynamicField;
        // `obj['x'] = v` is rewritten to `crate::set_value(...)` by a pass that
        // matches the `get_value(&obj, &key)` target shape, so targets keep it.
        // `d['a'].push(v)` lowers to `append_to_array(&mut <target>, v)` and the
        // ccxt pass giving it write-through semantics (`append_to_object_array`)
        // matches `append_to_array(&mut get_value(&` literally, so call/property
        // targets keep the allocating form too: `get_value_k` is invisible to
        // that pass and the append would land on a discarded COW clone.
        const parent = node.parent;
        const keepGetValue = parent !== undefined && (
            (isBinaryExpression(parent) && parent.left === node &&
                parent.operatorToken.kind >= SyntaxKind.FirstAssignment && parent.operatorToken.kind <= SyntaxKind.LastAssignment) ||
            ((isPropertyAccessExpression(parent) || isCallExpression(parent)) && parent.expression === node));
        const chain: any[] = [];
        let current: any = node;
        while (isElementAccessExpression(current)) {
            chain.unshift(current);
            current = current.expression;
        }
        // One checker proof per chain: the emitted text replaces `get_value` only
        // when it is legal at the position the whole chain occupies.
        const nativeAllowed = this.isNativeAccessPositionSafe(node) && !this.isNativeWriteTargetBase(node);
        // A two-level bearer reads both levels in one lookup.
        if (nativeAllowed && chain.length === 2 && isIdentifier(current)) {
            const nested = this.rustNestedBearerRead(current, chain[0].argumentExpression, chain[1].argumentExpression);
            if (nested !== undefined) return nested;
        }
        let acc = this.printNode(current, 0);
        for (const { expression: receiver, argumentExpression: key } of chain) {
            const native = nativeAllowed ? this.printNativeContainerAccess(acc, receiver, key)
                : (this.rustDictReadInNativeInsert(acc, receiver, key, node) ?? this.rustFieldLengthRead(acc, receiver, key, node));
            const staticKey = native === undefined && !keepGetValue ? this.staticKeyLookup(key, receiver) : undefined;
            acc = native ?? (staticKey !== undefined
                ? `crate::value::get_value_k(&${acc}, ${staticKey})`
                : `get_value(&${acc}, &${this.printNode(key, 0)})`);
        }
        return acc;
    }

    printForStatement(node, identation) {
        const idn = this.getIden(identation);
        const idn1 = this.getIden(identation + 1);
        let initStr = node.initializer ? this.printNode(node.initializer, identation + 1) + ';\n' : '';
        let condStr = node.condition ? this.printComparisonInBooleanContext(node.condition, 0).trim() : 'true';
        const incrStr = node.incrementor ? this.printNode(node.incrementor, 0) : '';
        // A proven `Value::Int` counter steps in place; one that only indexes lists is a plain `i64`.
        const counter = incrStr !== '' ? this.rustIntCounter(node, initStr, incrStr) : undefined;
        const bound = counter?.sign === '+' ? this.rustI64CounterPlan(node, counter, condStr) : undefined;
        const printBody = () => node.statement.statements.map(s => this.printNode(s, identation + 1)).join('\n');
        let statements: string;
        let typed = false;
        if (bound !== undefined && counter !== undefined) {
            const before = this.forLoopCounter;
            const previous = this.rustI64Counters.get(counter.name);
            this.rustI64Counters.set(counter.name, counter.symbol);
            try {
                statements = printBody();
            } finally {
                if (previous === undefined) this.rustI64Counters.delete(counter.name);
                else this.rustI64Counters.set(counter.name, previous);
            }
            typed = this.rustI64BodyIsClosed(statements, counter.name);
            if (!typed) {
                this.forLoopCounter = before;
                statements = printBody();
            }
        } else {
            statements = printBody();
        }
        const body = `{\n${statements}\n${idn}}`;
        // A C-style `for` becomes a Rust `while`. The increment must run on
        // every iteration *including* one ended by `continue`, so it is folded
        // into the condition (guarded by a first-iteration flag); at the end of
        // the body a `continue` would skip it and spin the loop forever.
        if (incrStr !== '') {
            const flag = `__for_first_${this.forLoopCounter++}`;
            let step = `${incrStr};`;
            if (counter !== undefined) {
                // `n` unless the function already uses that name: an early text pass reads `*n` as a use of that local.
                const bind = (this.rustScopeNameNodes(this.rustEnclosingFunction(node), 'n') as any[]).length > 0 ? '__n' : 'n';
                step = `if let Value::Int(${bind}) = &mut ${counter.name} { *${bind} ${counter.sign}= 1; }`;
            }
            if (typed && counter !== undefined && bound !== undefined) {
                initStr = initStr.replace(`let mut ${counter.name}: Value = Value::Int(${counter.literal});`, `let mut ${counter.name}: i64 = ${counter.literal};`);
                condStr = `${counter.name} < (${bound}.len() as i64)`;
                step = `${counter.name} += 1;`;
            }
            const cond = `{ if !${flag} { ${step} } ${flag} = false; ${condStr} }`;
            return `${idn}{\n${idn1}${initStr}${idn1}let mut ${flag}: bool = true;\n${idn1}while ${cond} ${body}\n${idn}}`;
        }
        return `${idn}{\n${idn1}${initStr}${idn1}while ${condStr} ${body}\n${idn}}`;
    }

    // `for (let i = <int>; …; i++)` over a `Value` counter: when the incrementor is the only write
    // to `i` the payload is always `Value::Int`, so the step bumps it in place (no 5-arm match).
    rustIntCounter(node, initStr: string, incrStr: string): { name: string, sign: '+' | '-', literal: string, symbol: any } | undefined {
        const init: any = node.initializer;
        const incr: any = node.incrementor;
        if (init?.kind !== SyntaxKind.VariableDeclarationList || init.declarations.length !== 1 || !(init.flags & NodeFlags.BlockScoped)) return undefined;
        const declaration: any = init.declarations[0];
        if (!isIdentifier(declaration.name) || /\/test\//.test(String(node.getSourceFile?.().fileName ?? ''))) return undefined;
        const name = String(declaration.name.text);
        // The declaration must print as the boxed int literal the Int payload relies on.
        const printed = new RegExp(`^let mut ${name}: Value = Value::Int\\((-?\\d+)\\);$`).exec(initStr.trim());
        if (printed === null) return undefined;
        const sign = [ '+', '-' ].find((s) => incrStr.trim() === `${name} = ${this.printNativeNumeric(s === '+' ? SyntaxKind.PlusToken : SyntaxKind.MinusToken, name, 'Value::Int(1)')}`) as '+' | '-' | undefined;
        if (sign === undefined) return undefined;
        const symbol = this.rustSymbolOf(declaration.name);
        if (symbol === undefined) return undefined;
        for (const n of this.rustScopeNameNodes(node, name) as any[]) {
            if (n === declaration || n === declaration.name || this.isNodeInsideNode(n, incr)) continue;
            if (n.kind === SyntaxKind.VariableDeclaration && this.rustBindsName(n, name)) return undefined;
            if (n.kind === SyntaxKind.Identifier && this.rustSymbolOf(n) === symbol && this.rustIdentifierIsWritten(n)) return undefined;
        }
        return { name, sign, literal: printed[1], symbol };
    }

    /** True when the identifier is (part of) an assignment target, a `++`/`--` operand or a `for-in/of` head. */
    rustIdentifierIsWritten(id: any): boolean {
        let current: any = id;
        while (current.parent !== undefined && (isParenthesizedExpression(current.parent) || isArrayLiteralExpression(current.parent)
            || isObjectLiteralExpression(current.parent) || isShorthandPropertyAssignment(current.parent)
            || current.parent.kind === SyntaxKind.PropertyAssignment || current.parent.kind === SyntaxKind.SpreadElement
            || current.parent.kind === SyntaxKind.SpreadAssignment || isAsExpression(current.parent) || isNonNullExpression(current.parent))) {
            current = current.parent;
        }
        const up: any = current.parent;
        if (up === undefined) return false;
        if (isBinaryExpression(up)) return up.left === current && rustIsAssignmentOperator(up.operatorToken.kind);
        if (up.kind === SyntaxKind.PostfixUnaryExpression || up.kind === SyntaxKind.PrefixUnaryExpression) {
            return up.operator === SyntaxKind.PlusPlusToken || up.operator === SyntaxKind.MinusMinusToken;
        }
        return (isForInStatement(up) || isForOfStatement(up)) && up.initializer === current;
    }

    // ── `i64` loop counters ───────────────────────────────────────────────────
    // A proven `Value::Int` counter bounded by `i < <place>.length` whose every other use is a list
    // index read or a boxed argument/initializer is a plain `i64`: reads become `.get(i as usize)`,
    // boxed uses `Value::Int(i)`. The body is printed with the counter registered; if any use printed
    // another way the body is printed again as a `Value` counter.
    private rustI64Counters = new Map<string, any>();

    /** The place `X` of a `i < X.length` condition over this counter, when its uses are all admissible. */
    rustI64CounterPlan(node, counter: { name: string, symbol: any }, condStr: string): string | undefined {
        const printed = new RegExp(`^${counter.name}\\.as_f64\\(\\)\\.unwrap_or\\(f64::NAN\\) < Value::Int\\((self\\.\\w+|\\w+)\\.len\\(\\) as i64\\)\\.as_f64\\(\\)\\.unwrap_or\\(f64::NAN\\)$`).exec(condStr);
        if (printed === null) return undefined;
        for (const id of this.rustScopeNameNodes(node.statement, counter.name) as any[]) {
            if (id.kind !== SyntaxKind.Identifier || this.rustIdentifierIsPropertyName(id) || this.rustSymbolOf(id) !== counter.symbol) continue;
            const up: any = id.parent;
            const admissible = (isElementAccessExpression(up) && up.argumentExpression === id)
                || this.rustI64BoxedUse(id)
                || (isVariableDeclaration(up) && up.initializer === id);
            if (!admissible) return undefined;
        }
        return printed[1];
    }

    /** A bare counter use that is an argument of a `this.m(..)` call or the value of an `x[k] = i` write. */
    rustI64BoxedUse(id: any): boolean {
        const up: any = id.parent;
        if (isCallExpression(up)) {
            const callee: any = up.expression;
            return callee.kind === SyntaxKind.PropertyAccessExpression && callee.expression.kind === SyntaxKind.ThisKeyword
                && up.arguments.some((a) => a === id);
        }
        return isBinaryExpression(up) && up.operatorToken.kind === SyntaxKind.EqualsToken && up.right === id
            && (isElementAccessExpression(up.left) || isPropertyAccessExpression(up.left));
    }

    /** The registered counter's symbol when `node` is a use of it, else undefined. */
    rustI64CounterOf(node: any): any {
        const symbol = this.rustI64Counters.size === 0 || !isIdentifier(node) ? undefined : this.rustI64Counters.get(String(node.text));
        return symbol !== undefined && this.rustSymbolOf(node) === symbol ? symbol : undefined;
    }

    /** True when every use of `name` in the printed body is a `.get(name as usize)` read or a `Value::Int(name)` box. */
    rustI64BodyIsClosed(text: string, name: string): boolean {
        const masked = text.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/[^\n]*/g, '');
        const count = (re: RegExp): number => (masked.match(re) ?? []).length;
        const word = `(?<![\\w.])${name}(?![\\w])`;
        const uses = count(new RegExp(word, 'g'));
        const closed = count(new RegExp(`\\.get\\(${name} as usize\\)`, 'g')) + count(new RegExp(`Value::Int\\(${name}\\)`, 'g'));
        return uses > 0 && uses === closed;
    }

    private static readonly COMPARISON_OPS = new Set([
        SyntaxKind.EqualsEqualsToken, SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken,
        SyntaxKind.LessThanToken, SyntaxKind.LessThanEqualsToken, SyntaxKind.GreaterThanToken, SyntaxKind.GreaterThanEqualsToken,
    ]);

    // Comparison helpers that can be replaced by a native numeric operator.
    private static readonly NATIVE_COMPARISON_OPERATORS: Record<number, string> = {
        [SyntaxKind.LessThanToken]: '<', [SyntaxKind.LessThanEqualsToken]: '<=',
        [SyntaxKind.GreaterThanToken]: '>', [SyntaxKind.GreaterThanEqualsToken]: '>=',
    };

    isEqualityOp(op): boolean {
        return op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken ||
            op === SyntaxKind.ExclamationEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken;
    }

    isLogicalOp(op): boolean {
        return op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken;
    }

    printCondition(node, identation) {
        const idn = this.getIden(identation);
        if (node.kind === SyntaxKind.BinaryExpression) {
            const opKind = node.operatorToken.kind;
            // Comparison binary expressions already return bool — skip is_true() wrapping
            if (RustTranspiler.COMPARISON_OPS.has(opKind)) return this.printComparisonInBooleanContext(node, identation);
            // Logical &&/|| operands are individually is_true()-wrapped in
            // printBinaryExpression, so the whole expression is already bool —
            // unless one carries a native compare, which needs no is_true().
            if (this.isLogicalOp(opKind)) {
                const native = this.hasNativeComparisonOperand(node.left) || this.hasNativeComparisonOperand(node.right);
                return idn + (native ? this.printLogicalInBooleanContext(node) : this.printNode(node, 0));
            }
        }
        // PrefixUnary ! — delegate to avoid double-wrapping
        if (node.kind === SyntaxKind.PrefixUnaryExpression && node.operator === SyntaxKind.ExclamationToken) {
            return this.printPrefixUnaryExpression(node, identation);
        }
        // A bare identifier of native-`bool` type: `is_true(&x)` is the identity.
        const nativeBoolParam = this.printNativeBoolParamCondition(node);
        if (nativeBoolParam !== undefined) return idn + nativeBoolParam;
        // A call to a hand-written `-> bool` fn is already a Rust bool.
        if (this.rustCallPrintsBool(node)) return idn + this.printNode(node, 0);
        // Checker-proved boolean Value (safe_bool / get_value): native matches!.
        const nativeTruthiness = this.printNativeTruthiness(node);
        if (nativeTruthiness !== undefined) return idn + nativeTruthiness;
        const nativeTruthinessText = this.rustNativeTruthiness(node); if (nativeTruthinessText !== undefined) return idn + nativeTruthinessText;
        const identifierTruthiness = this.printNativeIdentifierTruthiness(node);
        if (identifierTruthiness !== undefined) return idn + identifierTruthiness;
        // An operand whose printer emission is already a Rust `bool`.
        const nativeCondition = this.printNativeParenthesizedCondition(node);
        if (nativeCondition !== undefined && this.rustConditionBoolSlot(node)) return idn + nativeCondition;
        const expression = this.printNode(node, 0);
        const peeled = this.peelValueBoolBox(this.stripOuterParens(expression));
        if (peeled !== undefined && this.rustConditionBoolSlot(node) && !this.printedBoolHelperCall(this.stripOuterParens(peeled))) {
            return `${idn}(${peeled})`;
        }
        return `${idn}is_true(&${this.printTruthyArgument(expression)})`;
    }

    // `is_true(&(…)` on an operand the printer already emits as a native Rust `bool` (payload
    // compares, `matches!` predicates, `&&`/`||` of those) is the identity (`IsTruthy for bool`);
    // native text has no helper token, so it is emitted only in a bool slot (`isBareBoolEmissionSafe`).

    /** Bool-slot text of a parenthesised native comparison/predicate, else undefined. */
    printNativeParenthesizedCondition(node): string | undefined {
        const inner = this.unwrapParens(node);
        if (inner === undefined || inner === node || inner.kind !== SyntaxKind.BinaryExpression) return undefined;
        const op = inner.operatorToken.kind;
        if (this.isLogicalOp(op)) {
            // Every operand of a logical already prints a bool; keep the wrapper
            // when they are all helper-led (the post-passes key on that token).
            if (!this.hasNativeComparisonOperand(inner.left) && !this.hasNativeComparisonOperand(inner.right)) return undefined;
            return `(${this.printLogicalInBooleanContext(inner)})`;
        }
        if (!RustTranspiler.COMPARISON_OPS.has(op)) return undefined;
        let native: string | undefined;
        if (inner.left.kind === SyntaxKind.TypeOfExpression) {
            // `typeof x === 'string'` prints the same native predicate as `x in obj`.
            native = this.nativeValuePredicateText(inner.right.text, inner.left.expression, this.printNode(inner.left.expression, 0));
            const isDiff = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
            if (native !== undefined && isDiff) native = '!' + native;
        } else {
            native = this.isEqualityOp(op) ? this.nativeEqualityText(inner) : this.printNativeOrderedComparison(inner, op, inner.left, inner.right);
        }
        return native === undefined ? undefined : `(${native})`;
    }

    // The argument of an `is_true(&…)` sink with the printer's `Value::Bool(…)` box peeled when it
    // spans the whole argument: `IsTruthy for Value` unboxes `Value::Bool(b)` to `b`, so the bool
    // prints bare. `is_true` is the one sink taking a native `bool`; the marker stays for post-passes.
    printTruthyArgument(expression: string): string {
        const inner = this.peelValueBoolBox(this.stripOuterParens(expression));
        // parens kept: `is_true(&a == b)` would re-associate the argument.
        return inner === undefined ? expression : `(${inner})`;
    }

    // `assert(<cond>, <msgs>)` — the test harness' `assert<T: Truthy>` takes a
    // native `bool` (`impl Truthy for bool`), so a whole-argument
    // `Value::Bool(…)` box prints bare there too. The message list is untouched.
    printAssertCall(node, identation, parsedArgs) {
        const [first, rest] = this.splitFirstArgument(parsedArgs);
        const inner = this.peelValueBoolBox(this.stripOuterParens(first));
        return inner === undefined ? `assert(${parsedArgs})` : `assert((${inner})${rest})`;
    }

    // Splits an already-printed argument list after its first top-level `,`.
    splitFirstArgument(parsedArgs: string): [string, string] {
        let depth = 0;
        for (let i = 0; i < parsedArgs.length; i++) {
            const char = parsedArgs[i];
            if (char === '"') {
                for (i++; i < parsedArgs.length && parsedArgs[i] !== '"'; i++) {
                    if (parsedArgs[i] === '\\') i++;
                }
            } else if ('([{'.includes(char)) depth++;
            else if (')]}'.includes(char)) depth--;
            else if (char === ',' && depth === 0) return [parsedArgs.slice(0, i), parsedArgs.slice(i)];
        }
        return [parsedArgs, ''];
    }

    // Bool-position text for a comparison: the native payload compare (already
    // bool) when the checker proves it, the is_equal() helper otherwise.
    printComparisonInBooleanContext(node, identation) {
        const native = this.nativeEqualityText(node);
        return this.getIden(identation) + (native ? `(${native})` : this.printNode(node, 0));
    }

    // Native equality text of `node` (parens unwrapped), if the checker proves it.
    nativeEqualityText(node) {
        const inner = this.unwrapParens(node);
        if (inner === undefined || inner.kind !== SyntaxKind.BinaryExpression || !this.isEqualityOp(inner.operatorToken.kind)) return undefined;
        return this.printNativeEqualityComparison(inner.left, inner.right, inner.operatorToken.kind);
    }

    unwrapParens(node) {
        let inner = node;
        while (inner !== undefined && inner.kind === SyntaxKind.ParenthesizedExpression) inner = inner.expression;
        return inner;
    }

    // Does `node` carry a native payload compare in a position where the old
    // text started with a bool helper? The post-pass types locals by that token.
    hasNativeComparisonOperand(node) {
        const inner = this.unwrapParens(node);
        if (inner === undefined) return false;
        if (inner.kind === SyntaxKind.PrefixUnaryExpression && inner.operator === SyntaxKind.ExclamationToken) {
            return this.hasNativeComparisonOperand(inner.operand);
        }
        if (this.nativeEqualityText(inner) !== undefined) return true;
        if (inner.kind === SyntaxKind.BinaryExpression && this.nativeIndexOfLiteralTestText(inner.operatorToken.kind, inner.left, inner.right) !== undefined) return true;
        return inner.kind === SyntaxKind.BinaryExpression && this.isLogicalOp(inner.operatorToken.kind) &&
            (this.hasNativeComparisonOperand(inner.left) || this.hasNativeComparisonOperand(inner.right));
    }

    // Bare `&&`/`||` text of a logical expression (its operands are bools).
    printLogicalInBooleanContext(node) {
        const token = node.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken ? '&&' : '||';
        return `${this.printCondition(node.left, 0).trim()} ${token} ${this.printCondition(node.right, 0).trim()}`;
    }

    printWhileStatement(node, identation) {
        return `${this.getIden(identation)}while ${this.printCondition(node.expression, 0)}${this.printBlock(node.statement, identation)}`;
    }

    printIfStatement(node, identation) {
        const elseStatement = node.elseStatement;
        const ifBody = this.printBlock(node.thenStatement, identation, elseStatement !== undefined);
        const head = node.parent.kind === SyntaxKind.IfStatement ? 'else if ' : `${this.getIden(identation)}if `;
        let ifComplete = `${head}${this.printCondition(node.expression, 0)}${ifBody}`;
        if (elseStatement?.kind === SyntaxKind.Block) {
            ifComplete += ` else${this.printBlock(elseStatement, identation)}`;
        } else if (elseStatement?.kind === SyntaxKind.IfStatement) {
            ifComplete += ' ' + this.printIfStatement(elseStatement, identation);
        }
        return this.printNodeCommentsIfAny(node, identation, ifComplete);
    }

    printPostFixUnaryExpression(node, identation) {
        const { operand, operator } = node;
        const helper = operator === SyntaxKind.PlusPlusToken ? 'add' : operator === SyntaxKind.MinusMinusToken ? 'subtract' : undefined;
        if (helper === undefined) return super.printPostFixUnaryExpression(node, identation);
        const operandText = this.printNode(operand, 0);
        const native = this.printNativeIncrement(helper === 'add' ? SyntaxKind.PlusToken : SyntaxKind.MinusToken, operand, operandText);
        return `${this.getIden(identation)}${operandText} = ${native ?? `${helper}(&${operandText}, &Value::Int(1))`}`;
    }

    // `x++` / `x--` on a checker-typed number: native `+`/`-` with `Value::Int(1)`.
    printNativeIncrement(op, operand, operandText: string): string | undefined {
        try {
            if (!this.isNumberLikeType(this.getChecker().getTypeAtLocation(operand))) return undefined;
        } catch (e) {
            return undefined;
        }
        return this.printNativeNumeric(op, operandText, 'Value::Int(1)');
    }

    printPrefixUnaryExpression(node, identation) {
        const { operand, operator } = node;
        const idn = this.getIden(identation);
        if (operator === SyntaxKind.ExclamationToken) return idn + '!' + this.printCondition(operand, 0);
        if (operator !== SyntaxKind.MinusToken) return idn + this.PrefixFixOperators[operator] + this.printNode(operand, 0);
        const operandText = this.printNode(operand, 0);
        return idn + (this.foldNegateLiteral(operandText) ?? this.printRustNativeNegate(operand, operandText) ?? `negate(&${operandText})`);
    }

    printObjectLiteralExpression(node, identation) {
        return `Value::Map(${this.rustObjectLiteralBlock(node, identation)})`;
    }

    /** The object-literal block on its own (`{ let mut m = …; m }`) — the payload a
     *  `Value::Map(..)` box carries and the initialiser a typed dict bearer needs. */
    rustObjectLiteralBlock(node, identation) {
        const escapeKey = (s: any): string => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        const idn2 = this.getIden(identation + 2);
        const lines = node.properties.map(p => {
            // Shorthand: { foo }  →  m.insert("foo", foo.clone());
            if (isShorthandPropertyAssignment(p)) {
                const name = (p.name as Identifier).text;
                return `${idn2}m.insert("${escapeKey(name)}".to_string(), ${name}.clone());`;
            }
            const keyText = isStringLiteral(p.name) ? p.name.text : p.name.text;
            return `${idn2}m.insert("${escapeKey(keyText)}".to_string(), ${this.printNode(p.initializer, 0)});`;
        });
        const idn1 = this.getIden(identation + 1);
        const body = lines.map(l => l + '\n').join('');
        return `{\n${idn1}let mut m = std::collections::HashMap::new();\n${body}${idn1}m\n${this.getIden(identation)}}`;
    }

    printArrayLiteralExpression(node, identation) {
        return `Value::from(vec![${node.elements.map(e => this.printNode(e, 0)).join(', ')}])`;
    }

    printDeleteExpression(node, identation) {
        return this.provenDictFieldDelete(node) ?? `remove(&mut ${this.printNode(node.expression.expression, 0)}, &${this.printNode(node.expression.argumentExpression, 0)})`;
    }

    printInstanceOfExpression(node, identation) {
        return `${this.getIden(identation)}is_instance(&${this.printNode(node.left, 0)}, &${this.printNode(node.right, 0)})`;
    }

    printConditionalExpression(node, identation) {
        const condition = this.printCondition(node.condition, 0);
        const whenTrue = this.printTernaryArm(node.whenTrue);
        const whenFalse = this.printTernaryArm(node.whenFalse);
        // `ternary` is `if cond { a } else { b }` over `Value`; the arms are
        // normalized to `Value`, so the native form matches it and evaluates
        // only the taken arm (TS semantics).
        return `(if ${condition} { ${whenTrue} } else { ${whenFalse} })`;
    }

    // Free runtime functions that print as `bool` (not `Value`) — mirror of the
    // Rust pipeline's `ternary()` bool-boxing list.
    private static readonly BOOL_VALUE_PREFIXES = [
        'is_equal', 'is_true', 'is_greater_than', 'is_less_than',
        'is_greater_than_or_equal', 'is_less_than_or_equal', 'is_array',
        'is_object', 'in_op', 'is_number', 'is_string',
    ];

    private static isBoolValueExpression(text: string): boolean {
        let value = text.trim();
        while (value.startsWith('(') && value.endsWith(')')) {
            let depth = 0;
            let wrapsWhole = true;
            for (let i = 0; i < value.length && wrapsWhole; i++) {
                if (value[i] === '(') depth++;
                else if (value[i] === ')' && --depth === 0 && i < value.length - 1) wrapsWhole = false;
            }
            if (!wrapsWhole) break;
            value = value.slice(1, -1).trim();
        }
        if (value.startsWith('!')) value = value.slice(1).trim();
        return RustTranspiler.BOOL_VALUE_PREFIXES.some((fn) => value.startsWith(fn + '('));
    }

    // An if-expression arm keeps the type `ternary()`'s `Value` parameters gave
    // it: box bool expressions, and clone bare identifiers so the arm does not
    // move a local the caller still uses.
    printTernaryArm(node, identation = 0) {
        const text = this.printNode(node, identation);
        const trimmed = text.trim();
        if (RustTranspiler.isBoolValueExpression(trimmed)) return `Value::Bool(${trimmed})`;
        return RustTranspiler.cloneIfBareLocal(trimmed, text);
    }

    // Built-in method call overrides
    printArrayIsArrayCall(node, identation, parsedArg = undefined) {
        return `Value::Bool(${this.nativeValuePredicateText('array', node?.arguments?.[0], parsedArg) ?? `is_array(&${parsedArg})`})`;
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        return this.bearerEnum(node, 'keys') ?? this.provenDictFieldEnum(node, parsedArg, 'keys') ?? this.predictionEnum(node, parsedArg, 'keys') ?? this.baseEnum(node, parsedArg, 'keys') ?? `object_keys(&${parsedArg})`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        return this.bearerEnum(node, 'values') ?? this.provenDictFieldEnum(node, parsedArg, 'values') ?? this.predictionEnum(node, parsedArg, 'values') ?? this.baseEnum(node, parsedArg, 'values') ?? `object_values(&${parsedArg})`;
    }

    /** `Object.keys/values(x)` on a typed bearer — the map's own iterators. A bearer is built
     *  from an object literal, so the helper's ws/tag filters have nothing to strip. */
    bearerEnum(node: any, kind: 'keys' | 'values'): string | undefined {
        const arg = this.bearerEnumArg(node);
        if (arg === undefined || this.rustDictBearerDeclaration(arg) === undefined) return undefined;
        const recv = String(arg.text);
        const body = kind === 'keys'
            ? `${recv}.keys().map(|__k| Value::Str(__k.clone().into())).collect()`
            : `${recv}.values().cloned().collect()`;
        return `Value::Array(${body})`;
    }

    /** The single plain-identifier argument of `Object.keys/values(…)`. */
    bearerEnumArg(node: any): Identifier | undefined {
        if (!isCallExpression(node) || (node.arguments?.length ?? 0) !== 1) return undefined;
        const callee: any = node.expression;
        if (!isPropertyAccessExpression(callee) || !isIdentifier(callee.expression)
            || String(callee.expression.text) !== 'Object'
            || (String(callee.name.text) !== 'keys' && String(callee.name.text) !== 'values')) {
            return undefined;
        }
        const arg: any = this.rustSkipWrappers(node.arguments[0]);
        return arg !== undefined && isIdentifier(arg) ? arg : undefined;
    }

    printJsonParseCall(node, identation, parsedArg = undefined) {
        return `json_parse(&${parsedArg})`;
    }

    printJsonStringifyCall(node, identation, parsedArg = undefined) {
        return `json_stringify(&${parsedArg})`;
    }

    printMathFloorCall(node, identation, parsedArg = undefined) {
        return this.printRustNativeMathCall(node, 'floor', parsedArg) ?? `math_floor(&${parsedArg})`;
    }

    // No `.await` here: `printAwaitExpression` appends it for `await Promise.all(...)`.
    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return `promise_all(&${parsedArg})`;
    }

    // Rust uses postfix `.await`; the base transpiler defaults to prefix.
    printAwaitExpression(node, identation) {
        const typedCall = isCallExpression(node.expression) ? this.printTypedUnifiedCall(node.expression) : undefined;
        if (typedCall !== undefined) return typedCall;
        // a local in a method that inlines a value-position spawn holds the spawn's resolved result
        if (isIdentifier(node.expression) && this.rustInlinesValueSpawn(findAncestor(node, isMethodDeclaration))) {
            return this.printNode(node.expression, identation);
        }
        return `${this.printNode(node.expression, identation)}.await`;
    }

    // `this.<callback>(..)` on a proxy-callback field calls the `<callback>_fn` method (a name can't be
    // both field and method); `this.setProperty(this, ..)` drops the receiver (`set_property` mutates
    // `self`); `this.binaryConcat()` passes the empty first chunk of `(first, ...rest)`.
    printSelfCallShape(node, identation): string | undefined {
        const callee = node.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        const name = callee.name.text;
        if (RustTranspiler.RUST_PROXY_CALLBACK_FIELDS.has(this.toSnakeCaseName(name))) {
            return `self.${this.toSnakeCaseName(name)}_fn(${this.printArgsForCallExpression(node, identation)})`;
        }
        if (name === 'binaryConcat' && node.arguments.length === 0) return 'self.binary_concat(Value::Null, &[])';
        if (name === 'setProperty' && node.arguments.length > 0 && node.arguments[0].kind === SyntaxKind.ThisKeyword) {
            const [prop, ...rest] = node.arguments.slice(1).map((a) => this.printNode(a, 0).trim());
            return `self.setProperty(${prop}, &[${rest.join(', ')}])`;
        }
        return undefined;
    }

    private static readonly RUST_PROXY_CALLBACK_FIELDS = new Set(['proxy', 'proxy_url_callback', 'http_proxy_callback', 'https_proxy_callback',
        'socks_proxy_callback', 'ws_proxy_callback', 'wss_proxy_callback', 'ws_socks_proxy_callback']);

    // `this.spawn(this.m, ...args)` used as a value: Rust can't hold a future in a `Value`, so the
    // spawn runs inline as `self.call_dynamic("m", vec![args]).await`. Statement spawns stay enqueued.
    rustValueSpawnCall(node): boolean {
        const callee = node.expression;
        return isPropertyAccessExpression(callee) && callee.expression.kind === SyntaxKind.ThisKeyword && callee.name.text === 'spawn'
            && node.arguments.length > 0 && isPropertyAccessExpression(node.arguments[0]) && node.arguments[0].expression.kind === SyntaxKind.ThisKeyword
            && node.parent?.kind !== SyntaxKind.ExpressionStatement;
    }

    printValueSpawnCall(node, identation): string | undefined {
        if (!this.rustValueSpawnCall(node)) return undefined;
        const args = node.arguments.slice(1).map((a) => {
            const t = this.printNode(a, identation).trim();
            return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t) ? `${t}.clone()` : t;
        });
        return `self.call_dynamic("${this.toSnakeCaseName(node.arguments[0].name.text)}", vec![${args.join(', ')}]).await`;
    }

    rustInlinesValueSpawn(method): boolean {
        if (method === undefined || method.body === undefined) return false;
        let found = false;
        const visit = (n) => {
            if (found) return;
            if (isCallExpression(n) && this.rustValueSpawnCall(n)) { found = true; return; }
            n.forEachChild(visit);
        };
        method.body.forEachChild(visit);
        return found;
    }

    printMathRoundCall(node, identation, parsedArg = undefined) {
        return this.printRustNativeMathCall(node, 'round', parsedArg) ?? `math_round(&${parsedArg})`;
    }

    printMathCeilCall(node, identation, parsedArg = undefined) {
        return this.printRustNativeMathCall(node, 'ceil', parsedArg) ?? `math_ceil(&${parsedArg})`;
    }

    printNumberIsIntegerCall(node, identation, parsedArg = undefined) {
        return `is_integer(&${parsedArg})`;
    }

    printArrayPushCall(node, identation, name = undefined, parsedArg = undefined) {
        return this.printRustVecPush(node, name, parsedArg) ?? this.arrPush(node, name, parsedArg) ?? `append_to_array(&mut ${name}, ${parsedArg})`;
    }

    printIncludesCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Value::Bool(contains(&${name}, &${parsedArg}))`;
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        return this.printNativeStringIndexOf(node, name) ?? this.printNativeStringIndexOfString(node, name) ?? this.looseIndexOf(name, parsedArg);
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        const native = this.printNativeStringAffixTest(node, name, 'starts_with') ?? this.printAffixTest(node, name, 'starts_with');
        if (native !== undefined) return `Value::Bool(${native})`;
        return `Value::Bool(starts_with(&${name}, &${parsedArg}))`;
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        const native = this.printNativeStringAffixTest(node, name, 'ends_with') ?? this.printAffixTest(node, name, 'ends_with');
        if (native !== undefined) return `Value::Bool(${native})`;
        return `Value::Bool(ends_with(&${name}, &${parsedArg}))`;
    }

    printTrimCall(node, identation, name = undefined) {
        return this.printTrim(node, name) ?? `trim(&${name})`;
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        return this.printStrVecParamJoin(node) ?? this.printVecJoin(node) ?? this.printNativeStringJoin(node, name) ?? `join(&${name}, &${parsedArg})`;
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        return this.printNativeStringSplit(node, name) ?? this.printRustSplit(node, name) ?? `split(&${name}, &${parsedArg})`;
    }

    printConcatCall(node, identation, name = undefined, parsedArg = undefined) {
        return `concat(${name}.clone(), ${parsedArg}.clone())`;
    }

    printToFixedCall(node, identation, name = undefined, parsedArg = undefined) {
        return this.printNativeToFixed(node, name) ?? `to_fixed(&${name}, &${parsedArg})`;
    }

    printToStringCall(node, identation, name = undefined) {
        return this.printRustNativeToString(node, name) ?? this.printRustToString(node, name) ?? `to_string_val(&${name})`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        return this.printNativeStringCase(node, name, 'to_uppercase') ?? this.printRustCase(node, name, 'to_uppercase') ?? this.looseStrCase(name, 'to_uppercase');
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        return this.printNativeStringCase(node, name, 'to_lowercase') ?? this.printRustCase(node, name, 'to_lowercase') ?? this.looseStrCase(name, 'to_lowercase');
    }

    printShiftCall(node, identation, name = undefined) {
        return `shift(${name}.clone())`;
    }

    printReverseCall(node, identation, name = undefined) {
        return `${name} = reverse(${name}.clone())`;
    }

    printPopCall(node, identation, name = undefined) {
        return `pop(${name}.clone())`;
    }

    printSliceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return this.printNativeStringSlice(node, name) ?? this.looseSlice(name, parsedArg, parsedArg2 ?? 'Value::Null');
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return this.printNativeStringReplace(node, name) ?? this.printRustReplace(node, name) ?? this.printReplace(node, name) ?? `replace_str(&${name}, &${parsedArg}, &${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return this.printNativeStringReplace(node, name) ?? this.printRustReplace(node, name) ?? this.printReplace(node, name) ?? `replace_all_str(&${name}, &${parsedArg}, &${parsedArg2})`;
    }

    // `{}` (Display) renders an ExchangeError as `[Kind] message`; `{:?}` would dump the struct fields.
    printThrowStatement(node, identation) {
        return `${this.getIden(identation)}panic!("{}", ${this.printNode(node.expression, 0)});`;
    }

    rustCatchBindingIsRead(block: Node, name: string): boolean {
        let read = false;
        const visit = (n: Node) => {
            if (read) return;
            if (isIdentifier(n) && n.text === name) { read = true; return; }
            n.forEachChild(visit);
        };
        block.forEachChild(visit);
        return read;
    }

    printTryStatement(node, identation) {
        const body = (block) => block.statements.map(s => this.printNode(s, identation + 1)).join('\n');
        const rawName = node.catchClause?.variableDeclaration?.name?.text;
        const iden = this.getIden(identation);
        const errorName = rawName ? `_${rawName}` : '_e';
        // A handler that never reads its binding needs no payload: `is_err()` is native.
        const head = rawName !== undefined && this.rustCatchBindingIsRead(node.catchClause.block, rawName)
            ? `if let Err(${errorName}) = _try_result {` : 'if _try_result.is_err() {';
        return `${iden}let _try_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {\n${body(node.tryBlock)}\n${iden}}));\n` +
            `${iden}${head}\n${body(node.catchClause.block)}\n${iden}}`;
    }

    printReturnStatement(node, identation) {
        const exp = node.expression;
        const idn = this.getIden(identation);
        if (!exp) return `${idn}return;`;
        // a chained `return this` hands back no value: `self` is the `&mut` core, not a `Value`
        if (exp.kind === SyntaxKind.ThisKeyword) return `${idn}return Value::Null;`;
        // `return X;` inside a native-`Option<String>` method: the printed
        // expression is still the `Value` box, so convert it back to the
        // native payload (a nullish literal is the `None` arm).
        const fn: any = findAncestor(node.parent, isFunctionLike);
        if (this.rustNativeStrReturnKind(fn) === 'str' && this.rustStrReturnValueConverts(exp)) {
            if (this.literalKindOfNode(this.unwrapParensNode(exp)) === 'null') return `${idn}return None;`;
            const suffix = this.rustStrNativeExpression(exp) ? '' : '.as_str().map(str::to_owned)';
            return `${idn}return ${this.printNode(exp, 0).trim()}${suffix};`;
        }
        return `${idn}return ${this.printNode(exp, 0).trim()};`;
    }

    printBreakStatement(node, identation) {
        return `${this.getIden(identation)}break;`;
    }

    printContinueStatement(node, identation) {
        return `${this.getIden(identation)}continue;`;
    }

    printConstructorDeclaration(node, identation) {
        return ''; // handled in printNewMethod
    }

    printSpreadElement(node, identation) {
        return `${this.getIden(identation)}${this.printNode(node.expression, 0)}`;
    }

    // Native element write on a local the plain-dict proof admits through its write history:
    // `const x = this.account ()`, a `let x = {}` / `let x: Dict = undefined` later reassigned,
    // `[ x, p ] = this.handleUntilOption (…)`.

    /** Base-tier methods whose every return is a fresh tag-free object
     *  literal (no venue override, no hand-written stub replaces them). */
    private static readonly RUST_PLAIN_DICT_BUILDERS = new Set([ 'account', 'safeLedgerEntry', 'depositWithdrawFee' ]);

    /** Base-tier `[Dict, Dict]` tuple helpers that hand back their `request` argument (index 1). */
    private static readonly RUST_REQUEST_TUPLE_HELPERS = new Set([ 'handleUntilOption' ]);

    rustNativeDictInsert(baseExpr, keyNode, keyText: string, valueText: string): string | undefined {
        if (!isIdentifier(baseExpr) || !this.rustLocalStaysPlain(baseExpr)) {
            return undefined;
        }
        // Every write is a fresh literal / builder: the receiver is untagged and
        // a book-meta key needs no `__book_id` guard (`plain: true`).
        const receiver = { text: String(baseExpr.text), isField: false, plain: true, nameNode: baseExpr };
        const keyArg = this.rustNativeInsertKeyArg(receiver, keyNode, keyText);
        if (keyArg === undefined) {
            return undefined;
        }
        const name = receiver.text;
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText.trim();
        const insert = (val: string) =>
            `if let Value::Dict(__d) = &mut ${name} { std::sync::Arc::make_mut(__d).insert(${keyArg}, ${val}); }`;
        // same operand handling as printNativeDictInsert: hoist a read of the receiver, clone a bare place
        if (new RegExp(`\\b${name}\\b`).test(value)) {
            return `{ let __be_tmp = ${value}; ${insert('__be_tmp')} }`;
        }
        return insert(RustTranspiler.cloneIfBareLocal(value));
    }

    /** A local (single binding in its function, no closure capture of a write)
     *  whose declaration and every write is a plain-dict source or nullish. A
     *  nullish value leaves a non-Dict, which `if let Value::Dict` no-ops on
     *  exactly like the helper's `_ => {}` arm. */
    rustLocalStaysPlain(ident: Identifier, depth = 0): boolean {
        const checker: any = this.checkerOrUndefined();
        const declarations: any[] = checker === undefined ? [] : symbolDeclarations(checker.getSymbolAtLocation(ident));
        const declaration: any = declarations.length === 1 ? declarations[0] : undefined;
        if (declaration === undefined || depth > 4) {
            return false;
        }
        if (declaration.kind === SyntaxKind.BindingElement) {
            return this.rustTupleBindingStaysPlain(ident, declaration, depth);
        }
        if (!isVariableDeclaration(declaration) || declaration.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined || isSourceFile(scope) || this.rustEnclosingFunction(ident) !== scope) {
            return false;
        }
        const name = String(ident.text);
        const symbol = this.rustSymbolOf(declaration.name as Identifier);
        if (symbol === undefined) {
            return false;
        }
        if (declaration.initializer !== undefined && !this.rustPlainSource(declaration.initializer, name)) {
            return false;
        }
        let plain = true;
        for (const node of this.rustScopeNameNodes(scope, name) as any[]) {
            if (node === declaration) continue;
            if (this.rustBindsName(node, name)) {
                // a sibling block's own `const x` is another binding; only an unresolved one rejects
                if (this.rustSymbolOf(node.name) === undefined) { plain = false; break; }
                continue;
            }
            if (node.kind !== SyntaxKind.Identifier || node === declaration.name || this.rustSymbolOf(node) !== symbol) continue;
            if (this.rustEnclosingFunction(node) !== scope) { plain = false; break; } // captured by a callback
            if (!this.rustUseKeepsPlain(node, name)) { plain = false; break; }
        }
        return plain;
    }

    /** `const [ x, p ] = this.handleUntilOption (k, r, …)` with `r` itself a
     *  plain local: element 0 is `r` handed back, and `x` is never re-written. */
    private rustTupleBindingStaysPlain(ident: Identifier, element: any, depth: number): boolean {
        const pattern: any = element.parent;
        const declaration: any = pattern?.parent;
        if (pattern?.kind !== SyntaxKind.ArrayBindingPattern || declaration === undefined || !isVariableDeclaration(declaration)
            || ![0, 1].includes(pattern.elements.indexOf(element)) || element.name?.kind !== SyntaxKind.Identifier
            || element.initializer !== undefined || element.dotDotDotToken !== undefined) {
            return false;
        }
        if (pattern.elements.indexOf(element) === 1 ? !this.paramsSlot(declaration.initializer, undefined, depth) : !this.rustTupleHeadIsPlain(declaration.initializer, undefined, depth)) {
            return false;
        }
        const scope = this.rustEnclosingFunction(declaration);
        const name = String(ident.text);
        const symbol = this.rustSymbolOf(element.name);
        if (scope === undefined || symbol === undefined || this.rustEnclosingFunction(ident) !== scope) {
            return false;
        }
        for (const node of this.rustScopeNameNodes(scope, name) as any[]) {
            if (node.kind !== SyntaxKind.Identifier || node === element.name || this.rustSymbolOf(node) !== symbol) continue;
            if (this.rustEnclosingFunction(node) !== scope || !this.rustUseKeepsPlain(node, name)) return false;
        }
        return true;
    }

    /** The shipped construction proof (literal-built local / handler tuple), read-only. */
    private rustShippedPlain(ident: Identifier): boolean {
        const declaration = this.rustSingleLocalDeclaration(ident);
        return declaration !== undefined && isVariableDeclaration(declaration as any)
            && this.rustInsertReceiverBuildsPlainDict(declaration as VariableDeclaration);
    }

    /** A use of the local: reads and element writes keep the box; a direct
     *  assignment must store a plain source; any other write shape rejects. */
    private rustUseKeepsPlain(node: Node, name: string): boolean {
        let target: any = node;
        while (target.parent !== undefined && (isParenthesizedExpression(target.parent) || isNonNullExpression(target.parent) || isAsExpression(target.parent))) {
            target = target.parent;
        }
        const parent: any = target.parent;
        if (parent === undefined) return true;
        if (isBinaryExpression(parent) && parent.left === target && rustIsAssignmentOperator(parent.operatorToken.kind)) {
            return parent.operatorToken.kind === SyntaxKind.EqualsToken && this.rustPlainSource(parent.right, name);
        }
        if (parent.kind === SyntaxKind.ArrayLiteralExpression) {
            const assign: any = parent.parent;
            if (assign !== undefined && isBinaryExpression(assign) && assign.left === parent) {
                return this.rustRequestTupleWrite(assign.right, parent.elements.indexOf(target), name);
            }
        }
        // a field of a `let`-bound literal aliasing the local feeds ccxt's
        // writeBackAliasedArrayMutations, which keys on the helper text
        if ((parent.kind === SyntaxKind.PropertyAssignment || parent.kind === SyntaxKind.ShorthandPropertyAssignment)
            && !(parent.kind === SyntaxKind.PropertyAssignment && parent.initializer !== target)) {
            let literal: any = parent.parent;
            while (literal?.parent !== undefined && (isParenthesizedExpression(literal.parent) || isAsExpression(literal.parent))) literal = literal.parent;
            if (literal?.parent === undefined || isVariableDeclaration(literal.parent)) return false;
        }
        if (parent.kind === SyntaxKind.PrefixUnaryExpression || parent.kind === SyntaxKind.PostfixUnaryExpression
            || parent.kind === SyntaxKind.DeleteExpression
            || ((isForOfStatement(parent) || isForInStatement(parent)) && parent.initializer === target)) {
            return false;
        }
        return true;
    }

    /** `[ x, … ] = this.handleUntilOption (k, x, …)` — element 0 is the request
     *  argument handed back (base-tier implementation, no override). */
    private rustRequestTupleWrite(rhs: Node, index: number, name: string): boolean {
        return index === 1 ? this.paramsSlot(rhs, name, 0) : (index === 0 && this.rustTupleHeadIsPlain(rhs, name, 0));
    }

    /** Element 0 of `this.m (…)` is a plain dict: `m` is the base-tier
     *  `handleUntilOption` (returns its `request` argument), or a method of the
     *  calling file (Rust calls it statically) whose every `return [ X, … ]`
     *  has X a plain literal / plain local, or a parameter whose argument here is. */
    private rustTupleHeadIsPlain(rhs: Node, selfName: string | undefined, depth: number): boolean {
        const call: any = this.rustStripWrappers(rhs);
        if (depth > 4 || call === undefined || !isCallExpression(call) || !isPropertyAccessExpression(call.expression)
            || call.expression.expression.kind !== SyntaxKind.ThisKeyword) {
            return false;
        }
        const argPlain = (index: number): boolean => {
            const arg: any = this.rustStripWrappers(call.arguments[index]);
            return arg !== undefined && (this.rustPlainDictLiteral(arg) || (isIdentifier(arg)
                && (String(arg.text) === selfName || this.rustLocalStaysPlain(arg, depth + 1) || this.rustShippedPlain(arg))));
        };
        if (RustTranspiler.RUST_REQUEST_TUPLE_HELPERS.has(String(call.expression.name.text))) {
            return this.rustCalleeIsBase(call) && argPlain(1);
        }
        let declaration: any;
        try {
            declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
        } catch (e) {
            return false;
        }
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body === undefined
            || declaration.getSourceFile() !== call.getSourceFile()) {
            return false;
        }
        let plain = true;
        let returns = 0;
        this.rustWalkScope(declaration.body, (n) => {
            if (isArrowFunction(n) || n.kind === SyntaxKind.FunctionExpression) return RUST_WALK_SKIP;
            if (!isReturnStatement(n)) return;
            returns++;
            const tuple: any = this.rustStripWrappers(n.expression);
            const head: any = tuple?.kind === SyntaxKind.ArrayLiteralExpression ? this.rustStripWrappers(tuple.elements[0]) : undefined;
            const param = head !== undefined && isIdentifier(head) ? declaration.parameters.findIndex((p) => p.name?.kind === SyntaxKind.Identifier && String(p.name.text) === String(head.text)) : -1;
            const ok = head !== undefined && (this.rustPlainDictLiteral(head)
                || (param >= 0 ? (this.rustSymbolOf(head) === this.rustSymbolOf(declaration.parameters[param].name) && argPlain(param)
                    && this.rustParamUnassigned(declaration, String(head.text)))
                    : (isIdentifier(head) && this.rustLocalStaysPlain(head, depth + 1))));
            if (!ok) { plain = false; return RUST_WALK_STOP; }
        });
        return plain && returns > 0;
    }

    /** A pass-through parameter: never assigned in the method body. */
    private rustParamUnassigned(method: any, name: string): boolean {
        let kept = true;
        this.rustWalkScope(method.body, (n) => {
            if (isBinaryExpression(n) && rustIsAssignmentOperator(n.operatorToken.kind) && isIdentifier(n.left) && String(n.left.text) === name) {
                kept = false;
                return RUST_WALK_STOP;
            }
        });
        return kept;
    }

    /** A value that is a fresh plain dict, nullish, or the local itself. */
    rustPlainSource(node: Node, name: string): boolean {
        const stripped: any = this.rustStripWrappers(node);
        if (stripped === undefined) return false;
        if (this.rustPlainDictLiteral(stripped) || this.rustTypeIsUndefinedish(stripped)
            || (isIdentifier(stripped) && String(stripped.text) === name)) {
            return true;
        }
        if (isConditionalExpression(stripped)) {
            return this.rustPlainSource(stripped.whenTrue, name) && this.rustPlainSource(stripped.whenFalse, name);
        }
        if (isCallExpression(stripped) && isPropertyAccessExpression(stripped.expression)
            && stripped.expression.expression.kind === SyntaxKind.ThisKeyword
            && RustTranspiler.RUST_PLAIN_DICT_BUILDERS.has(String(stripped.expression.name.text))) {
            return this.rustCalleeIsBase(stripped);
        }
        if (this.rustPlainDictSource(stripped)) return true;
        // `x = this.omit|keysort (x, …)` copies x's own map; `this.extend (…)` builds a
        // fresh map from its dict arguments — plain when each of them is.
        if (isCallExpression(stripped) && isPropertyAccessExpression(stripped.expression)
            && stripped.expression.expression.kind === SyntaxKind.ThisKeyword && stripped.arguments.length > 0
            && this.rustCalleeIsBase(stripped)) {
            const callee = String(stripped.expression.name.text);
            const first: any = this.rustStripWrappers(stripped.arguments[0]);
            if (callee === 'omit' || callee === 'keysort') {
                return first !== undefined && isIdentifier(first) && String(first.text) === name;
            }
            if (callee === 'extend') {
                return stripped.arguments.every((a) => this.rustPlainSource(a, name));
            }
        }
        return false;
    }

    /** The checker resolves the call to the base-tier implementation (a venue
     *  override could return anything). */
    private rustCalleeIsBase(call: Node): boolean {
        let declaration: any;
        try {
            declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
        } catch (e) {
            return false;
        }
        // a method body, or the base function behind an `omit = omit;` property
        return declaration !== undefined && (declaration.body !== undefined || this.baseOverload(declaration))
            && RustTranspiler.RUST_BASE_TIER_FILE.test(String(declaration.getSourceFile().fileName).replace(/\\/g, '/'));
    }

    // `this.<field>[k]`: a class property whose declared type proves a plain dict is a
    // container struct field (never a book/cache/side/client/live marker dict), so
    // `get_value`'s marker routes cannot fire and the read is `m.get(k)`.

    /** The class property declaration behind `this.<name>` when its annotation proves a plain dict. */
    rustProvenDictThisField(node: Node): Declaration | undefined {
        if (!isPropertyAccessExpression(node) || node.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        let declaration: any;
        try {
            declaration = symbolValueDeclaration(this.getChecker().getSymbolAtLocation(node.name));
        } catch (e) {
            return undefined;
        }
        if (declaration === undefined || declaration.kind !== SyntaxKind.PropertyDeclaration || declaration.type === undefined) return undefined;
        const type = this.getCheckedTypeOf(declaration.type);
        return type !== undefined && this.isProvenMapType(type) ? declaration : undefined;
    }

    /** `this.<field>[a]` whose declared field type's element type is itself a plain dict
     *  (`Dictionary<Dictionary<T>>`). */
    rustProvenDictThisFieldElement(node: Node): boolean {
        if (!isElementAccessExpression(node)) return false;
        const field: any = this.rustProvenDictThisField(node.expression);
        if (field === undefined) return false;
        const fieldType = this.getCheckedTypeOf(field.type);
        const parts: Type[] = (fieldType.flags & TypeFlags.Union) ? (typeParts(fieldType) ?? []).filter((p) => !this.rustTypeIsNullish(p)) : [fieldType];
        return parts.length === 1 && this.isProvenMapType(this.getChecker().getIndexTypeOfType(parts[0], IndexKind.String));
    }

    /** `this.<field>[k]` with a proven-dict field and a proven string key place. */
    printNativeThisFieldDynamicMapAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        if (this.rustProvenDictThisField(receiverNode) === undefined && !this.rustProvenDictThisFieldElement(receiverNode)) return undefined;
        if (!this.rustKeyIsProvenString(keyNode)) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyText)) return undefined;
        return this.rustDictRead(receiverText, keyText, receiverNode);
    }

    // `const x = []` locals declared `Vec<Value>` when every use is a statement
    // `x.push(v)` (native push), `x.length`, `return x` or an argument inside a `return`
    // (boxed once as `Value::from(x)`). Anything else keeps the `Value` box and `append_to_array`.
    private rustVecLocalDecisions = new WeakMap<Node, boolean>();

    rustVecLocalIsTyped(declaration): boolean {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        let decision = this.rustVecLocalDecisions.get(declaration);
        if (decision === undefined) {
            this.rustVecLocalDecisions.set(declaration, false); // re-entrancy guard
            decision = this.rustVecLocalIsTypedUncached(declaration);
            this.rustVecLocalDecisions.set(declaration, decision);
        }
        return decision;
    }

    rustVecLocalIsTypedUncached(declaration): boolean {
        const init = declaration.initializer;
        if (declaration.name?.kind !== SyntaxKind.Identifier || init === undefined
            || !isArrayLiteralExpression(init)
            || init.elements.some((element) => element.kind === SyntaxKind.SpreadElement)) return false;
        const checker: any = this.checkerOrUndefined();
        const type = checker?.getTypeAtLocation(declaration.name);
        if (type === undefined || !checker.isArrayType(type)) return false;
        const name = String(declaration.name.text);
        const fn = this.rustEnclosingFunction(declaration);
        if (fn === undefined || isSourceFile(fn)) return false;
        // The tests pipeline's text post-passes key on the boxed `Value` local shape.
        const source = declaration.getSourceFile?.()?.fileName;
        if (typeof source === 'string' && /\/test\//.test(source)) return false;
        let pushes = 0;
        const safe = this.rustLocalUsesAll(declaration, name, false, (n) => {
            const parent = n.parent;
            if ((isPropertyAccessExpression(parent) && parent.name === n)
                || (parent?.kind === SyntaxKind.PropertyAssignment && parent.name === n)) return true;
            if (this.rustEnclosingFunction(n) !== fn) return false;
            if (isPropertyAccessExpression(parent) && parent.expression === n) {
                const member = String(parent.name.text);
                if (member === 'length') {
                    const up = parent.parent;
                    return !(isBinaryExpression(up) && up.left === parent && rustIsAssignmentOperator(up.operatorToken.kind))
                        && up?.kind !== SyntaxKind.PrefixUnaryExpression && up?.kind !== SyntaxKind.PostfixUnaryExpression;
                }
                if (member === 'push' && this.rustVecPushShape(parent.parent, name)) {
                    pushes++;
                    return true;
                }
                return this.vecJoinUse(parent);
            }
            return this.rustVecValueUse(n, name) || this.vecUse(n) || this.vecPropertyUse(n);
        });
        return safe && pushes > 0;
    }

    /** The array literal's native `vec![..]`: elements are `Value`s taken by move, so a
     *  bare local is cloned (the boxed form relied on ccxt's argument-clone pass). */
    rustVecNativeLiteral(declaration): string | undefined {
        const initializer: any = declaration?.initializer;
        if (!isArrayLiteralExpression(initializer) || initializer.elements.length === 0) return undefined;
        const parts = initializer.elements.map((element) => {
            const text = this.printNode(element, 0).trim();
            return RustTranspiler.cloneIfBareLocal(text);
        });
        return `vec![${parts.join(', ')}]`;
    }

    // `x.push(v);` as a whole statement, one non-spread argument not naming `x`.
    rustVecPushShape(call, name: string): boolean {
        if (!isCallExpression(call) || call.arguments.length !== 1 || call.parent?.kind !== SyntaxKind.ExpressionStatement) return false;
        const arg = call.arguments[0];
        if (arg.kind === SyntaxKind.SpreadElement) return false;
        let mentions = false;
        const visit = (m) => {
            if (mentions) return;
            if (m.kind === SyntaxKind.Identifier && m.text === name) { mentions = true; return; }
            m.forEachChild?.(visit);
        };
        visit(arg);
        return !mentions;
    }

    // `return x` / `return f(.., x, ..)` with `x` named once in the statement: a boxing move.
    // Elsewhere a boxing argument / object-literal value must be the local's last use outside any loop.
    rustVecValueUse(n, name: string): boolean {
        const parent = n.parent;
        if (isReturnStatement(parent)) return true;
        const isArg = isCallExpression(parent) && parent.arguments.some((a) => a === n) && this.rustVecBoxingCallee(parent.expression);
        const isProp = parent?.kind === SyntaxKind.PropertyAssignment && parent.initializer === n;
        if (!isArg && !isProp) return false;
        let statement: any = parent;
        while (statement !== undefined && !isStatement(statement)) statement = statement.parent;
        if (statement === undefined) return false;
        if (!isReturnStatement(statement) && !this.rustVecIsFinalUse(n, name)) return false;
        let count = 0;
        const visit = (m) => {
            if (m.kind === SyntaxKind.Identifier && m.text === name) count++;
            m.forEachChild?.(visit);
        };
        visit(statement);
        return count === 1;
    }

    rustVecIsFinalUse(n, name: string): boolean {
        const fn = this.rustEnclosingFunction(n);
        for (let current: any = n.parent; current !== undefined && current !== fn; current = current.parent) {
            switch (current.kind) {
            case SyntaxKind.ForStatement: case SyntaxKind.ForInStatement: case SyntaxKind.ForOfStatement:
            case SyntaxKind.WhileStatement: case SyntaxKind.DoStatement:
                return false;
            }
        }
        const end = n.getEnd?.() ?? n.end;
        return !(this.rustScopeNameNodes(fn, name) as any[]).some((m) => m.kind === SyntaxKind.Identifier && m !== n
            && (m.getStart?.() ?? m.pos) >= end && !this.rustIdentifierIsPropertyName(m));
    }

    // `this.m(..)` / `super.m(..)` / `Promise.all(..)`: every argument prints through printNode as a `Value`.
    rustVecBoxingCallee(callee): boolean {
        if (!isPropertyAccessExpression(callee)) return false;
        const receiver: any = callee.expression;
        if (receiver.kind === SyntaxKind.ThisKeyword || receiver.kind === SyntaxKind.SuperKeyword) return true;
        return receiver.kind === SyntaxKind.Identifier && receiver.text === 'Promise' && String(callee.name.text) === 'all';
    }

    rustVecLocalDeclarationOf(node): any {
        if (node?.kind !== SyntaxKind.Identifier) return undefined;
        const checker: any = this.checkerOrUndefined();
        const symbol = checker?.getSymbolAtLocation(node);
        const declaration = symbolValueDeclaration(symbol) ?? symbolDeclarations(symbol)[0];
        return declaration !== undefined && declaration.name !== node && this.rustVecLocalIsTyped(declaration) ? declaration : undefined;
    }

    printRustVecPush(node, name: string | undefined, parsedArg: string | undefined): string | undefined {
        const receiver = node?.expression?.expression;
        if (name === undefined || parsedArg === undefined || this.rustVecLocalDeclarationOf(receiver) === undefined) return undefined;
        const arg = parsedArg.trim();
        // `append_to_array` takes the value by move; ccxt's post-pass cloned a bare local there.
        const value = RustTranspiler.cloneIfBareLocal(arg);
        return `${name}.push(${value})`;
    }

    transformIdentifier(node, identifier) {
        const text = super.transformIdentifier(node, identifier);
        const parent = node?.parent;
        if (this.rustI64Counters.size > 0 && this.rustI64CounterOf(node) !== undefined
            && (this.rustI64BoxedUse(node) || (isVariableDeclaration(parent) && parent.initializer === node))) return `Value::Int(${text})`;
        // An argument in a native-map slot passes the map itself
        // (`&mut` is added by the caller printer), never a `Value::Map` box.
        if (parent !== undefined && isCallExpression(parent) && parent.arguments.some((a) => a === node)) {
            const at = Array.from(parent.arguments).indexOf(node as any);
            if (this.rustNativeMapArgumentSlot(this.rustCalleeParams(parent), at) !== undefined
                && (this.rustDictBearerDeclaration(node) !== undefined || this.rustMapParamDeclaration(node) !== undefined)) {
                return text;
            }
        }
        // A two-level bearer is boxed at its single admitted move.
        // Checked first: a two-level read also satisfies the one-level chain test below.
        if (this.rustNestedDictBearerDeclaration(node) !== undefined && parent !== undefined
            && ((isReturnStatement(parent) && parent.expression === node)
                || (isCallExpression(parent) && parent.arguments.some((a) => a === node))
                || (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === node))) {
            return `Value::from(${text})`;
        }
        // A native-map parameter is a bare map too; every non-key use
        // moves a clone into a `Value`.
        if (this.rustMapParamDeclaration(node) !== undefined && this.rustMapParamBoxes(node)) {
            return `Value::Map(${text}.clone())`;
        }
        // A typed dict bearer is boxed only at the single final move its
        // declaration proof admitted (`return x` / an argument of a `this.` call /
        // the value of a parent object literal).
        const bearer = this.rustDictBearerDeclaration(node);
        if (bearer !== undefined && parent !== undefined
            && ((isReturnStatement(parent) && parent.expression === node)
                || (isCallExpression(parent) && parent.arguments.some((a) => a === node))
                || this.rustDictWriteValue(node)
                || this.rustBearerLiteralMove(node))) {
            // Only the map's last use moves into the box; an earlier
            // one boxes a clone, so a bearer may be handed out more than once.
            return `Value::Map(${text}${!this.rustDictBearerCloned.has(bearer) && this.rustVecIsFinalUse(node, String(node.text)) ? '' : '.clone()'})`;
        }
        const stringMethod: any = this.rustDeclarationOfIdentifier(node);
        if (stringMethod !== undefined && isVariableDeclaration(stringMethod) && stringMethod.name !== node
            && this.rustStringMethodLocalInit(stringMethod) !== undefined) {
            return `Value::from(${text}${this.rustVecIsFinalUse(node, String(node.text)) ? '' : '.clone()'})`;
        }
        if (parent === undefined || !(isReturnStatement(parent) || (isCallExpression(parent) && parent.arguments.some((a) => a === node)
            && this.rustVecBoxingCallee(parent.expression)) || (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === node))) return text;
        if (this.rustVecLocalDeclarationOf(node) === undefined) return text;
        return this.rustVecValueUse(node, String(node.text)) ? `Value::from(${text})` : `Value::from(${text}.clone())`;
    }

    // ── typed dict bearers ────────────────────────────────────────────────────
    // A local that builds one object literal, is only read/written by literal keys and moves at most once is declared
    // a bare `IndexMap<String, Value>`: reads `.get(k)`, writes `.insert(k, v)`. Any other use keeps the `Value` box.

    private rustDictBearerDecisions = new WeakMap<any, boolean>();

    /** Bearers whose escapes all box a clone (the prediction-tier multi-escape rule). */
    private rustDictBearerCloned = new WeakSet<any>();

    /** A prediction venue: `ts/src/prediction/<id>.ts` builds nested request maps in one method. */
    // eslint-disable-next-line no-useless-escape
    private static readonly RUST_PREDICTION_VENUE_FILE = /ts[\/]src[\/]prediction[\/][^/]+\.ts$/;

    /** The declaration behind `node` when it is a local typed as a dict bearer. */
    rustDictBearerDeclaration(node: any): any | undefined {
        if (!isIdentifier(node)) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name === node) return undefined;
        return this.rustDictLocalIsTyped(declaration) ? declaration : undefined;
    }

    rustDictLocalIsTyped(declaration: any): boolean {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        let decision = this.rustDictBearerDecisions.get(declaration);
        if (decision === undefined) {
            this.rustDictBearerDecisions.set(declaration, false); // re-entrancy guard
            try {
                decision = this.rustDictLocalIsTypedUncached(declaration);
            } catch (e) {
                decision = false; // no proof -> the local keeps its `Value` box
            }
            this.rustDictBearerDecisions.set(declaration, decision);
        }
        return decision;
    }

    rustDictLocalIsTypedUncached(declaration: any): boolean {
        const init: any = declaration.initializer;
        if (declaration.name?.kind !== SyntaxKind.Identifier || init === undefined) return false;
        const literal: any = this.rustSkipWrappers(init);
        const produced = !isObjectLiteralExpression(literal) && this.rustDictProducer(init);
        if (!isObjectLiteralExpression(literal) && !produced) return false;
        // A dict read out of a live store (`x.hashmap()`, `x.subscriptions`) is a
        // tagged handle: its writes must reach the store, so it keeps the helper.
        if (produced && this.rustInitReadsTaggedStore(init)) return false;
        const entries: any[] = produced ? [] : literal.properties;
        for (const property of entries) {
            if (property.kind === SyntaxKind.SpreadAssignment) return false;
            const propertyName: any = property.name;
            if (propertyName === undefined || propertyName.kind === SyntaxKind.ComputedPropertyName
                || !RustTranspiler.rustBearerKeyTextOk(String(propertyName.text))) return false;
        }
        const name = String(declaration.name.text);
        const fn: any = this.rustEnclosingFunction(declaration);
        if (fn === undefined || isSourceFile(fn)) return false;
        // The tests pipeline's text post-passes key on the boxed `Value` local shape.
        const source: any = declaration.getSourceFile?.()?.fileName;
        if (typeof source === 'string' && /\/test\//.test(source)) return false;
        // A prediction venue nests its builders (`{ action: obj }`, `f (x, obj)`), so a
        // local there escapes more than once; every escape then boxes a clone.
        const prediction = typeof source === 'string'
            && RustTranspiler.RUST_PREDICTION_VENUE_FILE.test(source.replace(/\\/g, '/'));
        const escapes: any[] = [];
        let elementUses = 0;
        const safe = this.rustLocalUsesAll(declaration, name, false, (n: any) => {
            if (this.rustIdentifierIsPropertyName(n)) {
                // `{ x }` shorthand is a value use, not a name; anything else spelled
                // like the local is a property name, not this binding.
                return !(n.parent?.kind === SyntaxKind.ShorthandPropertyAssignment && n.parent.name === n);
            }
            if (!this.rustIdentifierRefersToDeclaration(n, declaration)) return false;
            if (this.rustEnclosingFunction(n) !== fn) return false; // a closure capture
            const parent: any = n.parent;
            if (isReturnStatement(parent) && parent.expression === n) {
                escapes.push(n);
                return true;
            }
            if (isCallExpression(parent) && parent.arguments.some((a: any) => a === n)
                && isPropertyAccessExpression(parent.expression)
                && (parent.expression.expression.kind === SyntaxKind.ThisKeyword
                    || parent.expression.expression.kind === SyntaxKind.SuperKeyword)) {
                escapes.push(n);
                return true;
            }
            if (prediction && parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === n) {
                escapes.push(n);
                return true;
            }
            if (prediction && isCallExpression(parent) && parent.arguments.some((a: any) => a === n)) {
                // A collection/JSON reader prints its own receiver text (`Object.keys(x)`,
                // `JSON.stringify(x)`), so passing through the box would only add a clone.
                if (this.nativeReadCallee(parent)) return false;
                escapes.push(n);
                return true;
            }
            if (isElementAccessExpression(parent) && parent.expression === n) {
                if (!this.rustDictBearerElementUse(parent, name)) return false;
                elementUses++;
                return true;
            }
            // The value of a dict write (`m['k'] = x`) is boxed once.
            if (this.rustDictWriteValue(n)) return true;
            // `Object.keys/values(x)` prints the map's own iterators.
            if (isCallExpression(parent) && this.bearerEnumArg(parent) === n) return true;
            // `k in x` — the map's own lookup behind the helper's `Str` test.
            if (isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.InKeyword
                && parent.right === n) return this.bearerInOpKeyText(parent.left) !== undefined;
            // A rebuilt plain literal keeps the bearer (write side).
            if (this.rustBearerRebuild(n)) return true;
            // A rebuild from a fresh-map producer keeps the map type.
            const reuse = this.rustProducerReuse(n);
            if (reuse) return true;
            return false;
        });
        if (!safe) return false;
        // A produced map that also escapes re-boxes as `Value::Map(x.clone())`
        // at the escape, so it pays off only where the bearer folds a helper call on it.
        if (produced && escapes.length > 0 && elementUses === 0) return false;
        // A return / `this.` call escape boxes a move at the last use, a clone before it.
        // Any other escape is prediction-tier only, and then every escape boxes a clone.
        for (const escape of escapes) {
            if (this.boxSiteOk(escape) === true) continue;
            if (!prediction) return false;
            this.rustDictBearerCloned.add(declaration);
        }
        return true;
    }

    /** A call that builds a fresh plain map — the request/params builders, `parseJson`, and the `handle*` family.
     *  The checker proves the result Dict-shaped and every copied map operand plain, so the bearer may be declared
     *  from the call and the box is cloned out once. */
    rustDictProducer(node: any): boolean {
        const call: any = this.rustSkipWrappers(node);
        if (!isCallExpression(call)) return false;
        const callee: any = call.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword
            || callee.name?.kind !== SyntaxKind.Identifier) return false;
        const method = String(callee.name.text);
        const handle = /^handle[A-Z]/.test(method);
        if (!handle && !RustTranspiler.RUST_DICT_PRODUCER_CALLEES.has(method)) {
            // The callee's own returns build a fresh untagged map.
            return this.rustCallBuildsContainer(call, 'map', 0);
        }
        if (!this.rustWriteDictShape(this.typeOfNodeIfAny(call))) return false;
        // `parseJson` takes text, a `handle*` call hands back the dict it was given.
        if (handle || method === 'parseJson') return true;
        const args: any[] = (call as any).arguments ?? [];
        const copied = method === 'extend' || method === 'deepExtend' ? args : args.slice(0, 1);
        if (copied.length === 0) return false;
        for (const arg of copied) {
            if (!this.copyOnlyPlainMap(arg)) return false;
        }
        return true;
    }

    /** A map operand the producer only copies into a fresh map: built by the
     *  transpiler (literal / bearer / admitted producer) or a Dict-typed place.
     *  `any` is out — its content may carry a runtime tag. */
    copyOnlyPlainMap(arg: any): boolean {
        const node: any = this.rustSkipWrappers(arg);
        if (isObjectLiteralExpression(node)) return this.rustPlainDictLiteral(node);
        if (isIdentifier(node) && this.rustDictBearerDeclaration(node) !== undefined) return true;
        if (isCallExpression(node)) return this.rustDictProducer(node);
        const type: any = this.typeOfNodeIfAny(node);
        if (type === undefined || (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) !== 0) return false;
        return this.rustWriteDictShape(type);
    }

    /** `x = this.extend(..)` on a bearer — the producer hands back a
     *  fresh map, so the local keeps its `IndexMap` type and the print clones the
     *  box out at the assignment. */
    rustProducerReuse(node: any): boolean {
        const parent: any = node?.parent;
        if (parent === undefined || !isBinaryExpression(parent) || parent.left !== node) return false;
        return parent.operatorToken.kind === SyntaxKind.EqualsToken && this.rustDictProducer(parent.right);
    }

    private static readonly RUST_DICT_PRODUCER_CALLEES = new Set([
        'extend', 'deepExtend', 'omit', 'keysort', 'parseJson', 'safeDict',
    ]);

    // ── callee-return container proof ─────────────────────────────────────────
    // A local initialised from `this.<m>(…)` whose method body builds a fresh, untagged container on every return holds
    // only that container, so the store-tag routes of the helpers cannot fire and it may carry the container type.

    /** Builders that hand back one of their own arguments: the container kind is
     *  the argument's (they only add fields to it). */
    private static readonly RUST_BUILDER_PASSTHROUGH = new Set([ 'safeTicker', 'safeOrder', 'safeTrade', 'safePosition' ]);

    /** `this.<m>(…)` whose every return is a fresh untagged
     *  container of `kind` — the method's own body, no venue override (the
     *  checker resolves the most derived declaration for `this`). */
    rustCallBuildsContainer(call: any, kind: 'map' | 'list', depth = 0): boolean {
        if (depth > 2) return false;
        // A pass-through builder hands back its own first argument (it only adds
        // fields to it), so the argument's kind is the result's.
        const passCallee: any = (call as any)?.expression;
        const passMethod = isPropertyAccessExpression(passCallee) ? String((passCallee as any).name?.text) : undefined;
        if (passMethod !== undefined && RustTranspiler.RUST_BUILDER_PASSTHROUGH.has(passMethod)) {
            const passArgs: any[] = (call as any).arguments ?? [];
            if (passArgs.length === 0) return false;
            return this.rustBuiltContainerKind(passArgs[0], depth + 1) === kind;
        }
        let declaration: any;
        try {
            declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
        } catch (e) {
            return false;
        }
        if (declaration === undefined || declaration === null || declaration.body === undefined) return false;
        if (declaration.kind !== SyntaxKind.MethodDeclaration) return false;
        const body: any = declaration.body;
        let returns = 0;
        let ok = true;
        const visit = (node: any) => {
            if (!ok) return;
            if (node !== body && isFunctionLike(node)) return; // a nested closure owns its own returns
            if (isReturnStatement(node)) {
                returns++;
                if (this.rustBuiltContainerKind(node.expression, depth + 1) !== kind) ok = false;
                return;
            }
            // A store write (`this.orderbooks[sym] = book`, `this.tickers = ..`)
            // hands the container to the runtime store, which tags it: a later
            // native write would bypass the store, so such a callee is out.
            if (isBinaryExpression(node) && rustIsAssignmentOperator(node.operatorToken.kind)
                && this.rustThisRootedPlace(node.left)) {
                ok = false;
                return;
            }
            node.forEachChild(visit);
        };
        body.forEachChild(visit);
        return ok && returns > 0;
    }

    /** A call operand that hands back a live-store map: `x.hashmap()` (the ws
     *  order/subscription cache) or a `.subscriptions` / `.futures` read. The
     *  runtime tags those dicts, so a write must reach the store. */
    rustInitReadsTaggedStore(node: any): boolean {
        const init: any = this.rustSkipWrappers(node);
        if (!isCallExpression(init)) return false;
        return ((init as any).arguments ?? []).some((arg: any) => {
            const n: any = this.rustSkipWrappers(arg);
            if (n === undefined) return false;
            if (isPropertyAccessExpression(n)) return RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(String((n as any).name.text));
            if (isCallExpression(n) && isPropertyAccessExpression(n.expression)) {
                return RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(String((n as any).expression.name.text));
            }
            return false;
        });
    }

    /** `this.<field>` or `this.<field>[…]` — a store the runtime may tag. */
    rustThisRootedPlace(node: any): boolean {
        if (isPropertyAccessExpression(node)) return node.expression.kind === SyntaxKind.ThisKeyword;
        if (isElementAccessExpression(node)) return this.rustThisRootedPlace(node.expression);
        return false;
    }

    /** Container kind an expression the callee body builds yields, or undefined.
     *  Shapes: a tag-free literal, a local that only ever receives element
     *  writes, a `this.` builder that copies plain operands, a pass-through
     *  builder of a built argument. */
    rustBuiltContainerKind(node: any, depth = 0): 'map' | 'list' | undefined {
        if (depth > 3) return undefined;
        const expr: any = this.rustSkipWrappers(node);
        if (expr === undefined || expr === null) return undefined;
        if (isObjectLiteralExpression(expr)) return this.rustPlainDictLiteral(expr) ? 'map' : undefined;
        if (isArrayLiteralExpression(expr)) return 'list';
        if (isIdentifier(expr)) {
            const declaration: any = this.rustDeclarationOfIdentifier(expr);
            if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name === expr) return undefined;
            const built = this.rustBuiltContainerKind(declaration.initializer, depth + 1);
            if (built === undefined || !this.rustLocalContainerWritesOnly(declaration, String(expr.text), built, depth + 1)) return undefined;
            return built;
        }
        if (!isCallExpression(expr)) return undefined;
        const callee: any = expr.expression;
        if (!isPropertyAccessExpression(callee)) return undefined;
        const method = String(callee.name.text);
        const owner: any = callee.expression;
        const args: any[] = (expr as any).arguments ?? [];
        if (owner.kind === SyntaxKind.ThisKeyword) {
            if (RustTranspiler.RUST_BUILDER_PASSTHROUGH.has(method) && args.length > 0) {
                return this.rustBuiltContainerKind(args[0], depth + 1);
            }
            if (RustTranspiler.RUST_DICT_PRODUCER_CALLEES.has(method) && method !== 'safeDict') {
                // `extend`/`deepExtend`/`omit`/`keysort` copy plain operands into a
                // fresh map; `parseJson` always builds one.
                if (method === 'parseJson') return 'map';
                const copied = method === 'extend' || method === 'deepExtend' ? args : args.slice(0, 1);
                if (copied.length === 0) return undefined;
                for (const arg of copied) {
                    if (this.rustBuiltContainerKind(arg, depth + 1) === undefined && !this.copyOnlyPlainMap(arg)) return undefined;
                }
                return 'map';
            }
            if (method === 'safeList' || method === 'safeListValue') {
                return args.length < 3 || isArrayLiteralExpression(this.rustSkipWrappers(args[2])) ? 'list' : undefined;
            }
            if (this.rustCallBuildsContainer(expr, 'map', depth + 1)) return 'map';
            if (this.rustCallBuildsContainer(expr, 'list', depth + 1)) return 'list';
            return undefined;
        }
        if (owner.kind === SyntaxKind.Identifier) {
            const ownerName = String(owner.text);
            if (ownerName === 'Object' && (method === 'keys' || method === 'values' || method === 'entries')) return 'list';
            if (ownerName === 'Promise' && method === 'all') return 'list';
            // `x.split(sep)` — the runtime split is an array on every path.
            if (method === 'split') return 'list';
        }
        return undefined;
    }

    /** True when the only writes to this local inside its own function are
     *  element writes and container rebuilds (no whole-local write of another
     *  shape): the container it was built as is what it holds at every use. */
    private rustLocalContainerWritesOnly(declaration: any, name: string, kind: 'map' | 'list', depth: number): boolean {
        const scope: any = this.rustEnclosingFunction(declaration);
        if (scope === undefined || isSourceFile(scope)) return false;
        let ok = true;
        const isThisLocal = (left: any): boolean => isIdentifier(left) && String(left.text) === name
            && this.rustIdentifierRefersToDeclaration(left, declaration);
        this.rustWalkScope(scope, (n: any) => {
            if (!ok) return;
            if (isBinaryExpression(n) && rustIsAssignmentOperator(n.operatorToken.kind)) {
                if (!isThisLocal(n.left)) return;
                // A rebuild from a container the same proof admits keeps the kind.
                if (n.operatorToken.kind !== SyntaxKind.EqualsToken
                    || this.rustBuiltContainerKind(n.right, depth + 1) !== kind) ok = false;
                return;
            }
            if ((isForOfStatement(n) || isForInStatement(n)) && isThisLocal(n.initializer)) ok = false;
        });
        return ok;
    }

    /** An escape the printer boxes: a `return` of the local, or an argument of a
     *  `this.`/`super.` call. Anything else (a free-function argument) has no box
     *  site. */
    boxSiteOk(node: any): boolean {
        const parent: any = node?.parent;
        if (parent === undefined) return false;
        if (isReturnStatement(parent) && parent.expression === node) return true;
        return isCallExpression(parent) && parent.arguments.some((a: any) => a === node)
            && isPropertyAccessExpression(parent.expression)
            && (parent.expression.expression.kind === SyntaxKind.ThisKeyword
                || parent.expression.expression.kind === SyntaxKind.SuperKeyword);
    }

    /** `Object.keys/values/entries`, `JSON.*`, `String(x)`, `typeof`-style readers: the printer
     *  emits them from the receiver's own text, so a bearer boxed there is a wasted clone. */
    nativeReadCallee(call: any): boolean {
        const callee: any = call?.expression;
        const native: Set<string> = (RustTranspiler as any).NATIVE_READ_NAMESPACES;
        if (callee === undefined || native === undefined) return false;
        if (isPropertyAccessExpression(callee) && isIdentifier(callee.expression)) return native.has(String(callee.expression.text));
        return isIdentifier(callee) && native.has(String(callee.text));
    }

    private static readonly NATIVE_READ_NAMESPACES = new Set([ 'Object', 'JSON', 'Array', 'Promise', 'Math', 'String', 'Number' ]);

    /** One `x[...]` use rooted at the bearer: a key read or a single-level `x['k'] = v`
     *  write. Chained reads stay native at the first level; a chained/compound write,
     *  `delete` and a call on the read reach the container through a `&mut Value`, so
     *  they keep the box. */
    rustDictBearerElementUse(access: any, name: string): boolean {
        let root: any = access;
        while (isElementAccessExpression(root.parent) && root.parent.expression === root) root = root.parent;
        const up: any = root.parent;
        const write = up !== undefined && isBinaryExpression(up) && up.left === root
            && rustIsAssignmentOperator(up.operatorToken.kind);
        if (write) {
            if (up.operatorToken.kind !== SyntaxKind.EqualsToken) return false;
            // Only the first key of a chain has to be proven — the
            // bucket below it is the map's own `entry`, the rest keeps its helper.
            if (root !== access) return this.rustBearerChainHopArg(access.argumentExpression, this.printNode(access.argumentExpression, 0), name) !== undefined;
            return this.rustDictBearerKeyOk(access.argumentExpression) || this.rustBearerWriteKeyOk(access.argumentExpression, name);
        }
        if (up !== undefined && (isDeleteExpression(up) || (isCallExpression(up) && up.expression === root)
            || up.kind === SyntaxKind.PrefixUnaryExpression || up.kind === SyntaxKind.PostfixUnaryExpression)) return false;
        // The printer proves the position on the outermost chain node.
        if (!this.isNativeAccessPositionSafe(root) || this.isNativeWriteTargetBase(root)) return false;
        // ccxt's write-back pass matches `get_value` text to write a mutated bind back.
        if (this.isWriteBackBindRead(access)) return false;
        return this.rustDictBearerKeyOk(access.argumentExpression);
    }

    /** A literal string key, or a checker-proven `string` place. A by-construction
     *  object literal carries no marker key (`__book_id`, `__cacheKind`, `__live_id`)
     *  and no ws client-handle triple, so `get_value`'s store routes cannot fire and
     *  the read is the map lookup. */
    rustDictBearerKeyOk(keyNode: any): boolean {
        const key: any = this.rustSkipWrappers(keyNode);
        if (key === undefined) return false;
        if (isStringLiteralLikeNode(key)) return RustTranspiler.rustBearerKeyTextOk(String((key as any).text));
        if (!isIdentifier(key) || !this.rustKeyIsProvenString(key) || this.rustStringLocalIdentifierIsTyped(key)) return false;
        if (this.rustNodeIsKeyUnsafePlace(String((key as any).text))) return false;
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(this.printNode(key, 0).trim());
    }

    /** Keys a bearer may carry: no empty/numeric key, no ws client-handle marker
     *  (`subscriptions`/`futures` serve their live registry) and nothing `__`-prefixed. */
    static rustBearerKeyTextOk(text: string): boolean {
        return text !== '' && !/^\d+$/.test(text) && !text.startsWith('__')
            && text !== 'subscriptions' && text !== 'futures';
    }

    /** `x[k]` on a bearer with a proven `string` key place: an `IndexMap` lookup, and
     *  `get_value`'s non-`Str` key branches (always `Value::Null` here) become the
     *  `""` fallback — the bearer can never hold an empty key. */
    rustBearerDictDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        const typed = this.rustDictBearerDeclaration(receiverNode) !== undefined
            || this.rustMapParamDeclaration(receiverNode) !== undefined;
        if (!typed) return undefined;
        const key: any = this.rustSkipWrappers(keyNode);
        if (key === undefined || isStringLiteralLikeNode(key) || !this.rustDictBearerKeyOk(key)) return undefined;
        if (this.isWriteBackBindRead(this.rustElementReadOfKey(keyNode))) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        return `${receiverText}.get(${keyText}.as_str().unwrap_or("")).cloned().unwrap_or(Value::Null)`;
    }

    /** `x['k'] = v` on a bearer: the insert `add_element_to_object` performs on the
     *  same plain dict, minus the box (`Arc::make_mut` guard the type proves). */
    rustBearerDictInsert(baseExpr: any, keyNode: any, keyText: string, valueText: string): string | undefined {
        const declaration = this.rustDictBearerDeclaration(baseExpr);
        const name = String(baseExpr.text);
        if (declaration === undefined || !(this.rustDictBearerKeyOk(keyNode) || this.rustBearerWriteKeyOk(keyNode, name))) return undefined;
        const keyArg = this.rustNativeInsertKeyArg({ text: name, isField: false, plain: true }, keyNode, keyText)
            ?? this.rustBearerWriteKeyArg(keyNode, keyText, name);
        if (keyArg === undefined) return undefined;
        return this.rustBearerInsertText(name, keyArg, valueText);
    }

    /** `<name>.insert(<key>, <value>)` for a receiver the type proves is a map. The
     *  insert holds the receiver's `&mut`, so a value that reads it binds first; the
     *  trailing `;` keeps the block unit-typed when it stands as a statement. */
    rustBearerInsertText(name: string, keyArg: string, valueText: string): string {
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText;
        if (new RegExp(`\\b${name}\\b`).test(value)) {
            return `{ let __be_tmp = ${value}; ${name}.insert(${keyArg}, __be_tmp); }`;
        }
        const trimmed = value.trim();
        return `${name}.insert(${keyArg}, ${RustTranspiler.cloneIfBareLocal(trimmed, value)})`;
    }

    // ── chained writes on a one-level bearer ──────────────────────────────────
    // `x[k1][k2] = v` roots at a plain `IndexMap<String, Value>`: the bucket is the map's own
    // `entry(k1).or_default()` — the same `or_insert(Value::Null)` `get_value_mut` performs — so the write goes native.

    /** The `entry` key of a chained write's first hop, or undefined when the key
     *  cannot be proven. The bearer proof and the emission share this one answer,
     *  so a local is never typed on a chain the printer then prints boxed. */
    rustBearerChainHopArg(keyNode: any, keyText: string, name: string): string | undefined {
        return this.rustNativeInsertKeyArg({ text: name, isField: false, plain: true }, keyNode, keyText)
            ?? this.rustBearerWriteKeyArg(keyNode, keyText, name);
    }

    rustBearerChainedWrite(baseExpr: any, keys: any[], keyStrs: string[], valueText: string): string | undefined {
        if (this.rustDictBearerDeclaration(baseExpr) === undefined) return undefined;
        const name = String(baseExpr.text);
        const hop = this.rustBearerChainHopArg(keys[0], keyStrs[0], name);
        if (hop === undefined) return undefined;
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText;
        const readsReceiver = new RegExp(`\\b${name}\\b`).test(value);
        const acc = `${name}.entry(${hop}).or_default()`;
        // Two levels: the bucket holds a plain map, so the write is the guarded
        // native insert the boxed form prints for the same shape.
        const lastKey = keyStrs.length === 2 ? this.rustBearerChainHopArg(keys[1], keyStrs[1], name) : undefined;
        if (lastKey !== undefined) {
            const trimmed = value.trim();
            const payload = readsReceiver ? '__be_tmp'
                : (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) && !/^(?:self|true|false)$/.test(trimmed) ? `${trimmed}.clone()` : value);
            const insert = `if let Value::Dict(__d) = ${acc} { std::sync::Arc::make_mut(__d).insert(${lastKey}, ${payload}); }`;
            return readsReceiver ? `{ let __be_tmp = ${value}; ${insert} }` : insert;
        }
        // Deeper: every middle hop stays a `get_value_mut`, the last write the helper.
        let deepAcc = acc;
        for (const middle of keyStrs.slice(1, -1)) deepAcc = `get_value_mut(${deepAcc}, &${middle})`;
        const tail = `add_element_to_object(${deepAcc}, &${keyStrs[keyStrs.length - 1]}, `;
        if (readsReceiver) return `{ let __be_tmp = ${value}; ${tail}__be_tmp); }`;
        return `${tail}${value})`;
    }

    // ── the write side of the typed dict bearer ───────────────────────────────
    // The bearer is a bare `IndexMap<String, Value>`, so every write must print `.insert(<String>, <Value>)` with no
    // box and no `cow_guard`. These proofs only add shapes; a write the key type cannot prove keeps the helper.

    /** A key the bearer write takes natively: the checker proves a `string` and
     *  the printed key is a `Value::Str(..)` whose payload is that `String`, or a
     *  native `Option<String>` place. A key that names the receiver is out (the
     *  insert holds its `&mut`). */
    rustBearerWriteKeyOk(keyNode: any, receiverName: string): boolean {
        return this.rustBearerWriteKeyArg(keyNode, this.printNode(keyNode, 0), receiverName) !== undefined;
    }

    /** `m[k] = v` on a bearer with `k` a native `Option<String>` local. */
    placeKeyNative(key: any): boolean {
        if (!isIdentifier(key) || !this.rustStringLocalIdentifierIsTyped(key)) return false;
        const name = String(key.text);
        return name !== 'self' && !this.rustNodeIsKeyUnsafePlace(name);
    }

    /** The native map key for a printed bearer-write key, or undefined when the
     *  box's payload is not a `String`. Literal keys stay with the shared path. */
    rustBearerWriteKeyArg(keyNode: any, keyText: string, receiverName: string): string | undefined {
        const key: any = this.rustSkipWrappers(keyNode);
        if (key === undefined || isStringLiteral(key)) return undefined;
        if (this.placeKeyNative(key) === true) return `${String(key.text)}.clone().unwrap_or_default()`;
        const text = String(keyText).trim();
        if (text === '' || new RegExp(`\\b${receiverName}\\b`).test(text)) return undefined;
        if (!this.rustKeyIsProvenString(key)) return this.stringifiedWriteKeyArg(key, text);
        const boxed = text.match(/^Value::Str\((.+)\)$/s);
        // A string-proven member read prints a `Value` box, not a `Str` payload.
        if (boxed === null) return this.stringifiedWriteKeyArg(key, text);
        const payload = boxed[1].trim().replace(/\.into\(\)$/, '').trim();
        if (/^format!\(/s.test(payload)) return payload;
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(payload) && payload !== 'self') return `${payload}.to_string()`;
        return undefined;
    }

    /** A write key of any boxed type: `add_element_to_object` stores a non-`Str` key through `stringify_simple`,
     *  which `stringify_param` is, so the same call is the whole key conversion. Only `Value`-printed shapes qualify. */
    stringifiedWriteKeyArg(key: any, text: string): string | undefined {
        if (!this.keyTextIsValuePlace(key, text)) return undefined;
        return `crate::runtime::stringify_param(&(${text}))`;
    }

    /** The printed text of a key place that is a `Value` and safe to evaluate in a
     *  key position: no nested statement, assignment or await. */
    keyTextIsValuePlace(key: any, text: string): boolean {
        if (text === '' || text.includes(';') || /(?:^|[^=!<>])=\s/.test(text) || /\bawait\b/.test(text)) {
            return false;
        }
        if (key.kind === SyntaxKind.ArrowFunction || key.kind === SyntaxKind.FunctionExpression
            || key.kind === SyntaxKind.AwaitExpression) {
            return false;
        }
        // A printed `Value`: a box, a match arm, or a map read (`get_value` /
        // `unwrap_or(Value::Null)`) — a `string | undefined` member read prints the
        // box, so the type alone would refuse a place that really is a `Value`.
        if (/^(?:Value::|\(match |\(if |get_value|crate::value::get_value_k)|unwrap_or\(Value::Null\)/.test(text)) {
            return true;
        }
        return this.keyPrintsAsValue(this.typeOfNodeIfAny(key));
    }

    /** `k in x` on a typed bearer: `in_op`'s own Dict arm — a key that is not a
     *  `Str` is never a hit — with the lookup on the bare map. */
    bearerInOp(key: any, obj: any): string | undefined {
        const recv: any = this.rustSkipWrappers(obj);
        if (recv === undefined || !isIdentifier(recv) || this.rustDictBearerDeclaration(recv) === undefined) {
            return undefined;
        }
        const text = this.bearerInOpKeyText(key);
        if (text === undefined) return undefined;
        return `Value::Bool(matches!(&${text}, Value::Str(__k) if ${String(recv.text)}.contains_key(__k.as_ref())))`;
    }

    /** The key half of `bearerInOp`, also used while the receiver's own bearer
     *  proof is still running (its declaration probe answers "not typed" then). */
    bearerInOpKeyText(key: any): string | undefined {
        const keyNode: any = this.rustSkipWrappers(key);
        if (keyNode === undefined || isStringLiteral(keyNode)) return undefined;
        const text = this.printNode(key, 0).trim();
        if (!/^(?:[A-Za-z_][A-Za-z0-9_]*|crate::|Value::|\(match |\(if )/.test(text)
            || !this.keyTextIsValuePlace(keyNode, text)) return undefined;
        return text;
    }

    /** The printed Rust for this TS type is a `Value`: `any`, an object/dict shape,
     *  or a union of those with nullish. A `string`/number/bool place prints its own
     *  Rust type instead (the caller's string proof owns those). */
    keyPrintsAsValue(type: any): boolean {
        if (type === undefined) return false;
        const parts: any[] = (type.flags & TypeFlags.Union) ? ((typeParts(type) ?? []) as any[]) : [ type ];
        if (parts.length === 0) return false;
        const checker: any = this.checkerOrUndefined();
        return parts.every((part: any) => {
            if ((part.flags & TypeFlags.Any) !== 0) return true;
            if ((part.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void)) !== 0) return true;
            if ((part.flags & (TypeFlags.StringLike | TypeFlags.NumberLike | TypeFlags.BooleanLike
                | TypeFlags.BigIntLike | TypeFlags.ESSymbolLike | TypeFlags.TypeParameter)) !== 0) return false;
            if ((part.flags & TypeFlags.Object) === 0) return false;
            return checker === undefined || (!checker.isArrayType(part) && !checker.isTupleType(part));
        });
    }

    /** A plain object literal a bearer may be rebuilt from (`x = { .. }`): no
     *  spread, literal keys only — the same rules the declaration proof applies. */
    rustBearerPlainLiteral(node: any): boolean {
        const literal: any = this.rustSkipWrappers(node);
        if (!isObjectLiteralExpression(literal)) return false;
        if (literal.properties.some((p: any) => p.kind === SyntaxKind.SpreadAssignment)) return false;
        return literal.properties.every((property: any) => {
            const propertyName: any = property.name;
            return propertyName !== undefined && propertyName.kind !== SyntaxKind.ComputedPropertyName
                && RustTranspiler.rustBearerKeyTextOk(String(propertyName.text));
        });
    }

    /** `x = { .. }` (or a compound rebuild) on a bearer: the value is the map. */
    rustBearerRebuild(n: any): boolean {
        const parent: any = n.parent;
        if (parent === undefined) return false;
        if (isBinaryExpression(parent) && parent.left === n) {
            return parent.operatorToken.kind === SyntaxKind.EqualsToken && this.rustBearerPlainLiteral(parent.right);
        }
        return this.rustBearerLiteralMove(n);
    }

    /** The move of a bearer into a parent object literal's value. Shorthand
     *  (`{ x }`) is out: the literal printer clones the name without passing
     *  through the identifier printer, so the box could not be emitted. */
    rustBearerLiteralMove(node: any): boolean {
        const parent: any = node?.parent;
        if (parent === undefined || parent.kind !== SyntaxKind.PropertyAssignment || parent.initializer !== node) return false;
        return isObjectLiteralExpression(parent.parent);
    }

    // ── read-only container bearers ───────────────────────────────────────────
    // A local that provably holds a list (or a plain dict) and is only read by element access is declared
    // `Vec<Value>` (resp. a bare `IndexMap`), so reads print the native op. Any other use keeps the box and the helper.

    private rustReadBearerDecisions = new WeakMap<any, 'list' | 'map' | false>();

    /** The container kind a local is declared as, or undefined (no proof). */
    rustReadBearerKind(node: any): 'list' | 'map' | undefined {
        if (!isIdentifier(node)) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || declaration === node || declaration.name === node) return undefined;
        const kind = this.rustReadBearerKindOfDeclaration(declaration);
        return kind === false ? undefined : kind;
    }

    rustReadBearerKindOfDeclaration(declaration: any): 'list' | 'map' | false {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        let decision = this.rustReadBearerDecisions.get(declaration);
        if (decision === undefined) {
            this.rustReadBearerDecisions.set(declaration, false); // re-entrancy guard
            try {
                decision = this.rustReadBearerKindUncached(declaration);
            } catch (e) {
                decision = false; // no proof -> the local keeps its `Value` box
            }
            this.rustReadBearerDecisions.set(declaration, decision);
        }
        return decision;
    }

    rustReadBearerKindUncached(declaration: any): 'list' | 'map' | false {
        const init: any = this.rustSkipWrappers(declaration.initializer);
        if (declaration.name?.kind !== SyntaxKind.Identifier || init === undefined) return false;
        // The declaration printer types one binding per statement.
        const list: any = declaration.parent;
        if (list?.kind !== SyntaxKind.VariableDeclarationList || list.declarations?.length !== 1) return false;
        // Literal-built containers belong to the Vec / dict local families.
        if (isArrayLiteralExpression(init) || isObjectLiteralExpression(init)) return false;
        const kind = this.rustContainerProducingKind(init, new Set());
        if (kind === undefined) return false;
        const name = String(declaration.name.text);
        const fn: any = this.rustEnclosingFunction(declaration);
        if (fn === undefined || isSourceFile(fn)) return false;
        // The tests pipeline's text post-passes key on the boxed `Value` local shape.
        const source: any = declaration.getSourceFile?.()?.fileName;
        if (typeof source === 'string' && /\/test\//.test(source)) return false;
        if (this.rustLocalIsReassigned(declaration, name)) return false;
        const safe = this.rustLocalUsesAll(declaration, name, false, (n: any) => {
            if (this.rustIdentifierIsPropertyName(n)) {
                return !(n.parent?.kind === SyntaxKind.ShorthandPropertyAssignment && n.parent.name === n);
            }
            if (!this.rustIdentifierRefersToDeclaration(n, declaration)) return false;
            if (this.rustEnclosingFunction(n) !== fn) return false; // a closure capture
            const parent: any = n.parent;
            if (isElementAccessExpression(parent) && parent.expression === n) {
                return this.rustReadBearerElementUse(parent, kind);
            }
            if (kind === 'list' && isPropertyAccessExpression(parent) && parent.expression === n
                && String(parent.name.text) === 'length') {
                const up: any = parent.parent;
                return up?.kind !== SyntaxKind.PrefixUnaryExpression && up?.kind !== SyntaxKind.PostfixUnaryExpression
                    && !(isBinaryExpression(up) && up.left === parent && rustIsAssignmentOperator(up.operatorToken.kind));
            }
            return false;
        });
        return safe ? kind : false;
    }

    /** One element read rooted at the bearer: a plain read the native op serves. */
    rustReadBearerElementUse(access: any, kind: 'list' | 'map'): boolean {
        let root: any = access;
        while (isElementAccessExpression(root.parent) && root.parent.expression === root) root = root.parent;
        const up: any = root.parent;
        // A write, `delete`, or a call/property target still reaches the helper.
        if (up !== undefined && (isDeleteExpression(up) || (isBinaryExpression(up) && up.left === root)
            || (isCallExpression(up) && up.expression === root)
            || up.kind === SyntaxKind.PrefixUnaryExpression || up.kind === SyntaxKind.PostfixUnaryExpression)) return false;
        // The printer proves the position on the outermost chain node.
        if (!this.isNativeAccessPositionSafe(root) || this.isNativeWriteTargetBase(root)) return false;
        if (this.isWriteBackBindRead(access)) return false;
        return this.rustReadBearerKeyOk(kind, access.argumentExpression);
    }

    /** Key a read-only bearer serves natively: a literal string for a map, a
     *  literal (or proven-number `Value`) index for a list. */
    rustReadBearerKeyOk(kind: 'list' | 'map', keyNode: any): boolean {
        const key: any = this.rustSkipWrappers(keyNode);
        if (key === undefined) return false;
        if (kind === 'map') {
            if (!isStringLiteralLikeNode(key)) return false;
            const text = String((key as any).text);
            return RustTranspiler.rustBearerKeyTextOk(text) && !RustTranspiler.RUST_DICT_LOCAL_UNSAFE_KEYS.has(text);
        }
        if (isNumericLiteral(key)) {
            const index = Number(key.text);
            return Number.isInteger(index) && index >= 0;
        }
        return this.isRustValueIndexKey(key);
    }

    /** Native read of one bearer level; undefined keeps the helper. */
    printReadBearerAccess(kind: 'list' | 'map', receiverText: string, keyNode: any): string | undefined {
        const key: any = this.rustSkipWrappers(keyNode);
        if (!this.rustReadBearerKeyOk(kind, key)) return undefined;
        if (kind === 'map') {
            return `${receiverText}.get("${this.escapeRustStringLiteral(String((key as any).text))}").cloned().unwrap_or(Value::Null)`;
        }
        if (isNumericLiteral(key)) return `${receiverText}.get(${Number((key as any).text)}).cloned().unwrap_or(Value::Null)`;
        const keyText = this.printNode(keyNode, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyText)) return undefined;
        // A `Value` index: an in-range Int reads, a negative/absent/other key misses
        // (`-1 as usize` is out of range, exactly `get_value`'s default branch).
        if (this.rustI64CounterOf(key) !== undefined) return `${receiverText}.get(${keyText} as usize).cloned().unwrap_or(Value::Null)`;
        return `${receiverText}.get(${keyText}.as_i64().unwrap_or(-1) as usize).cloned().unwrap_or(Value::Null)`;
    }

    /** Container kind a printed `Value` expression provably yields on every path. */
    rustContainerProducingKind(node: any, seen: Set<Node>): 'list' | 'map' | undefined {
        if (node === undefined || node === null || seen.has(node)) return undefined;
        seen.add(node);
        if (isArrayLiteralExpression(node)) return 'list';
        if (isObjectLiteralExpression(node)) return 'map';
        if (isParenthesizedExpression(node) || isAsExpression(node) || isNonNullExpression(node) || isTypeAssertion(node)
            || node.kind === SyntaxKind.AwaitExpression) {
            return this.rustContainerProducingKind((node as any).expression, seen);
        }
        if (isConditionalExpression(node)) return undefined;
        if (isElementAccessExpression(node)) {
            // `this.orderbooks[symbol]`: the container's declared element type is what
            // the port stores there.
            const elementType = this.rustStringIndexedElementType((node as any).expression);
            return elementType !== undefined && this.rustDictBearerType(elementType) ? 'map' : undefined;
        }
        if (isIdentifier(node)) {
            const declaration: any = this.rustDeclarationOfIdentifier(node);
            if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name === node) return undefined;
            // An alias of an already-typed container is not a `Value` place.
            if (this.rustReadBearerKindOfDeclaration(declaration) !== false || this.rustVecLocalIsTyped(declaration)
                || this.rustDictLocalIsTyped(declaration)) return undefined;
            return this.rustContainerProducingKind(this.rustSkipWrappers(declaration.initializer), seen);
        }
        if (!isCallExpression(node)) return undefined;
        const callee: any = (node as any).expression;
        if (!isPropertyAccessExpression(callee)) return undefined;
        const method = String(callee.name.text);
        const owner: any = callee.expression;
        // `x.split(sep)` prints the runtime split: an array on every path.
        if (method === 'split' && owner.kind !== SyntaxKind.ThisKeyword) return 'list';
        if (owner.kind === SyntaxKind.Identifier) {
            const ownerName = String(owner.text);
            if (ownerName === 'Object' && (method === 'keys' || method === 'values' || method === 'entries')) return 'list';
            if (ownerName === 'Promise' && method === 'all') return 'list';
            return undefined;
        }
        if (owner.kind !== SyntaxKind.ThisKeyword) return undefined;
        // An array-returning reader: `safeList` only when its default is a list.
        if (method === 'safeList' || method === 'safeListValue') {
            const args: any[] = (node as any).arguments ?? [];
            return args.length < 3 || isArrayLiteralExpression(this.rustSkipWrappers(args[2])) ? 'list' : undefined;
        }
        if (method === 'safeDict' || method === 'safeMarket' || method === 'safeMarketStructure'
            || method === 'market' || method === 'currency' || method === 'safeCurrency') return 'map';
        // `safeValue(container, key)` without a default: the element or `undefined`.
        if (method === 'safeValue' || method === 'safeValue2') {
            const args: any[] = (node as any).arguments ?? [];
            if (args.length !== 2) return undefined;
            const elementType = this.rustStringIndexedElementType(args[0]);
            return elementType !== undefined && this.rustDictBearerType(elementType) ? 'map' : undefined;
        }
        // The callee's own returns build the container.
        const built = this.rustBuiltContainerKind(node, 0);
        if (built !== undefined) return built;
        return undefined;
    }

    /** Declared element type of a container indexed by a string key. */
    rustStringIndexedElementType(node: Node | undefined): Type | undefined {
        if (node === undefined) return undefined;
        const containerType = this.getCheckedTypeOf(node);
        if (containerType === undefined) return undefined;
        return this.getChecker().getIndexTypeOfType(containerType, IndexKind.String) ?? undefined;
    }

    // Two-level dict bearers: an object literal whose every value is an object literal is declared
    // `IndexMap<String, IndexMap<String, Value>>`, so `x[k1][k2] = v` is one `entry(k1)..insert(k2, v)` and
    // `x[k1][k2]` a two-step lookup. Any other shape keeps the box.

    private rustNestedBearerDecisions = new WeakMap<any, boolean>();

    /** The declaration behind `node` when it is a local typed as a two-level
     *  dict bearer. */
    rustNestedDictBearerDeclaration(node: any): any {
        if (!isIdentifier(node)) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name === node) return undefined;
        return this.rustNestedDictLocalIsTyped(declaration) ? declaration : undefined;
    }

    rustNestedDictLocalIsTyped(declaration: any): boolean {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        let decision = this.rustNestedBearerDecisions.get(declaration);
        if (decision === undefined) {
            this.rustNestedBearerDecisions.set(declaration, false); // re-entrancy guard
            try {
                decision = this.rustNestedDictLocalIsTypedUncached(declaration);
            } catch (e) {
                decision = false; // no proof -> the local keeps its `Value` box
            }
            this.rustNestedBearerDecisions.set(declaration, decision);
        }
        return decision;
    }

    /** `{ k: { .. }, .. }` — every value an object literal, every key a plain
     *  string: the outer map's value type is the inner `IndexMap`, never a box. */
    rustNestedDictLiteral(node: any): any {
        const literal: any = this.rustSkipWrappers(node);
        if (!isObjectLiteralExpression(literal)) return undefined;
        for (const property of literal.properties as unknown as any[]) {
            if (property.kind !== SyntaxKind.PropertyAssignment || property.name === undefined
                || property.name.kind === SyntaxKind.ComputedPropertyName) return undefined;
            if (!RustTranspiler.rustBearerKeyTextOk(String(property.name.text))) return undefined;
            const inner: any = this.rustSkipWrappers(property.initializer);
            if (!isObjectLiteralExpression(inner)) return undefined;
            for (const entry of inner.properties as unknown as any[]) {
                if (isShorthandPropertyAssignment(entry)) continue;
                if (entry.kind !== SyntaxKind.PropertyAssignment || entry.name === undefined
                    || entry.name.kind === SyntaxKind.ComputedPropertyName) return undefined;
                if (!RustTranspiler.rustBearerKeyTextOk(String(entry.name.text))) return undefined;
            }
        }
        return literal;
    }

    rustNestedDictLocalIsTypedUncached(declaration: any): boolean {
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) return false;
        if (declaration.name?.kind !== SyntaxKind.Identifier || declaration.initializer === undefined) return false;
        if (this.rustNestedDictLiteral(declaration.initializer) === undefined) return false;
        const name = String(declaration.name.text);
        const fn: any = this.rustEnclosingFunction(declaration);
        if (fn === undefined || isSourceFile(fn)) return false;
        // The tests pipeline's text post-passes key on the boxed `Value` local shape.
        const source: any = declaration.getSourceFile?.()?.fileName;
        if (typeof source === 'string' && /\/test\//.test(source)) return false;
        const escapes: any[] = [];
        let nestedUses = 0;
        const safe = this.rustLocalUsesAll(declaration, name, false, (n: any) => {
            if (this.rustIdentifierIsPropertyName(n)) {
                return !(n.parent?.kind === SyntaxKind.ShorthandPropertyAssignment && n.parent.name === n);
            }
            if (!this.rustIdentifierRefersToDeclaration(n, declaration)) return false;
            if (this.rustEnclosingFunction(n) !== fn) return false; // a closure capture
            const parent: any = n.parent;
            if (isReturnStatement(parent) && parent.expression === n) {
                escapes.push(n);
                return true;
            }
            if (isCallExpression(parent) && parent.arguments.some((a: any) => a === n)
                && isPropertyAccessExpression(parent.expression)
                && (parent.expression.expression.kind === SyntaxKind.ThisKeyword
                    || parent.expression.expression.kind === SyntaxKind.SuperKeyword)) {
                escapes.push(n);
                return true;
            }
            if (isElementAccessExpression(parent) && parent.expression === n) {
                if (!this.rustNestedBearerElementUse(parent, name)) return false;
                nestedUses += 1;
                return true;
            }
            if (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === n
                && parent.parent?.parent !== undefined && isObjectLiteralExpression(parent.parent)) {
                escapes.push(n);
                return true;
            }
            return false;
        });
        if (!safe || escapes.length > 1) return false;
        // Without a two-level use nothing proves the inner map; flat stays correct.
        if (nestedUses === 0) return false;
        if (escapes.length === 1 && !this.rustVecIsFinalUse(escapes[0], name)) return false;
        return true;
    }

    /** One use rooted at the bearer: exactly two key levels, either read
     *  (`x[k1][k2]` in a value position) or a whole-entry write (`x[k1][k2] = v`
     *  whose value never reads the receiver, which the write holds `&mut` of). */
    rustNestedBearerElementUse(access: any, name: string): boolean {
        let root: any = access;
        while (isElementAccessExpression(root.parent) && root.parent.expression === root) root = root.parent;
        const level1: any = root.expression;
        if (root === access) {
            // A bucket seeded as `x[k1] = {}` is the inner map itself.
            const up1: any = root.parent;
            if (!isIdentifier(level1) || String(level1.text) !== name) return false;
            if (!isBinaryExpression(up1) || up1.left !== root || up1.operatorToken.kind !== SyntaxKind.EqualsToken) return false;
            const seed: any = this.rustSkipWrappers(up1.right);
            if (!isObjectLiteralExpression(seed) || seed.properties.length !== 0) return false;
            return this.rustDictBearerKeyOk(access.argumentExpression);
        }
        if (!isElementAccessExpression(level1) || !isElementAccessExpression(access)) return false;
        const base: any = level1.expression;
        if (!isIdentifier(base) || String(base.text) !== name) return false;
        if (!this.rustDictBearerKeyOk(access.argumentExpression) || !this.rustDictBearerKeyOk(root.argumentExpression)) return false;
        const up: any = root.parent;
        const write = up !== undefined && isBinaryExpression(up) && up.left === root
            && rustIsAssignmentOperator(up.operatorToken.kind);
        if (write) {
            if (up.operatorToken.kind !== SyntaxKind.EqualsToken) return false;
            return !new RegExp(`\\b${name}\\b`).test(String(up.right.getText?.() ?? ''));
        }
        if (up !== undefined && (isDeleteExpression(up) || (isCallExpression(up) && up.expression === root)
            || up.kind === SyntaxKind.PrefixUnaryExpression || up.kind === SyntaxKind.PostfixUnaryExpression)) return false;
        if (!this.isNativeAccessPositionSafe(root) || this.isNativeWriteTargetBase(root)) return false;
        if (this.isWriteBackBindRead(access)) return false;
        return true;
    }

    /** The initialiser of a two-level bearer: one bucket per key, a line per entry. */
    rustNestedObjectLiteralBlock(literal: any, identation = 0): string {
        const escapeKey = (s: any): string => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        const idn1 = this.getIden(identation + 1);
        const lines: string[] = [];
        for (const property of literal.properties as unknown as any[]) {
            const inner: any = this.rustSkipWrappers(property.initializer);
            lines.push(`${idn1}let mut __inner = indexmap::IndexMap::<String, Value>::new();`);
            for (const entry of inner.properties as unknown as any[]) {
                const keyText = String(entry.name.text);
                const value = isShorthandPropertyAssignment(entry)
                    ? `${keyText}.clone()` : this.printNode(entry.initializer, 0);
                lines.push(`${idn1}__inner.insert("${escapeKey(keyText)}".to_string(), ${value});`);
            }
            lines.push(`${idn1}m.insert("${escapeKey(property.name.text)}".to_string(), __inner);`);
        }
        const body = lines.map((l) => l + '\n').join('');
        return `{\n${idn1}let mut m = indexmap::IndexMap::<String, indexmap::IndexMap<String, Value>>::new();\n${body}${idn1}m\n${this.getIden(identation)}}`;
    }

    /** Read key: a bare literal, or the String an `IndexMap` lookup takes. */
    rustNestedBearerReadKey(node: any, text: string, receiver = ''): string | undefined {
        if (isStringLiteralLikeNode(node)) return `"${this.escapeRustStringLiteral(String((node as any).text))}"`;
        const arg = this.rustNativeInsertKeyArg({ text: receiver, isField: false, plain: true }, node, text);
        return arg === undefined ? undefined : `&${arg}`;
    }

    /** Write key: the `String` an `entry`/`insert` takes. */
    rustNestedBearerWriteKey(node: any, text: string, receiver = ''): string | undefined {
        if (isStringLiteralLikeNode(node)) return `"${this.escapeRustStringLiteral(String((node as any).text))}".to_string()`;
        return this.rustNativeInsertKeyArg({ text: receiver, isField: false, plain: true }, node, text);
    }

    /** `x[k1][k2] = v` on a two-level bearer: create the bucket, insert. */
    rustNestedBearerInsert(baseExpr: any, key1Node: any, key1Text: string, key2Node: any, key2Text: string, valueText: string): string | undefined {
        if (this.rustNestedDictBearerDeclaration(baseExpr) === undefined) return undefined;
        const name = String(baseExpr.text);
        if (new RegExp(`\\b${name}\\b`).test(valueText)) return undefined;
        const k1 = this.rustNestedBearerWriteKey(key1Node, key1Text, name);
        const k2 = this.rustNestedBearerWriteKey(key2Node, key2Text, name);
        if (k1 === undefined || k2 === undefined) return undefined;
        const value = this.rustPrintedBoolArg(valueText) ? `Value::Bool(${valueText})` : valueText.trim();
        const arg = RustTranspiler.cloneIfBareLocal(value);
        return `${name}.entry(${k1}).or_default().insert(${k2}, ${arg})`;
    }

    /** `x[k1] = {}` on a two-level bearer: seed the bucket, no box, no helper. */
    rustNestedBearerBucket(baseExpr: any, key1Node: any, key1Text: string, valueNode: any): string | undefined {
        if (this.rustNestedDictBearerDeclaration(baseExpr) === undefined) return undefined;
        const value: any = this.rustSkipWrappers(valueNode);
        if (!isObjectLiteralExpression(value) || value.properties.length !== 0) return undefined;
        const k1 = this.rustNestedBearerWriteKey(key1Node, key1Text, String(baseExpr.text));
        if (k1 === undefined) return undefined;
        return `${String(baseExpr.text)}.entry(${k1}).or_default()`;
    }

    /** `x[k1][k2]` on a two-level bearer: the two map lookups, boxed like `get_value`. */
    rustNestedBearerRead(baseExpr: any, key1Node: any, key2Node: any): string | undefined {
        if (this.rustNestedDictBearerDeclaration(baseExpr) === undefined) return undefined;
        const name = String(baseExpr.text);
        const k1 = this.rustNestedBearerReadKey(key1Node, this.printNode(key1Node, 0).trim(), name);
        const k2 = this.rustNestedBearerReadKey(key2Node, this.printNode(key2Node, 0).trim(), name);
        if (k1 === undefined || k2 === undefined) return undefined;
        return `${name}.get(${k1}).and_then(|__n| __n.get(${k2})).cloned().unwrap_or(Value::Null)`;
    }

    // Native IndexMap ops for `k in X`, `delete X[k]`, `Object.keys/values(X)`.

    /** Source path of a node (forward slashes). */
    provenDictFieldPath(node: Node): string {
        const src: any = (node as any)?.getSourceFile?.();
        return typeof src?.fileName === 'string' ? src.fileName.replace(/\\/g, '/') : '';
    }

    /** Test sources keep the helpers: tests-pipeline post-passes match `in_op(` text. */
    isTestSource(node: Node): boolean {
        return /\/test\//.test(this.provenDictFieldPath(node));
    }

    /** `k in X` with a non-literal key on a dict-shaped receiver: `in_op`'s Dict arm.
     *  The Arr arm is the only other `true` path; the dict proof excludes it. */
    provenDictFieldInOp(key, obj): string | undefined {
        const recv: any = this.rustStripWrappers(obj);
        if (this.isTestSource(obj) || !this.isShallowValueReceiver(recv) || this.rustParamShadowOf(recv) !== undefined
            || (isPropertyAccessExpression(recv) && RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(String(recv.name.text)))
            || !this.isDictShapedType(this.typeOfNodeIfAny(obj))) {
            return undefined;
        }
        const objExpr = this.printNode(obj, 0).trim();
        const keyExpr = this.printNode(key, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyExpr) || keyExpr === 'self') {
            return undefined; // the key is borrowed beside the receiver: plain locals only
        }
        return `Value::Bool(matches!((&${objExpr}, &${keyExpr}), (Value::Dict(__d), Value::Str(__k)) if __d.contains_key(__k.as_ref())))`;
    }

    /** `delete X[k]` on a receiver the native-insert proof admits (never a ws
     *  subscriptions snapshot, so `try_ws_subs_remove` is dead): `shift_remove`. */
    provenDictFieldDelete(node): string | undefined {
        const target: any = node?.expression;
        if (target === undefined || !isElementAccessExpression(target) || this.isTestSource(node)) {
            return undefined;
        }
        const base: any = target.expression;
        const receiver = this.rustNativeInsertReceiver(base);
        // ws-capable tiers: a local/param may alias a `client.subscriptions` snapshot
        // (live-store route in the helper); admit only fields, literal-built locals and
        // declared-Dict table locals whose initialiser reads no tagged container.
        const restTier = /\/ts\/src\/[^/]+\.ts$/.test(this.provenDictFieldPath(node));
        const declaredLocal = !receiver?.isField && this.rustDeclaredLocalEntry(base) !== undefined
            && !this.rustLocalInitReadsTaggedContainer(base);
        if (receiver !== undefined && !receiver.isField && !restTier && receiver.plain !== true && !declaredLocal) {
            return undefined;
        }
        if (receiver === undefined || this.rustParamShadowOf(base) !== undefined
            || !this.rustReceiverStaysDict(base, receiver)
            || (receiver.isField && RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(String(receiver.nameNode.text)))
            || (!receiver.isField && this.rustLocalInitReadsTaggedContainer(base))) {
            return undefined;
        }
        const recv = this.printNode(base, 0).trim();
        const keyNode: any = target.argumentExpression;
        const literal = isStringLiteral(keyNode) ? this.rustStringLiteralOf(this.printNode(keyNode, 0).trim()) : undefined;
        if (literal !== undefined) {
            return `if let Value::Dict(__d) = &mut ${recv} { std::sync::Arc::make_mut(__d).shift_remove(${literal}); }`;
        }
        const keyExpr = this.printNode(keyNode, 0).trim();
        if (!this.rustDeleteKeyBorrowable(keyExpr, recv)) {
            return undefined;
        }
        const emitted = `if let (Value::Dict(__d), Value::Str(__k)) = (&mut ${recv}, &${keyExpr}) { std::sync::Arc::make_mut(__d).shift_remove(__k.as_ref()); }`;
        return emitted.length > 380 ? undefined : emitted; // keep the line under the long400 budget
    }

    /** A key the native `if let` can borrow beside `&mut RECV`: one expression
     *  (no statement), naming neither the receiver nor its owner — the tuple
     *  would borrow `self` twice — and never a bare `self`. */
    rustDeleteKeyBorrowable(keyExpr: string, recv: string): boolean {
        if (keyExpr.length === 0 || keyExpr.includes(';') || /\bself\b/.test(keyExpr)) {
            return false;
        }
        return !(/^[A-Za-z_][A-Za-z0-9_]*$/.test(recv)
            && new RegExp(`(^|[^A-Za-z0-9_])${recv}([^A-Za-z0-9_]|$)`).test(keyExpr));
    }

    /** `this.<field>` with a declared plain-dict type that is no ws container: the
     *  hand-written base builds these maps itself and never tags them. */
    untaggedDictField(node): boolean {
        return isPropertyAccessExpression(node) && node.expression.kind === SyntaxKind.ThisKeyword
            && !RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(String(node.name.text))
            && !RustTranspiler.RUST_TAGGED_HANDLE_FIELDS.has(String(node.name.text))
            && this.rustDeclaredPlainDictField(node);
    }

    rustDeclaredPlainDictField(node): boolean {
        let declaration: any;
        try {
            declaration = symbolValueDeclaration(this.getChecker().getSymbolAtLocation(node.name));
        } catch (e) {
            return false;
        }
        if (declaration === undefined || declaration.kind !== SyntaxKind.PropertyDeclaration || declaration.type === undefined) return false;
        const type = this.getCheckedTypeOf(declaration.type);
        return type !== undefined && this.isProvenMapType(type);
    }

    /** `Object.keys/values(X)` in REST-tier sources (`ts/src/<id>.ts`): no ws client
     *  there, so X never carries the `__ws_subs_url`/`__ws_sub_ref` tags the helper filters. */
    provenDictFieldEnum(node, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined {
        const arg: any = this.rustStripWrappers(node?.arguments?.[0]);
        if (arg === undefined || parsedArg === undefined
            || !(/\/ts\/src\/[^/]+\.ts$/.test(this.provenDictFieldPath(node)) || this.untaggedDictField(arg))
            || !(isIdentifier(arg) || isPropertyAccessExpression(arg) || isElementAccessExpression(arg) || isCallExpression(arg))
            || this.rustParamShadowOf(arg) !== undefined) {
            return undefined;
        }
        const type = this.typeOfNodeIfAny(arg);
        const parts: Type[] = type === undefined ? [] : ((type.flags & TypeFlags.Union) ? (typeParts(type) ?? []) : [type]);
        if (parts.some((p) => this.getChecker().isArrayType(p) || this.getChecker().isTupleType(p)
            || (p.flags & (TypeFlags.StringLike | TypeFlags.NumberLike | TypeFlags.BooleanLike | TypeFlags.BigIntLike)) !== 0)) {
            return undefined; // native-typed locals (bool / Option<String>) have no `as_map`
        }
        const text = parsedArg.trim();
        const recv = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(text) ? text : `(${text})`;
        const body = kind === 'keys' ? '__m.keys().map(|__k| Value::Str(__k.clone().into())).collect()' : '__m.values().cloned().collect()';
        return `Value::Array(${recv}.as_map().map(|__m| ${body}).unwrap_or_default())`;
    }

    // String methods on a checker-proven string receiver print native `str` code. The
    // receiver is a `Value`; `as_str()` reaches the payload and its `None` arm is the helper's
    // non-`Str` branch (Null / false / empty array / -1). Literal operands only, unless noted.

    /** Printed receiver usable as a method receiver, else undefined. */
    rustNativeStringReceiver(node, receiverText: string, kind = 'string'): string | undefined {
        if (node === undefined || !isCallExpression(node) || !isPropertyAccessExpression(node.expression)) return undefined;
        if (typeof receiverText !== 'string' || receiverText.includes('\n') || receiverText.trim().startsWith('&')) return undefined;
        const receiver = node.expression.expression;
        if (receiver.kind === SyntaxKind.ThisKeyword || receiver.kind === SyntaxKind.SuperKeyword) return undefined;
        if (kind === 'string' && this.primitiveKindOfType(this.typeOfNodeIfAny(receiver)) !== 'string') return undefined;
        if (isIdentifier(receiver) && this.rustStringLocalIdentifierIsTyped(receiver)) return undefined;
        const text = receiverText.trim();
        return /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(text) ? text : `(${text})`;
    }

    /** Escaped text of a string-literal argument, else undefined. */
    rustNativeStringLiteralArg(node): string | undefined {
        if (node === undefined || (!isStringLiteral(node) && !isNoSubstitutionTemplateLiteral(node))) return undefined;
        if (node.text in this.StringLiteralReplacements) return undefined;
        return this.escapeRustStringLiteral(node.text);
    }

    // `x.toUpperCase()` / `x.toLowerCase()`: the helper's `Value::Str` arm, Null otherwise.
    printNativeStringCase(node, receiverText: string, method: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || (node.arguments?.length ?? 0) !== 0) return undefined;
        return this.rustStrCaseConvert(receiver, method);
    }

    // Case conversion of a Str place: non-Str stays Null. Closure-free for a plain place (read once either way).
    rustStrCaseConvert(receiver: string, method: string): string {
        if (RUST_PLAIN_PLACE.test(receiver)) {
            return `(if let Some(__s) = ${receiver}.as_str() { Value::Str(__s.${method}().into()) } else { Value::Null })`;
        }
        return `${receiver}.as_str().map(|__s| Value::Str(__s.${method}().into())).unwrap_or(Value::Null)`;
    }

    // `x.startsWith("lit")` / `x.endsWith("lit")` → a bool (false for a non-`Str` receiver).
    printNativeStringAffixTest(node, receiverText: string, method: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 1) return undefined;
        const literal = this.rustNativeStringLiteralArg(node.arguments[0]);
        if (literal === undefined) return undefined;
        // A non-empty literal is never matched by the `""` a non-Str receiver gives: closure-free.
        if (literal !== '' && RUST_PLAIN_PLACE.test(receiver)) return `${receiver}.as_str().unwrap_or("").${method}("${literal}")`;
        return `${receiver}.as_str().is_some_and(|__s| __s.${method}("${literal}"))`;
    }

    // `x.split("lit")`: an array of the parts, the empty array for a non-`Str` receiver.
    printNativeStringSplit(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 1) return undefined;
        const literal = this.rustNativeStringLiteralArg(node.arguments[0]);
        if (literal === undefined) return undefined;
        if (RUST_PLAIN_PLACE.test(receiver)) {
            return `Value::Array(if let Some(__s) = ${receiver}.as_str() { __s.split("${literal}").map(Value::from).collect() } else { Vec::new() })`;
        }
        return `Value::Array(${receiver}.as_str().map(|__s| __s.split("${literal}").map(Value::from).collect()).unwrap_or_default())`;
    }

    // `x.replace("a", "b")`: the helper replaces every occurrence (`str::replace`), else the receiver.
    printNativeStringReplace(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 2) return undefined;
        const from = this.rustNativeStringLiteralArg(node.arguments[0]);
        const to = this.rustNativeStringLiteralArg(node.arguments[1]);
        if (from === undefined || to === undefined) return undefined;
        return `${receiver}.as_str().map(|__s| Value::Str(__s.replace("${from}", "${to}").into())).unwrap_or_else(|| ${receiver}.clone())`;
    }

    // `x.padStart(N, "c")` with a one-char alphanumeric pad: `format!` width counts chars and never
    // truncates, which is the helper's arm for a one-char pad.
    printNativeStringPadStart(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 2) return undefined;
        const width = this.rustSliceLiteralBound(node.arguments[0]);
        const pad = node.arguments[1];
        if (width === undefined || width < 0 || width > 4096) return undefined;
        if ((!isStringLiteral(pad) && !isNoSubstitutionTemplateLiteral(pad)) || !/^[A-Za-z0-9 ]$/.test(pad.text)) return undefined;
        return `${receiver}.as_str().map(|__s| Value::Str(format!("{:${pad.text}>${width}}", __s).into())).unwrap_or(Value::Null)`;
    }

    // `x.padEnd(N, "c")` — the padStart arm with right padding (`<`): the helper appends
    // `repeat(need)` of a one-char pad, which `format!` width reproduces exactly.
    printNativeStringPadEnd(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 2) return undefined;
        const width = this.rustSliceLiteralBound(node.arguments[0]);
        const pad = node.arguments[1];
        if (width === undefined || width < 0 || width > 4096) return undefined;
        if ((!isStringLiteral(pad) && !isNoSubstitutionTemplateLiteral(pad)) || !/^[A-Za-z0-9 ]$/.test(pad.text)) return undefined;
        return `${receiver}.as_str().map(|__s| Value::Str(format!("{:${pad.text}<${width}}", __s).into())).unwrap_or(Value::Null)`;
    }

    // `x.toFixed(N)` on a checker-proven number and a literal digit count: the helper's Int/Float
    // arms are exactly `format!("{:.*}")` over the f64 payload. A string payload (which the helper
    // parses) is not proven here, so it keeps the helper. `Value::str` matches the shape the
    // ccxt-side string-helper pass already emits for the same site.
    printNativeToFixed(node, receiverText: string): string | undefined {
        if (node === undefined || !isCallExpression(node) || !isPropertyAccessExpression(node.expression)) return undefined;
        if (node.arguments?.length !== 1) return undefined;
        if (this.primitiveKindOfType(this.typeOfNodeIfAny(node.expression.expression)) !== 'number') return undefined;
        const receiver = this.rustNativeStringReceiver(node, receiverText, 'number');
        if (receiver === undefined) return undefined;
        const digits = this.rustSliceLiteralBound(node.arguments[0]);
        if (digits === undefined || digits < 0 || digits > 100) return undefined;
        return `Value::str(format!("{:.*}", ${digits}, ${receiver}.as_f64().unwrap_or(0.0)))`;
    }

    // `x.indexOf(y)` with a proven-string needle: `-1` when either side is not a `Str` (byte index).
    printNativeStringIndexOfString(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        if (receiver === undefined || node.arguments?.length !== 1) return undefined;
        const needle = node.arguments[0];
        if (!isIdentifier(needle) || this.primitiveKindOfType(this.typeOfNodeIfAny(needle)) !== 'string') return undefined;
        if (!this.isDeclaredValueIdentifier(needle) || this.rustStringLocalIdentifierIsTyped(needle)) return undefined;
        const needleText = this.printNode(needle, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(needleText)) return undefined;
        return `Value::Int(${receiver}.as_str().zip(${needleText}.as_str()).and_then(|(__s, __n)| __s.find(__n)).map(|__i| __i as i64).unwrap_or(-1))`;
    }

    // `xs.join("lit")` on a `string[]`: `Display` renders `Str`/`Null` like the helper does.
    printNativeStringJoin(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText, 'array');
        if (receiver === undefined || node.arguments?.length !== 1) return undefined;
        const literal = this.rustNativeStringLiteralArg(node.arguments[0]);
        if (literal === undefined) return undefined;
        const checker: any = this.checkerOrUndefined();
        const type: any = this.typeOfNodeIfAny(node.expression.expression);
        if (checker === undefined || type === undefined || !checker.isArrayType(type)) return undefined;
        const element = checker.getTypeArguments?.(type)?.[0];
        if (this.primitiveKindOfType(element) !== 'string') return undefined;
        return `Value::Str(${receiver}.as_array().map(|__a| __a.iter().map(|__v| __v.to_string()).collect::<Vec<String>>().join("${literal}")).unwrap_or_default().into())`;
    }

    // Numeric/string helpers on checker-proven `number` / `string` operands (nullish members
    // allowed: the helper's Null arm is reproduced). Each native form answers exactly what the helper
    // answers for Int/Float/Str/Null boxes; any other operand type keeps the helper.
    rustOperandKind(node): string | undefined {
        try {
            if (node === undefined || !this.printsValueExpression(node)) return undefined;
            return this.primitiveKindOfType(this.typeOfNodeIfAny(node));
        } catch (e) {
            return undefined;
        }
    }

    // `x.toString()` on a number/string: `to_string_val` is `stringify_simple`, i.e. `Display`.
    // Typed `Option<String>` receivers have no `Display`, so they keep the helper.
    printRustNativeToString(node, name: string): string | undefined {
        const receiver = node?.expression?.expression;
        const kind = this.rustOperandKind(receiver);
        if (kind !== 'number' && kind !== 'string') return undefined;
        const inner = this.unwrapParensNode(receiver);
        if (inner !== undefined && (this.rustStringLocalIdentifierIsTyped(inner) || this.rustNativeStrCalleeKind(inner) === 'str')) return undefined;
        return `Value::Str(format!("{}", ${name}).into())`;
    }

    // `Math.floor|round|ceil(n)`: the helper answers `Float(op(x))` for a numeric box, `Null` otherwise.
    printRustNativeMathCall(node, op: string, parsedArg: string): string | undefined {
        if (this.rustOperandKind(node?.arguments?.[0]) !== 'number') return undefined;
        return `(${parsedArg}).as_f64().map(|__x| Value::Float(__x.${op}())).unwrap_or(Value::Null)`;
    }

    // `-n`: Int/Float flip sign in place, a Null box stays Null (helper's fallthrough).
    printRustNativeNegate(operand, operandText: string): string | undefined {
        if (this.rustOperandKind(operand) !== 'number' && this.rustNumericKind(operand) === undefined) return undefined;
        return `(match &(${operandText}) { Value::Int(x) => Value::Int(-x), Value::Float(x) => Value::Float(-x), _ => Value::Null })`;
    }

    // `a % b` on numbers: Int pair stays Int, any Float widens; a zero divisor or Null answers Null.
    printRustNativeMod(left, right, leftText: string, rightText: string): string | undefined {
        if (this.rustOperandKind(left) !== 'number' || this.rustOperandKind(right) !== 'number') return undefined;
        return `(match (&(${leftText}), &(${rightText})) {` +
            ' (Value::Int(x), Value::Int(y)) if *y != 0 => Value::Int(x % y),' +
            ' (Value::Int(x), Value::Float(y)) if *y != 0.0 => Value::Float(*x as f64 % *y),' +
            ' (Value::Float(x), Value::Int(y)) if *y != 0 => Value::Float(*x % *y as f64),' +
            ' (Value::Float(x), Value::Float(y)) if *y != 0.0 => Value::Float(x % y),' +
            ' _ => Value::Null })';
    }

    // `.length` always prints `Value::Int` (`get_array_length` / `Value::Int(len)`), so a
    // `.length` read, or a `const` local initialised from one, is a never-null Int whatever its receiver.
    rustIsDefiniteInt(node): boolean {
        const inner = this.rustStripWrappers(node);
        if (inner === undefined) return false;
        if (isPropertyAccessExpression(inner)) return String(inner.name.text) === 'length';
        if (!isIdentifier(inner)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(inner);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.name?.kind !== SyntaxKind.Identifier) return false;
        if ((declaration.parent?.flags & NodeFlags.Const) === 0) return false;
        const init = this.rustStripWrappers(declaration.initializer);
        return init !== undefined && isPropertyAccessExpression(init) && String(init.name.text) === 'length';
    }

    // Int-only (definite) or checker-proven number (Int/Float/Null) operand that prints a `Value`.
    rustNumericOperand(node): string | undefined {
        if (this.rustIsDefiniteInt(node)) return 'definite';
        return this.rustOperandKind(node) === 'number' ? 'number' : undefined;
    }

    // `a === b` with a definite Int side against a number literal, a number or another definite Int:
    // is_equal compares Int/Float payloads as f64 and Null only equals Null, which `as_f64()` mirrors.
    rustLengthEquality(left, right, op): string | undefined {
        if (!this.rustIsDefiniteInt(left) && !this.rustIsDefiniteInt(right)) return undefined;
        const operator = (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken) ? '==' : '!=';
        const [ definite, other ] = this.rustIsDefiniteInt(left) ? [ left, right ] : [ right, left ];
        if (!this.printsValueExpression(definite)) return undefined;
        const otherInner = this.rustStripWrappers(other);
        if (otherInner !== undefined && otherInner.kind === SyntaxKind.NumericLiteral) {
            const text = this.numericLiteralF64Text(otherInner);
            if (text === undefined) return undefined;
            return `${this.printNode(definite, 0)}.as_f64() ${operator} Some(${text})`;
        }
        if (this.rustNumericOperand(other) === undefined) return undefined;
        return `${this.printNode(left, 0)}.as_f64() ${operator} ${this.printNode(right, 0)}.as_f64()`;
    }

    // `a + b` / `a - b` with a definite Int operand and a numeric one: the helper's Int/Float dispatch.
    // `s + n` / `n + s` with s a non-null string and n numeric: the helper's string branch, i.e.
    // `stringify_simple` of each side, which equals `Display` for Str/Int/Float/Null.
    rustNativeAddSubtract(op, left, right, leftType, rightType, leftText: string, rightText: string): string | undefined {
        if (op !== SyntaxKind.PlusToken && op !== SyntaxKind.MinusToken) return undefined;
        const leftNumeric = this.rustNumericOperand(left);
        const rightNumeric = this.rustNumericOperand(right);
        if ((leftNumeric === 'definite' && rightNumeric !== undefined) || (rightNumeric === 'definite' && leftNumeric !== undefined)) {
            return this.printNativeNumeric(op, leftText, rightText);
        }
        if (op !== SyntaxKind.PlusToken) return undefined;
        const stringSide = this.isStringLikeType(leftType) && rightNumeric !== undefined ? left
            : (this.isStringLikeType(rightType) && leftNumeric !== undefined ? right : undefined);
        if (stringSide === undefined || !this.printsValueExpression(stringSide)) return undefined;
        const inner = this.unwrapParensNode(stringSide);
        if (inner !== undefined && (this.rustStringLocalIdentifierIsTyped(inner) || this.rustNativeStrCalleeKind(inner) === 'str')) return undefined;
        return this.printNativeStringConcat(leftText, rightText);
    }

    // Native reads on receivers the plain-dict proof admits (tag-free literal / `account ()` / `omit` /
    // `extend` / tuple element 0 locals) and on `Dict`-annotated parameters whose writes keep them plain:
    // no marker route of `get_value` can fire on such a receiver.

    /** 'local' for a proven plain-dict local, 'param' for a plain-kept dict parameter. */
    rustPlainReceiver(node: Node): 'local' | 'param' | undefined {
        if (node === undefined || !isIdentifier(node) || this.rustParamShadowOf(node) !== undefined) return undefined;
        const declaration: any = this.rustSingleLocalDeclaration(node as Identifier);
        if (declaration !== undefined && isParameterDeclaration(declaration)) {
            if (declaration.type === undefined || declaration.dotDotDotToken !== undefined) return undefined;
            const type = this.getCheckedTypeOf(declaration.type);
            if (type === undefined || !this.isProvenMapType(type)) return undefined;
            return this.rustParamStaysPlainDict(declaration) ? 'param' : undefined;
        }
        try {
            return (this.rustLocalStaysPlain(node as Identifier) || this.rustShippedPlain(node as Identifier)) ? 'local' : undefined;
        } catch (e) {
            return undefined;
        }
    }

    /** A literal-key read (`x['k']` / `x.k`) on a proven plain receiver. */
    rustLiteralReadOk(receiverNode: Node, keyText: string): boolean {
        const kind = this.rustPlainReceiver(receiverNode);
        if (kind === undefined || keyText === '') return false;
        if (kind === 'param' && RustTranspiler.RUST_DICT_LOCAL_UNSAFE_KEYS.has(keyText)) return false;
        const read: any = receiverNode.parent;
        return read === undefined || !this.isWriteBackBindRead(read);
    }

    /** `x[k]` on a proven plain receiver with a `Value` key place (`string` or `any` typed). */
    rustDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        const kind = this.rustPlainReceiver(receiverNode);
        if (kind === undefined) return undefined;
        const key: any = this.rustSkipWrappers(keyNode);
        if (key === undefined || !isIdentifier(key) || this.rustStringLocalIdentifierIsTyped(key)) return undefined;
        const type = this.getCheckedTypeOf(key);
        if (type === undefined || !((type.flags & TypeFlags.Any) || this.rustKeyIsProvenString(key))) return undefined;
        const read = this.rustElementReadOfKey(keyNode);
        if (read !== undefined && this.isWriteBackBindRead(read)) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyText)) return undefined;
        if (kind === 'param' && this.rustNodeIsKeyUnsafePlace(keyText)) return undefined;
        return this.rustDictRead(receiverText, keyText, receiverNode);
    }

    // Typed `Vec<Value>` locals also admit an argument of a non-`&mut self` `this.m(..)`
    // call that is not the final use (boxed as `Value::from(x.clone())`, the clone the post-pass
    // gave the boxed local) and a plain `x[i]` read with a number index (native `Vec::get`).
    vecUse(n): boolean {
        const parent = n.parent;
        if (isCallExpression(parent) && parent.arguments.some((a) => a === n)) {
            const callee: any = parent.expression;
            if (!isPropertyAccessExpression(callee)) return false;
            const kind = callee.expression.kind;
            if (kind !== SyntaxKind.ThisKeyword && kind !== SyntaxKind.SuperKeyword) return false;
            if (RustTranspiler.MUT_SELF_METHODS.has(this.toSnakeCaseName(String(callee.name.text)))) return false;
            let mentions = 0;
            const visit = (m) => { if (m.kind === SyntaxKind.Identifier && m.text === n.text) mentions++; m.forEachChild?.(visit); };
            parent.arguments.forEach(visit);
            if (mentions !== 1) return false;
            return this.rustVecValueUse(n, String(n.text)) || !this.loopBetween(n);
        }
        return isElementAccessExpression(parent) && parent.expression === n && this.vecReadShape(parent);
    }

    // A loop around the use that does not also hold the declaration: a per-iteration Vec clone
    // would cost O(n) where the boxed local only bumped its Arc.
    loopBetween(n): boolean {
        const declaration = this.rustVecLocalDeclarationOf(n) ?? this.rustSingleLocalDeclaration(n);
        const fn = this.rustEnclosingFunction(n);
        for (let current: any = n.parent; current !== undefined && current !== fn; current = current.parent) {
            if (declaration !== undefined && this.isNodeInsideNode(declaration, current)) return false;
            switch (current.kind) {
            case SyntaxKind.ForStatement: case SyntaxKind.ForInStatement: case SyntaxKind.ForOfStatement:
            case SyntaxKind.WhileStatement: case SyntaxKind.DoStatement:
                return true;
            }
        }
        return false;
    }

    // `x[k]` as a plain value read: not a write/delete/++ target, not a chain or call receiver,
    // not a bind the next statement mutates (ccxt's write-back keys on `get_value` text).
    vecReadShape(access): boolean {
        const up: any = access.parent;
        if (up === undefined || isDeleteExpression(up) || up.kind === SyntaxKind.PrefixUnaryExpression
            || up.kind === SyntaxKind.PostfixUnaryExpression) return false;
        if (isBinaryExpression(up) && up.left === access && rustIsAssignmentOperator(up.operatorToken.kind)) return false;
        if ((isPropertyAccessExpression(up) || isElementAccessExpression(up) || isCallExpression(up)) && up.expression === access) return false;
        if (this.isWriteBackBindRead(access)) return false;
        const key: any = this.rustStripWrappers(access.argumentExpression);
        if (key === undefined) return false;
        if (isNumericLiteral(key)) return Number.isInteger(Number(key.text)) && Number(key.text) >= 0;
        // a `Value` number counter (`let i = 0`), as for the native dynamic list index
        return this.isRustValueIndexKey(key);
    }

    printElementAccessExpressionExceptionIfAny(node) {
        const receiver: any = node?.expression;
        if (receiver?.kind !== SyntaxKind.Identifier || this.rustVecLocalDeclarationOf(receiver) === undefined
            || !this.vecReadShape(node)) return super.printElementAccessExpressionExceptionIfAny(node);
        const name = this.printNode(receiver, 0).trim();
        const key: any = this.rustStripWrappers(node.argumentExpression);
        // `get_value`'s array arm: an Int index by `as usize` (negative misses), anything else misses.
        const index = isNumericLiteral(key) ? String(Number(key.text))
            : `(${this.printNode(node.argumentExpression, 0).trim()}).as_i64().unwrap_or(-1) as usize`;
        return `${name}.get(${index}).cloned().unwrap_or(Value::Null)`;
    }

    // An expression that always holds a `Value::Arr`: a runtime-split / array-literal-returning call,
    // or a never-reassigned local initialised from one (through `const y = x` aliases).
    provenListValue(node, depth = 0): boolean {
        const inner = this.rustStripWrappers(node);
        if (inner === undefined || depth > 4 || this.rustIsOrderBookSide(inner)) return false;
        if (isCallExpression(inner)) return this.rustCallReturnsProvenList(inner);
        if (!isIdentifier(inner)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(inner);
        if (declaration === undefined || !isVariableDeclaration(declaration) || declaration.initializer === undefined
            || !isIdentifier(declaration.name)) return false;
        if (this.rustLocalIsReassigned(declaration, String(declaration.name.text))) return false;
        return this.provenListValue(declaration.initializer, depth + 1);
    }

    // Plain-dict sources from base `safeDict*` reads of unshared dicts and same-file
    // sync request builders; native truthiness / bool equality on operands proven `Value::Bool`
    // or `Value::Null` at runtime (bool tuple elements, bool-returning exchange methods).

    /** Base-tier bool readers whose Rust form returns `Value::Bool` or `Value::Null`
     *  (`safe_bool*` keep only `Value::Bool` or the default; the `check_option_bool` stub). */
    private static readonly RUST_BOOL_READERS: { [name: string]: number } = { safeBool: 2, safeBool2: 3, safeBoolN: 2, checkOptionBool: -1 };
    private static readonly RUST_DICT_READERS: { [name: string]: number } = { safeDict: 2, safeDict2: 3, safeDictN: 2 };
    /** A REST venue file (`ts/src/<id>.ts`): no base / pro / prediction tier. */
    private static readonly RUST_REST_FILE = /ts\/src\/[^/]+\.ts$/;

    /** Extra plain-dict write sources (write-history proof), REST venue files only: no
     *  runtime tagged handle (book, ws subscription, cache bucket) is reachable there. */
    private rustVisiting = new Set<any>();

    rustPlainDictSource(node: any, depth = 0): boolean {
        if (depth > 4 || !isCallExpression(node) || !isPropertyAccessExpression(node.expression)
            || node.expression.expression.kind !== SyntaxKind.ThisKeyword
            || !this.plainSourceTier(node)) {
            return false;
        }
        const callee = String(node.expression.name.text);
        const defaultIndex = RustTranspiler.RUST_DICT_READERS[callee];
        if (defaultIndex !== undefined) {
            const fallback: any = this.rustStripWrappers(node.arguments[defaultIndex]);
            return this.rustCalleeIsBase(node) && node.arguments.length <= defaultIndex + 1
                && (fallback === undefined || this.rustPlainDictLiteral(fallback) || this.rustTypeIsUndefinedish(fallback))
                && this.rustUnsharedDict(node.arguments[0]) && this.tierSourceOk(node.arguments[0]);
        }
        if (this.freshCopy(node, depth)) return true;
        return this.rustPlainBuilder(node, depth);
    }

    /** `this.options`, a parameter, or a const local whose initializer reads no `this` field
     *  but `options` and no tagged container (`hashmap`, `subscriptions`, `futures`). */
    rustUnsharedDict(arg: any): boolean {
        const node: any = this.rustStripWrappers(arg);
        if (node === undefined) return false;
        if (isPropertyAccessExpression(node) && node.expression.kind === SyntaxKind.ThisKeyword) {
            return String(node.name.text) === 'options';
        }
        if (!isIdentifier(node)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(node);
        if (declaration === undefined) return false;
        // runtime tags live on pro-only fields; a REST method's parameter is caller data
        if (isParameterDeclaration(declaration)) return true;
        if (!isVariableDeclaration(declaration) || (declaration.parent?.flags & NodeFlags.Const) === 0 || declaration.initializer === undefined) return false;
        let clean = true;
        const visit = (n: any) => {
            if (!clean) return;
            if (isPropertyAccessExpression(n)) {
                const field = String(n.name.text);
                const isCallee = isCallExpression(n.parent) && n.parent.expression === n;
                if (RustTranspiler.RUST_TAGGED_CONTAINER_FIELDS.has(field)
                    || (n.expression.kind === SyntaxKind.ThisKeyword && !isCallee && field !== 'options')) {
                    clean = false;
                    return;
                }
            }
            n.forEachChild(visit);
        };
        visit(declaration.initializer);
        return clean;
    }

    /** `this.m (…)` on a sync method of the calling file whose every `return` is a plain
     *  literal, a plain local, or `this.extend|omit|keysort (plain, …unshared)`. */
    rustPlainBuilder(call: any, depth: number): boolean {
        const method: any = this.rustMethodImpl(call);
        if (method === undefined || method.getSourceFile() !== call.getSourceFile()
            || (method.modifiers ?? []).some((m: any) => m.kind === SyntaxKind.AsyncKeyword)) {
            return false;
        }
        // a builder whose proof reaches itself again (recursion through locals) proves nothing
        if (this.rustVisiting.has(method)) return false;
        this.rustVisiting.add(method);
        let plain = true;
        let returns = 0;
        try {
            this.rustWalkScope(method.body, (n) => {
                if (isArrowFunction(n) || n.kind === SyntaxKind.FunctionExpression) return RUST_WALK_SKIP;
                if (!isReturnStatement(n)) return;
                returns++;
                if (!this.rustPlainReturn(n.expression, depth)) { plain = false; return RUST_WALK_STOP; }
            });
        } finally {
            this.rustVisiting.delete(method);
        }
        return plain && returns > 0;
    }

    rustPlainReturn(expr: any, depth: number): boolean {
        const node: any = this.rustStripWrappers(expr);
        if (node === undefined) return false;
        const plainHead = (head: any): boolean => {
            const h: any = this.rustStripWrappers(head);
            return h !== undefined && (this.rustPlainDictLiteral(h)
                || (isIdentifier(h) && this.rustLocalStaysPlain(h, depth + 1)) || this.rustPlainDictSource(h, depth + 1));
        };
        if (plainHead(node)) return true;
        if (!isCallExpression(node) || !isPropertyAccessExpression(node.expression)
            || node.expression.expression.kind !== SyntaxKind.ThisKeyword || node.arguments.length === 0
            || !this.rustCalleeIsBase(node)) {
            return false;
        }
        const callee = String(node.expression.name.text);
        if (callee === 'omit' || callee === 'keysort') return plainHead(node.arguments[0]);
        return callee === 'extend' && plainHead(node.arguments[0])
            && node.arguments.slice(1).every((a) => plainHead(a) || (this.rustUnsharedDict(a) && this.tierSourceOk(a)));
    }

    /** The single bodied method declaration `this.m (…)` resolves to (implementation of an
     *  overload set), in the calling file or the base tier. */
    rustMethodImpl(call: any): any {
        const checker: any = this.checkerOrUndefined();
        const callee: any = call?.expression;
        if (checker === undefined || !isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        let declarations: any[];
        try {
            declarations = symbolDeclarations(checker.getSymbolAtLocation(callee.name))
                .filter((d: any) => d.kind === SyntaxKind.MethodDeclaration && d.body !== undefined);
        } catch (e) {
            return undefined;
        }
        // a base-tier caller may dispatch to any venue override
        const callerFile = String(call.getSourceFile().fileName).replace(/\\/g, '/');
        if (declarations.length !== 1 || RustTranspiler.RUST_BASE_TIER_FILE.test(callerFile)) return undefined;
        const file = String(declarations[0].getSourceFile().fileName).replace(/\\/g, '/');
        return declarations[0].getSourceFile() === call.getSourceFile() || RustTranspiler.RUST_BASE_TIER_FILE.test(file)
            ? declarations[0] : undefined;
    }

    /** The expression's Rust value is always `Value::Bool(_)` or `Value::Null`. */
    rustBoolValue(expr: any, depth = 0): boolean {
        let node: any = this.rustStripWrappers(expr);
        while (node !== undefined && node.kind === SyntaxKind.AwaitExpression) node = this.rustStripWrappers(node.expression);
        if (node === undefined || depth > 5) return false;
        switch (node.kind) {
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.NullKeyword:
            return true;
        case SyntaxKind.Identifier:
            return node.text === 'undefined' || this.rustBoolLocal(node, depth + 1);
        case SyntaxKind.PrefixUnaryExpression:
            return node.operator === SyntaxKind.ExclamationToken;
        case SyntaxKind.BinaryExpression: {
            const op = node.operatorToken.kind;
            return RustTranspiler.COMPARISON_OPS.has(op) || this.isLogicalOp(op);
        }
        case SyntaxKind.ConditionalExpression:
            return this.rustBoolValue(node.whenTrue, depth + 1) && this.rustBoolValue(node.whenFalse, depth + 1);
        case SyntaxKind.CallExpression:
            return this.rustBoolCall(node, depth);
        }
        return false;
    }

    /** A base `safeBool*` with a bool default, `checkOptionBool`, or a method (calling file or
     *  base tier) whose every `return` is such a value. */
    rustBoolCall(call: any, depth: number): boolean {
        if (!isPropertyAccessExpression(call.expression) || call.expression.expression.kind !== SyntaxKind.ThisKeyword) return false;
        const reader = RustTranspiler.RUST_BOOL_READERS[String(call.expression.name.text)];
        if (reader !== undefined) {
            if (!this.rustCalleeIsBase(call)) return false;
            return reader < 0 || call.arguments.length <= reader
                || (call.arguments.length === reader + 1 && this.rustBoolValue(call.arguments[reader], depth + 1));
        }
        // at least one return must be a real bool: an all-`undefined` stub proves nothing
        let sawBool = false;
        return this.rustEveryReturn(call, depth, (e) => {
            const nullish = this.rustTypeIsUndefinedish(this.rustStripWrappers(e) ?? e);
            sawBool = sawBool || !nullish;
            return nullish || this.rustBoolValue(e, depth + 1);
        }) && sawBool;
    }

    rustEveryReturn(call: any, depth: number, ok: (e: any) => boolean): boolean {
        const method: any = this.rustMethodImpl(call);
        if (method === undefined || this.rustVisiting.has(method)) return false;
        this.rustVisiting.add(method);
        let proven = true;
        let returns = 0;
        try {
            this.rustWalkScope(method.body, (n) => {
                if (isArrowFunction(n) || n.kind === SyntaxKind.FunctionExpression) return RUST_WALK_SKIP;
                if (!isReturnStatement(n)) return;
                returns++;
                if (n.expression === undefined || !ok(n.expression)) { proven = false; return RUST_WALK_STOP; }
            });
        } finally {
            this.rustVisiting.delete(method);
        }
        return proven && returns > 0;
    }

    /** Element `index` of `this.m (…)`'s tuple is a bool value on every return path. */
    rustBoolTupleElement(expr: any, index: number, depth: number): boolean {
        let call: any = this.rustStripWrappers(expr);
        while (call !== undefined && call.kind === SyntaxKind.AwaitExpression) call = this.rustStripWrappers(call.expression);
        if (call === undefined || !isCallExpression(call) || depth > 5) return false;
        return this.rustEveryReturn(call, depth, (e) => {
            const tuple: any = this.rustStripWrappers(e);
            if (tuple?.kind === SyntaxKind.ArrayLiteralExpression) {
                const element = tuple.elements[index];
                return element !== undefined && element.kind !== SyntaxKind.SpreadElement && this.rustBoolValue(element, depth + 1);
            }
            return this.rustBoolTupleElement(tuple, index, depth + 1);
        });
    }

    /** A local whose declaration and every write store a bool value. Locals the printer or
     *  ccxt's narrowBoolLocals may declare `bool` (bool-expression initializer) are left out. */
    rustBoolLocal(ident: any, depth: number): boolean {
        const checker: any = this.checkerOrUndefined();
        if (depth > 5) return false;
        const declarations: any[] = checker === undefined ? [] : symbolDeclarations(checker.getSymbolAtLocation(ident));
        const declaration: any = declarations.length === 1 ? declarations[0] : undefined;
        if (declaration === undefined) return false;
        let nameNode: any;
        let variable: any;
        if (declaration.kind === SyntaxKind.BindingElement) {
            const pattern: any = declaration.parent;
            variable = pattern?.parent;
            if (pattern?.kind !== SyntaxKind.ArrayBindingPattern || variable === undefined || !isVariableDeclaration(variable)
                || declaration.initializer !== undefined || declaration.dotDotDotToken !== undefined
                || declaration.name?.kind !== SyntaxKind.Identifier
                || !this.rustBoolTupleElement(variable.initializer, pattern.elements.indexOf(declaration), depth)) {
                return false;
            }
            nameNode = declaration.name;
        } else if (isVariableDeclaration(declaration) && declaration.name?.kind === SyntaxKind.Identifier) {
            const init: any = this.rustStripWrappers(declaration.initializer);
            if (init !== undefined && (this.rustNodeIsBoolExpression(init)
                || !(this.rustTypeIsUndefinedish(init) || (isIdentifier(init) && init.text === 'undefined') || this.rustBoolValue(init, depth)))) {
                return false;
            }
            variable = declaration;
            nameNode = declaration.name;
        } else {
            return false;
        }
        const scope = this.rustEnclosingFunction(variable);
        const symbol = this.rustSymbolOf(nameNode);
        const name = String(nameNode.text);
        if (scope === undefined || isSourceFile(scope) || symbol === undefined) return false;
        for (const node of this.rustScopeNameNodes(scope, name) as any[]) {
            if (node.kind !== SyntaxKind.Identifier || node === nameNode || this.rustSymbolOf(node) !== symbol) continue;
            if (this.rustEnclosingFunction(node) !== scope) return false;
            let target: any = node;
            while (target.parent !== undefined && (isParenthesizedExpression(target.parent) || isNonNullExpression(target.parent) || isAsExpression(target.parent))) target = target.parent;
            const parent: any = target.parent;
            if (isBinaryExpression(parent) && parent.left === target && rustIsAssignmentOperator(parent.operatorToken.kind)) {
                if (parent.operatorToken.kind !== SyntaxKind.EqualsToken || this.rustNodeIsBoolExpression(this.rustStripWrappers(parent.right))
                    || !this.rustBoolValue(parent.right, depth)) return false;
            } else if (parent?.kind === SyntaxKind.ArrayLiteralExpression) {
                const assign: any = parent.parent;
                if (assign !== undefined && isBinaryExpression(assign) && assign.left === parent
                    && !this.rustBoolTupleElement(assign.right, parent.elements.indexOf(target), depth)) return false;
            } else if ((parent?.kind === SyntaxKind.PrefixUnaryExpression && parent.operator !== SyntaxKind.ExclamationToken) || parent?.kind === SyntaxKind.PostfixUnaryExpression
                || parent?.kind === SyntaxKind.DeleteExpression
                || ((isForOfStatement(parent) || isForInStatement(parent)) && parent.initializer === target)) {
                return false;
            }
        }
        return true;
    }

    /** `if (x)` on a local or `this.m (…)` proven a bool value: `x.as_bool() == Some(true)`
     *  is `is_true` on `Value::Bool`/`Value::Null`; bool slots only (leading-token boxing). */
    rustNativeTruthiness(node: any): string | undefined {
        const inner: any = this.unwrapParens(node);
        if (inner === undefined || (!isIdentifier(inner) && !isCallExpression(inner))
            || !this.printsValueExpression(inner) || !this.isBareBoolEmissionSafe(node)
            || (isCallExpression(inner) && this.rustCallPrintsBool(inner)) || !this.rustBoolValue(inner)) {
            return undefined;
        }
        // the text ccxt's is_true post-pass prints for the same proof; `!` needs the parens
        const text = `${this.printNode(inner, 0)}.as_bool() == Some(true)`;
        let current: any = node;
        while (current.parent !== undefined && isParenthesizedExpression(current.parent)) current = current.parent;
        const negated = current.parent?.kind === SyntaxKind.PrefixUnaryExpression && current.parent.operator === SyntaxKind.ExclamationToken;
        return negated ? `(${text})` : text;
    }

    /** `x === true|false` with `x` proven a bool value: `is_equal` against a `Value::Bool` is
     *  the payload compare there (Null matches neither). */
    rustNativeBoolEquality(left: any, right: any, op: any): string | undefined {
        const leftLiteral = left.kind === SyntaxKind.TrueKeyword || left.kind === SyntaxKind.FalseKeyword;
        const rightLiteral = right.kind === SyntaxKind.TrueKeyword || right.kind === SyntaxKind.FalseKeyword;
        if (leftLiteral === rightLiteral) return undefined;
        const [ literal, other ] = leftLiteral ? [ left, right ] : [ right, left ];
        const inner: any = this.unwrapParens(other);
        if (inner === undefined || (!isIdentifier(inner) && !isCallExpression(inner)) || !this.printsValueExpression(inner)
            || (isCallExpression(inner) && this.rustCallPrintsBool(inner)) || !this.rustBoolValue(inner)) {
            return undefined;
        }
        const operator = (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken) ? '==' : '!=';
        return `${this.printNode(inner, 0)}.as_bool() ${operator} Some(${literal.kind === SyntaxKind.TrueKeyword ? 'true' : 'false'})`;
    }

    // Proven-`Str` operands: a `this.safeString*` call (no default or a string-literal
    // default) or a native-`Str` callee re-boxed into `Value`, or a `const`/never-reassigned local
    // initialized from one, can only hold `Value::Str` / `Value::Null`, whatever its TS type says.
    rustProvenStrSource(node): boolean {
        const inner: any = this.unwrapParensNode(node);
        if (inner === undefined || !isCallExpression(inner)) return false;
        if (this.rustNativeStrCalleeKind(inner) === 'str') return true;
        const callee: any = inner.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) return false;
        const name = callee.name.text;
        if (!RustTranspiler.RUST_STRING_LOCAL_HELPERS.has(name)) return false;
        const arity = /N$/.test(name) || !/2$/.test(name) ? 2 : 3;
        const args = inner.arguments ?? [];
        if (args.length === arity) return true;
        return args.length === arity + 1 && (isStringLiteral(args[arity]) || isNoSubstitutionTemplateLiteral(args[arity]));
    }

    rustProvenStrIdentifier(node): boolean {
        if (node === undefined || !isIdentifier(node) || this.rustStringLocalIdentifierIsTyped(node)) return false;
        const checker: any = this.checkerOrUndefined();
        const declarations: any[] = checker === undefined ? [] : symbolDeclarations(checker.getSymbolAtLocation(node));
        if (declarations.length !== 1 || !isVariableDeclaration(declarations[0])) return false;
        const declaration: any = declarations[0];
        if (declaration.name?.kind !== SyntaxKind.Identifier || !this.rustProvenStrSource(declaration.initializer)) return false;
        // every later write keeps the proof (D2): only `x = <proven source>`
        return this.rustLocalUsesAll(declaration, declaration.name.text, true, (n) => {
            if (this.rustWriteTarget(n)) return false;
            const parent: any = n.parent;
            if (parent?.kind !== SyntaxKind.BinaryExpression || parent.left !== n) return !(parent?.kind === SyntaxKind.PrefixUnaryExpression || parent?.kind === SyntaxKind.PostfixUnaryExpression) || parent.operator === SyntaxKind.ExclamationToken;
            const op = parent.operatorToken.kind;
            if (op < SyntaxKind.FirstAssignment || op > SyntaxKind.LastAssignment) return true;
            return op === SyntaxKind.EqualsToken && this.rustProvenStrSource(parent.right);
        });
    }

    /** A destructuring / for-in-of target: a write the direct-assignment check cannot see. */
    rustWriteTarget(node): boolean {
        let current: any = node;
        let parent: any = node.parent;
        while (parent !== undefined && (isArrayLiteralExpression(parent) || isObjectLiteralExpression(parent) || isParenthesizedExpression(parent)
            || parent.kind === SyntaxKind.PropertyAssignment || parent.kind === SyntaxKind.ShorthandPropertyAssignment || parent.kind === SyntaxKind.SpreadElement)) {
            current = parent;
            parent = parent.parent;
        }
        if ((isForOfStatement(parent) || isForInStatement(parent)) && parent.initializer === current) return true;
        return current !== node && isBinaryExpression(parent) && parent.left === current && parent.operatorToken.kind === SyntaxKind.EqualsToken;
    }

    /** `x` / `(x as string)` → the identifier under parens / `as`. */
    rustPeelCast(node): any {
        let current: any = node;
        while (current !== undefined && (isParenthesizedExpression(current) || isAsExpression(current))) current = current.expression;
        return current;
    }

    /** Printed text of an operand that is always `Value::Str` / `Value::Null`, else undefined:
     *  a proven-`Str` local, a checker-`string` declared local/param (the checker-string needle rule), or
     *  `"lit" + e` / `e + "lit"` (the `add` helper's string branch always yields `Value::Str`). */
    rustStrOperand(node, allowChecker: boolean): string | undefined {
        const inner = this.rustPeelCast(node);
        if (inner === undefined) return undefined;
        if (isIdentifier(inner)) {
            if (this.rustStringLocalIdentifierIsTyped(inner)) return undefined;
            const proven = this.rustProvenStrIdentifier(inner);
            const checked = allowChecker && this.isDeclaredValueIdentifier(inner)
                && this.primitiveKindOfType(this.typeOfNodeIfAny(inner)) === 'string';
            if (!proven && !checked) return undefined;
            const text = this.printNode(inner, 0).trim();
            return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : undefined;
        }
        if (allowChecker && isBinaryExpression(inner) && inner.operatorToken.kind === SyntaxKind.PlusToken
            && (isStringLiteral(inner.left) || isStringLiteral(inner.right))) {
            const text = this.printNode(inner, 0).trim();
            return text.includes('\n') ? undefined : `(${text})`;
        }
        return undefined;
    }

    // `a === b` with both sides proven `Str`/`Null`: `is_equal` is exactly the derived `PartialEq`
    // there (Null==Null, Str by content, Str vs Null false — its f64 fallback needs a number).
    printRustProvenStrEquality(left, right, op): string | undefined {
        if (!this.rustProvenStrIdentifier(this.unwrapParensNode(left)) || !this.rustProvenStrIdentifier(this.unwrapParensNode(right))) return undefined;
        const operator = (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken) ? '==' : '!=';
        return `${this.printNode(left, 0)} ${operator} ${this.printNode(right, 0)}`;
    }

    /** Receiver text when the call's receiver is a proven-`Str` local (checker strings are handled separately). */
    rustReceiver(node, receiverText: string): string | undefined {
        if (node === undefined || !isCallExpression(node) || !isPropertyAccessExpression(node.expression)) return undefined;
        const receiver = this.rustPeelCast(node.expression.expression);
        if (!this.rustProvenStrIdentifier(receiver)) return undefined;
        const text = (receiverText ?? '').trim();
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : undefined;
    }

    /** The checker-string receiver, when it prints as a bare name (it is read twice). */
    rustCheckerStrReceiver(node, receiverText: string): string | undefined {
        const receiver = this.rustNativeStringReceiver(node, receiverText);
        return receiver !== undefined && /^[A-Za-z_][A-Za-z0-9_]*$/.test(receiver) ? receiver : undefined;
    }

    // `s.replace(p, "lit")`: the helper replaces every occurrence when all three are `Str`, else
    // returns the receiver; `p` is a proven/checker string operand.
    printRustReplace(node, receiverText: string): string | undefined {
        if (node?.arguments?.length !== 2) return undefined;
        const receiver = this.rustReceiver(node, receiverText) ?? this.rustCheckerStrReceiver(node, receiverText);
        const to = this.rustNativeStringLiteralArg(node.arguments[1]);
        if (receiver === undefined || to === undefined || this.rustNativeStringLiteralArg(node.arguments[0]) !== undefined) return undefined;
        const from = this.rustStrOperand(node.arguments[0], true);
        if (from === undefined) return undefined;
        return `${receiver}.as_str().zip(${from}.as_str()).map(|(__s, __p)| Value::Str(__s.replace(__p, "${to}").into())).unwrap_or_else(|| ${receiver}.clone())`;
    }

    // `s.split(d)` with a proven/checker string delimiter: the parts, `[]` unless both are `Str`.
    printRustSplit(node, receiverText: string): string | undefined {
        if (node?.arguments?.length !== 1 || this.rustNativeStringLiteralArg(node.arguments[0]) !== undefined) return undefined;
        const receiver = this.rustReceiver(node, receiverText) ?? this.rustCheckerStrReceiver(node, receiverText);
        const delim = receiver === undefined ? undefined : this.rustStrOperand(node.arguments[0], true);
        if (delim === undefined) return undefined;
        return `Value::Array(${receiver}.as_str().zip(${delim}.as_str()).map(|(__s, __d)| __s.split(__d).map(Value::from).collect()).unwrap_or_default())`;
    }

    // `x.toString()` on a proven-`Str` local: `stringify_simple` of `Str`/`Null` is `Display`.
    printRustToString(node, receiverText: string): string | undefined {
        const receiver = this.rustReceiver(node, receiverText);
        return receiver === undefined || (node.arguments?.length ?? 0) !== 0 ? undefined : `Value::Str(format!("{}", ${receiver}).into())`;
    }

    // `x.toUpperCase()` / `x.toLowerCase()` on a proven-`Str` local (any TS type).
    printRustCase(node, receiverText: string, method: string): string | undefined {
        const receiver = this.rustReceiver(node, receiverText);
        return receiver === undefined || (node.arguments?.length ?? 0) !== 0 ? undefined : this.rustStrCaseConvert(receiver, method);
    }

    // The plain-dict source proof reaches overloaded base readers (`safeDict` declares
    // bodiless overload signatures; the implementation in the same class is what runs).

    /** A bodiless overload signature whose class also holds the bodied implementation. */
    baseOverload(declaration: any): boolean {
        // a bodiless top-level `function f<T>(…): T;` overload (generic `omit`) whose bodied implementation follows in the same file
        if (declaration?.kind === SyntaxKind.FunctionDeclaration && declaration.body === undefined && isIdentifier(declaration.name)) {
            const fname = String(declaration.name.text);
            return (declaration.parent?.statements ?? []).some((m: any) => m.kind === SyntaxKind.FunctionDeclaration
                && m.body !== undefined && isIdentifier(m.name) && String(m.name.text) === fname);
        }
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body !== undefined || !isIdentifier(declaration.name)) return false;
        const name = String(declaration.name.text);
        return (declaration.parent?.members ?? []).some((m: any) => m.kind === SyntaxKind.MethodDeclaration
            && m.body !== undefined && isIdentifier(m.name) && String(m.name.text) === name);
    }

    /** `x[a ± b]` on a checker-proven list, each operand a numeric literal, a `Value` loop
     *  counter or a `const n = y.length` local: the key prints as a `Value` number, so the
     *  list arm of `get_value` (Int index, else miss) is spelled natively. */
    listArithIndex(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        const key: any = this.rustSkipWrappers(keyNode);
        if (!this.isProvenListExpression(receiverNode) || key === undefined || !isBinaryExpression(key)
            || (key.operatorToken.kind !== SyntaxKind.MinusToken && key.operatorToken.kind !== SyntaxKind.PlusToken)
            || !this.valueNumberOperand(key.left) || !this.valueNumberOperand(key.right)) return undefined;
        if (this.isWriteBackBindRead(keyNode.parent)) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        if (!keyText || keyText.startsWith('&')) return undefined;
        return `${receiverText}.as_array().and_then(|__arr| match &(${keyText}) { Value::Int(__n) if *__n >= 0 => __arr.get(*__n as usize), _ => None }).cloned().unwrap_or(Value::Null)`;
    }

    valueNumberOperand(node: any): boolean {
        const operand: any = this.rustSkipWrappers(node);
        if (operand === undefined) return false;
        if (isNumericLiteral(operand)) return Number.isInteger(Number(operand.text));
        if (!isIdentifier(operand)) return false;
        if (this.isRustValueIndexKey(operand)) return true;
        if (this.rustParamShadowOf(operand) !== undefined || this.rustStringLocalIdentifierIsTyped(operand)) return false;
        const declaration: any = this.rustDeclarationOfIdentifier(operand);
        if (declaration === undefined || !isVariableDeclaration(declaration) || (declaration.parent?.flags & NodeFlags.Const) === 0) return false;
        const init: any = this.rustSkipWrappers(declaration.initializer);
        return init !== undefined && isPropertyAccessExpression(init) && String(init.name.text) === 'length';
    }

    // `Vec<Value>` locals also admit `x.join("lit")` on a `string[]` (native join of the
    // elements' Display text, as the helper's `stringify_simple` prints `Str`/`Null`) and an
    // object-literal property value no push follows (boxed `Value::from(x.clone())`).
    vecJoinUse(access): boolean {
        const call: any = access.parent;
        if (!isCallExpression(call) || call.expression !== access || String(access.name.text) !== 'join' || call.arguments.length !== 1) return false;
        if (this.rustNativeStringLiteralArg(call.arguments[0]) === undefined) return false;
        const checker: any = this.checkerOrUndefined();
        const type: any = checker?.getTypeAtLocation(access.expression);
        if (type === undefined || !checker.isArrayType(type)) return false;
        return this.primitiveKindOfType(checker.getTypeArguments?.(type)?.[0]) === 'string';
    }

    printVecJoin(node): string | undefined {
        const access: any = node?.expression;
        if (!isPropertyAccessExpression(access) || !isIdentifier(access.expression)
            || this.rustVecLocalDeclarationOf(access.expression) === undefined || !this.vecJoinUse(access)) return undefined;
        const literal = this.rustNativeStringLiteralArg(node.arguments[0]);
        const name = this.printNode(access.expression, 0).trim();
        return `Value::Str(${name}.iter().map(|__v| __v.to_string()).collect::<Vec<String>>().join("${literal}").into())`;
    }

    // `{ 'k': x }` with `x` named once in the statement, outside any loop the declaration is not in,
    // and no `x.push` after it: the clone is the array's final contents, as the aliased box was.
    vecPropertyUse(n): boolean {
        const parent: any = n.parent;
        if (parent?.kind !== SyntaxKind.PropertyAssignment || parent.initializer !== n || this.loopBetween(n)) return false;
        const name = String(n.text);
        let statement: any = parent;
        while (statement !== undefined && !isStatement(statement)) statement = statement.parent;
        if (statement === undefined) return false;
        let count = 0;
        const visit = (m) => { if (m.kind === SyntaxKind.Identifier && m.text === name) count++; m.forEachChild?.(visit); };
        visit(statement);
        if (count !== 1) return false;
        const fn = this.rustEnclosingFunction(n);
        const end = n.getEnd?.() ?? n.end;
        return !(this.rustScopeNameNodes(fn, name) as any[]).some((m) => m.kind === SyntaxKind.Identifier && m !== n
            && (m.getStart?.() ?? m.pos) >= end && isPropertyAccessExpression(m.parent) && m.parent.expression === m
            && String(m.parent.name.text) === 'push');
    }
    // Numeric operand kinds beyond the checker: 'definite' = always Int/Float (never Null),
    // 'number' = Int/Float/Null. Covers `this.sum` of numbers, numeric same-file method returns,
    // locals whose every write is numeric, and flow-narrowed (guarded non-undefined) number identifiers.
    private rustInProgress = new Set<any>();
    private rustAssumed = new Set<any>();

    rustNumericKind(node, depth = 0): string | undefined {
        const inner: any = this.rustStripWrappers(node);
        if (inner === undefined || depth > 8) return undefined;
        if (this.rustInProgress.has(inner)) return this.assumedNumericSelf(inner);
        this.rustInProgress.add(inner);
        try {
            const structural = this.rustStructuralKind(inner, depth);
            if (structural === 'definite') return 'definite';
            if (structural === 'number') return 'number';
            return this.rustOperandKind(inner) === 'number' ? 'number' : undefined;
        } catch (e) {
            return undefined;
        } finally {
            this.rustInProgress.delete(inner);
        }
    }

    rustCombine(kinds: (string | undefined)[]): string | undefined {
        if (kinds.length === 0 || kinds.some((k) => k === undefined)) return undefined;
        return kinds.every((k) => k === 'definite') ? 'definite' : 'number';
    }

    rustStructuralKind(inner: any, depth: number): string | undefined {
        if (inner.kind === SyntaxKind.NumericLiteral) return 'definite';
        if (isPrefixUnaryExpression(inner) && inner.operator === SyntaxKind.MinusToken && inner.operand.kind === SyntaxKind.NumericLiteral) return 'definite';
        if (this.rustIsDefiniteInt(inner)) return 'definite';
        if (isCallExpression(inner) && this.callExpressionName(inner) === 'indexOf') return 'definite';
        if (isBinaryExpression(inner)) {
            const op = inner.operatorToken.kind;
            if (op !== SyntaxKind.PlusToken && op !== SyntaxKind.MinusToken && op !== SyntaxKind.AsteriskToken
                && op !== SyntaxKind.SlashToken && op !== SyntaxKind.PercentToken) return undefined;
            const both = this.rustCombine([ this.rustNumericKind(inner.left, depth + 1), this.rustNumericKind(inner.right, depth + 1) ]);
            // `/` and `%` answer Null for a zero divisor
            return (both === 'definite' && (op === SyntaxKind.SlashToken || op === SyntaxKind.PercentToken)) ? 'number' : both;
        }
        if (isCallExpression(inner)) return this.rustCallKind(inner, depth);
        if (isIdentifier(inner)) return this.rustIdentifierKind(inner, depth);
        return undefined;
    }

    rustCallKind(call: any, depth: number): string | undefined {
        const callee = call.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        if (String(callee.name.text) === 'sum') {
            return this.rustCombine(call.arguments.map((a) => this.rustNumericKind(a, depth + 1)));
        }
        let declaration: any;
        try {
            declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
        } catch (e) {
            return undefined;
        }
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body === undefined
            || declaration.getSourceFile() !== call.getSourceFile()) return undefined;
        const kinds: (string | undefined)[] = [];
        const visit = (n: any) => {
            if (n !== declaration && isFunctionLike(n)) return;
            if (isReturnStatement(n)) kinds.push(n.expression === undefined ? undefined : this.rustNumericKind(n.expression, depth + 1));
            n.forEachChild?.(visit);
        };
        declaration.body.forEachChild(visit);
        return this.rustCombine(kinds) === undefined ? undefined : 'number';
    }

    rustIdentifierKind(ident: any, depth: number): string | undefined {
        if (this.rustParamShadowOf(ident) !== undefined || !this.printsValueExpression(ident)) return undefined;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || declaration.name?.kind !== SyntaxKind.Identifier) return undefined;
        // a guard removed `undefined` from a nullable declaration: the box is Int/Float here
        const here: any = this.typeOfNodeIfAny(ident);
        const declared: any = this.typeOfNodeIfAny(declaration.name);
        if (here !== undefined && declared !== undefined && (here.flags === TypeFlags.Number || here.flags === TypeFlags.NumberLiteral)
            && (declared.flags & TypeFlags.Union) && (typeParts(declared) ?? []).some((t: any) => t.flags & (TypeFlags.Undefined | TypeFlags.Null))
            && !this.rustHasWrites(declaration)) {
            return 'definite';
        }
        // an explicit annotation (`let a: any = 1`) declares a polymorphic box: keep the helper
        if (!isVariableDeclaration(declaration) || declaration.initializer === undefined || declaration.type !== undefined) return undefined;
        // inductive: a write reading the local itself (`r = this.sum (r, n)`) assumes it numeric
        if (this.rustAssumed.has(declaration)) return 'number';
        this.rustAssumed.add(declaration);
        try {
            return this.rustWrittenKind(declaration, depth);
        } finally {
            this.rustAssumed.delete(declaration);
        }
    }

    rustWrittenKind(declaration: any, depth: number): string | undefined {
        const kinds: (string | undefined)[] = [ this.rustNumericKind(declaration.initializer, depth + 1) ];
        const fn = this.rustEnclosingFunction(declaration);
        if (fn === undefined) return undefined;
        const name = String(declaration.name.text);
        for (const m of this.rustScopeNameNodes(fn, name) as any[]) {
            if (m.kind !== SyntaxKind.Identifier || m === declaration.name) continue;
            const parent: any = m.parent;
            if (isBinaryExpression(parent) && parent.left === m && rustIsAssignmentOperator(parent.operatorToken.kind)) {
                const op = parent.operatorToken.kind;
                const right = this.rustNumericKind(parent.right, depth + 1);
                if (op === SyntaxKind.EqualsToken || op === SyntaxKind.PlusEqualsToken || op === SyntaxKind.MinusEqualsToken || op === SyntaxKind.AsteriskEqualsToken) kinds.push(right);
                else if (op === SyntaxKind.SlashEqualsToken || op === SyntaxKind.PercentEqualsToken) kinds.push(right === undefined ? undefined : 'number');
                else kinds.push(undefined);
            } else if ((parent?.kind === SyntaxKind.PrefixUnaryExpression || parent?.kind === SyntaxKind.PostfixUnaryExpression)
                && (parent.operator === SyntaxKind.PlusPlusToken || parent.operator === SyntaxKind.MinusMinusToken)) {
                continue;
            } else if (parent !== undefined && ((isArrayLiteralExpression(parent) && isBinaryExpression(parent.parent) && parent.parent.left === parent)
                || ((isForOfStatement(parent) || isForInStatement(parent)) && parent.initializer === m))) {
                kinds.push(undefined);
            }
        }
        return this.rustCombine(kinds);
    }

    // No assignment / `++` / `--` names the binding: only control-flow guards narrow it.
    rustHasWrites(declaration: any): boolean {
        const fn = isParameterDeclaration(declaration) ? declaration.parent : this.rustEnclosingFunction(declaration);
        if (fn === undefined) return true;
        return (this.rustScopeNameNodes(fn, String(declaration.name.text)) as any[]).some((m) => {
            const parent: any = m.parent;
            if (m.kind !== SyntaxKind.Identifier || m === declaration.name) return false;
            return (isBinaryExpression(parent) && parent.left === m && rustIsAssignmentOperator(parent.operatorToken.kind))
                || parent?.kind === SyntaxKind.PrefixUnaryExpression && (parent.operator === SyntaxKind.PlusPlusToken || parent.operator === SyntaxKind.MinusMinusToken)
                || parent?.kind === SyntaxKind.PostfixUnaryExpression;
        });
    }

    // Both sides Int/Float/Null: `<`/`>` are f64 compares with Null false; `<=`/`>=` also OR in
    // `is_equal` (Null == Null), so they need one never-null side.
    rustOrderedProven(op, left, right): boolean {
        const l = this.rustNumericKind(left);
        const r = this.rustNumericKind(right);
        if (l === undefined || r === undefined) return false;
        return op === SyntaxKind.LessThanToken || op === SyntaxKind.GreaterThanToken || l === 'definite' || r === 'definite';
    }

    // `a - b` / `a * b` / `a / b` / `a % b` on operands proven Int/Float/Null: the helper's dispatch.
    rustNativeArithmetic(op, left, right, leftText: string, rightText: string): string | undefined {
        if (op !== SyntaxKind.MinusToken && op !== SyntaxKind.AsteriskToken && op !== SyntaxKind.SlashToken && op !== SyntaxKind.PercentToken) return undefined;
        if (!this.printsValueExpression(this.rustStripWrappers(left)) || !this.printsValueExpression(this.rustStripWrappers(right))) return undefined;
        if (this.rustNumericKind(left) === undefined || this.rustNumericKind(right) === undefined) return undefined;
        if (op !== SyntaxKind.PercentToken) return this.printNativeNumeric(op, leftText, rightText);
        return `(match (&(${leftText}), &(${rightText})) {` +
            ' (Value::Int(x), Value::Int(y)) if *y != 0 => Value::Int(x % y),' +
            ' (Value::Int(x), Value::Float(y)) if *y != 0.0 => Value::Float(*x as f64 % *y),' +
            ' (Value::Float(x), Value::Int(y)) if *y != 0 => Value::Float(*x % *y as f64),' +
            ' (Value::Float(x), Value::Float(y)) if *y != 0.0 => Value::Float(x % y),' +
            ' _ => Value::Null })';
    }

    // String helpers on proven-`Str` operands. `add(a, b)` with one side always a
    // `Value::Str` takes the helper's `string_concat` arm, which is `Display` for every box but a
    // Precise dict (only `new Precise` locals, typed `Precise`), so the other side may be any non-Precise box.
    alwaysStr(node): boolean {
        const inner: any = this.unwrapParensNode(node);
        if (inner === undefined) return false;
        if (isStringLiteral(inner) || isNoSubstitutionTemplateLiteral(inner)) return true;
        if (isBinaryExpression(inner) && inner.operatorToken.kind === SyntaxKind.PlusToken) return this.alwaysStr(inner.left) || this.alwaysStr(inner.right);
        return isCallExpression(inner) && isPropertyAccessExpression(inner.expression) && inner.expression.name.text === 'toString'
            && (inner.arguments?.length ?? 0) === 0 && this.printsValueExpression(inner.expression.expression);
    }

    concatOperandSafe(node, type): boolean {
        if (this.alwaysStr(node)) return true;
        const inner: any = this.unwrapParensNode(node);
        if (!this.printsValueExpression(inner) || this.rustNativeStrCalleeKind(inner) === 'str') return false;
        // typed `String`/`Vec<Value>` locals print without a `Value` box
        if (isIdentifier(inner) && (this.rustStringLocalIdentifierIsTyped(inner) || this.rustVecLocalDeclarationOf(inner) !== undefined)) return false;
        const parts: any[] = type === undefined ? [] : ((type.flags & TypeFlags.Union) ? (typeParts(type) ?? []) : [type]);
        return parts.length > 0 && parts.every((t) => String(t?.symbol?.escapedName ?? t?.symbol?.name ?? '') !== 'Precise');
    }

    concatIsAnchored(left, right, leftType, rightType): boolean {
        return (this.alwaysStr(left) && this.concatOperandSafe(right, rightType))
            || (this.alwaysStr(right) && this.concatOperandSafe(left, leftType));
    }

    /** Checker-string or proven-`Str` receiver printed as a plain name / parenthesised. */
    strReceiverText(node, receiverText: string): string | undefined {
        return this.rustNativeStringReceiver(node, receiverText) ?? this.rustReceiver(node, receiverText);
    }

    // `x.trim()`: the helper's `Str` arm is `str::trim`, Null otherwise.
    printTrim(node, receiverText: string): string | undefined {
        const receiver = this.strReceiverText(node, receiverText);
        if (receiver === undefined || (node.arguments?.length ?? 0) !== 0) return undefined;
        return `${receiver}.as_str().map(|__s| Value::Str(__s.trim().to_string().into())).unwrap_or(Value::Null)`;
    }

    // `x.startsWith(p)` / `x.endsWith(p)` with a proven/checker string operand: false unless both are `Str`.
    printAffixTest(node, receiverText: string, method: string): string | undefined {
        if (node?.arguments?.length !== 1) return undefined;
        const receiver = this.strReceiverText(node, receiverText);
        const arg = receiver === undefined ? undefined : this.rustStrOperand(node.arguments[0], true);
        if (arg === undefined) return undefined;
        return `${receiver}.as_str().zip(${arg}.as_str()).is_some_and(|(__s, __p)| __s.${method}(__p))`;
    }

    // `x.replace(p, r)` / `x.replaceAll(p, r)`: both helpers replace every occurrence when all three
    // are `Str`, else return the receiver; `p`/`r` are literals or proven/checker string operands.
    printReplace(node, receiverText: string): string | undefined {
        if (node?.arguments?.length !== 2) return undefined;
        const receiver = this.strReceiverText(node, receiverText);
        if (receiver === undefined || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(receiver)) return undefined;
        const operand = (arg) => {
            const literal = this.rustNativeStringLiteralArg(arg);
            return literal !== undefined ? `Value::Str("${literal}".into())` : this.rustStrOperand(arg, true);
        };
        const from = operand(node.arguments[0]);
        const to = operand(node.arguments[1]);
        if (from === undefined || to === undefined) return undefined;
        return `match (${receiver}.as_str(), ${from}.as_str(), ${to}.as_str()) { (Some(__s), Some(__p), Some(__r)) => Value::Str(__s.replace(__p, __r).into()), _ => ${receiver}.clone() }`;
    }

    // Collection helpers on locals whose runtime shape is proven: `"k" in x` on a plain-dict
    // receiver, `Object.keys/values` on one in prediction sources, and `.length` /
    // `.push` on a `Value::Arr`-only local (never a book/cache marker the helpers route).

    /** `"lit" in x` where x is a proven plain local / plain-kept Dict parameter. */
    literalInOp(key, obj): string | undefined {
        if (!isStringLiteral(key) || this.isTestSource(key)) return undefined;
        const recv: any = this.rustStripWrappers(obj);
        if (recv === undefined || !isIdentifier(recv) || this.rustPlainReceiver(recv) === undefined) return undefined;
        const keyLiteral = this.rustStringLiteralOf(this.printStringLiteral(key));
        if (keyLiteral === undefined) return undefined;
        return `Value::Bool(matches!(&${this.printNode(recv, 0).trim()}, Value::Dict(__d) if __d.contains_key(${keyLiteral})))`;
    }

    /** `Object.keys/values(x)` in `ts/src/prediction/<id>.ts` on a proven plain local. */
    predictionEnum(node, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined {
        const arg: any = this.rustStripWrappers(node?.arguments?.[0]);
        if (arg === undefined || parsedArg === undefined || !isIdentifier(arg)
            || !/\/ts\/src\/prediction\/[^/]+\.ts$/.test(this.provenDictFieldPath(node))
            || this.rustPlainReceiver(arg) !== 'local') return undefined;
        const body = kind === 'keys' ? '__m.keys().map(|__k| Value::Str(__k.clone().into())).collect()' : '__m.values().cloned().collect()';
        return `Value::Array(${parsedArg.trim()}.as_map().map(|__m| ${body}).unwrap_or_default())`;
    }

    /** Base-tier array readers whose result is the stored `Value::Arr` or the default argument. */
    private static readonly RUST_LIST_READERS: { [name: string]: number } = { safeList: 2, safeList2: 3, safeListN: 2 };

    /** A source that is a `Value::Arr` or `Value::Null` (both helpers agree with `len()` / a no-op
     *  push there): `[...]`, nullish, a runtime `split`, base `toArray`, or a base `safeList*`
     *  read whose default is absent, nullish or `[...]`. */
    arrSource(node: any, allowNull: boolean): boolean {
        const n: any = this.rustStripWrappers(node);
        if (n === undefined) return false;
        if (this.extraArrSource(n)) return true;
        if (isArrayLiteralExpression(n)) return !n.elements.some((e: any) => e.kind === SyntaxKind.SpreadElement);
        if (n.kind === SyntaxKind.NullKeyword || (isIdentifier(n) && String(n.text) === 'undefined')) return allowNull;
        if (this.rustCallPrintsRuntimeSplit(n)) return true;
        if (!isCallExpression(n) || !isPropertyAccessExpression(n.expression) || n.expression.expression.kind !== SyntaxKind.ThisKeyword) return false;
        const callee = String(n.expression.name.text);
        if (callee === 'toArray') return n.arguments.length === 1 && this.rustCalleeIsBase(n);
        const index = RustTranspiler.RUST_LIST_READERS[callee];
        if (index === undefined || n.arguments.length > index + 1) return false;
        const fallback: any = this.rustStripWrappers(n.arguments[index]);
        const arrDefault = fallback !== undefined && isArrayLiteralExpression(fallback);
        return (arrDefault || (allowNull && (fallback === undefined || fallback.kind === SyntaxKind.NullKeyword
            || (isIdentifier(fallback) && String(fallback.text) === 'undefined')))) && this.rustCalleeIsBase(n);
    }

    /** A local whose every write (declaration included) is an `arrSource`, never captured by
     *  a closure: its `Value` is a plain `Value::Arr` (the runtime never tags an array). */
    arrLocal(ident: any, allowNull: boolean): boolean {
        if (ident === undefined || !isIdentifier(ident) || this.rustParamShadowOf(ident) !== undefined || this.isTestSource(ident)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || !this.arrSource(declaration.initializer, allowNull)) return false;
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined || isSourceFile(scope) || this.rustEnclosingFunction(ident) !== scope) return false;
        const name = String(declaration.name.text);
        const symbol = this.rustSymbolOf(declaration.name);
        if (symbol === undefined) return false;
        for (const n of this.rustScopeNameNodes(scope, name) as any[]) {
            if (n.kind !== SyntaxKind.Identifier || n === declaration.name || this.rustSymbolOf(n) !== symbol) continue;
            if (this.rustEnclosingFunction(n) !== scope) return false;
            let target: any = n;
            while (target.parent !== undefined && (isParenthesizedExpression(target.parent) || isNonNullExpression(target.parent) || isAsExpression(target.parent))) target = target.parent;
            const parent: any = target.parent;
            if (parent === undefined) continue;
            // a dict-literal field aliasing the local feeds ccxt's writeBackAliasedArrayMutations (keys on the helper)
            if (parent.kind === SyntaxKind.ShorthandPropertyAssignment || (parent.kind === SyntaxKind.PropertyAssignment && parent.initializer === target)) return false;
            if (isBinaryExpression(parent) && parent.left === target && rustIsAssignmentOperator(parent.operatorToken.kind)) {
                if (parent.operatorToken.kind !== SyntaxKind.EqualsToken || !this.arrSource(parent.right, allowNull)) return false;
                continue;
            }
            if (parent.kind === SyntaxKind.ArrayLiteralExpression && isBinaryExpression(parent.parent) && parent.parent.left === parent) return false;
            if ((parent.kind === SyntaxKind.PrefixUnaryExpression || parent.kind === SyntaxKind.PostfixUnaryExpression)
                && (parent.operator === SyntaxKind.PlusPlusToken || parent.operator === SyntaxKind.MinusMinusToken)) return false;
        }
        return true;
    }

    /** `x[i]` on an Arr-only local, except the initializer shapes the native get_value
     *  post-pass already retypes to `Vec<Value>`/native reads (it owns those). */
    arrReadLocal(ident: any): boolean {
        if (!this.arrLocal(ident, true)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        const initializer: any = declaration?.initializer;
        if (initializer === undefined) return false;
        return !this.ownedArrayInitializer(initializer);
    }

    private ownedArrayInitializer(initializer: any): boolean {
        if (isArrayLiteralExpression(initializer)) return true;
        if (!isCallExpression(initializer) || !isPropertyAccessExpression(initializer.expression)) return false;
        const callee: any = initializer.expression;
        const member = String(callee.name.text);
        if (member === 'split') return true;
        if (callee.expression.kind === SyntaxKind.ThisKeyword) return /^(?:safeList|arrayConcat)/.test(member);
        if (isIdentifier(callee.expression) && String(callee.expression.text) === 'Object') {
            return member === 'keys' || member === 'values';
        }
        return false;
    }

    /** `x.length` on an Arr-only local: `get_array_length`'s marker arms need a Dict. */
    arrLength(node, receiver: string): string | undefined {
        const recv: any = this.rustStripWrappers(node?.expression);
        if (!this.arrLocal(recv, true)) return undefined;
        return `Value::Int(${receiver}.len() as i64)`;
    }

    /** `x.push(v)` statement on an Arr-only local: `append_to_array`'s cache-push arm needs a Dict. */
    arrPush(node, name: string | undefined, parsedArg: string | undefined): string | undefined {
        const recv: any = node?.expression?.expression;
        // A `Value` local read straight out of a plain `IndexMap` local
        // carries no book-cache handle, so its push is the same guarded `Arc::make_mut`.
        if (name !== undefined && parsedArg !== undefined && this.bearerReadLocal(recv)
            && node?.arguments?.length === 1 && node.arguments[0].kind !== SyntaxKind.SpreadElement
            && node.parent?.kind === SyntaxKind.ExpressionStatement && name.trim() === this.printNode(recv, 0).trim()
            && this.rustVecPushShape(node, String(recv.text))) {
            const bareArg = parsedArg.trim();
            const bareValue = RustTranspiler.cloneIfBareLocal(bareArg);
            return `if let Value::Arr(__a) = &mut ${name} { std::sync::Arc::make_mut(__a).push(${bareValue}); }`;
        }
        if (name === undefined || parsedArg === undefined || node?.arguments?.length !== 1
            || node.arguments[0].kind === SyntaxKind.SpreadElement || node.parent?.kind !== SyntaxKind.ExpressionStatement
            || !this.arrLocal(recv, false) || name.trim() !== this.printNode(recv, 0).trim()) return undefined;
        // the argument is evaluated while `name` is mutably borrowed: it must not read it
        if (!this.rustVecPushShape(node, String(recv.text))) return undefined;
        // A `Value` local read straight out of a plain `IndexMap` local
        // carries no book-cache handle, so its push is the same guarded `Arc::make_mut`.
        const arg = parsedArg.trim();
        // `append_to_array` takes the value by move; ccxt's post-pass cloned a bare local there.
        const value = RustTranspiler.cloneIfBareLocal(arg);
        return `if let Value::Arr(__a) = &mut ${name} { std::sync::Arc::make_mut(__a).push(${value}); }`;
    }

    /** A `Value` local whose single declaration is an element read of a local typed as a
     *  plain `IndexMap<String, Value>`: plain data all the way down, never a book handle. */
    bearerReadLocal(ident: any): boolean {
        if (ident === undefined || !isIdentifier(ident)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        const init: any = this.rustSkipWrappers(declaration?.initializer);
        if (declaration === undefined || !isVariableDeclaration(declaration) || init === undefined) return false;
        if (!isElementAccessExpression(init)) return false;
        let root: any = init;
        while (isElementAccessExpression(root.expression)) root = root.expression;
        const base: any = this.rustStripWrappers(root.expression);
        return base !== undefined && isIdentifier(base) && this.rustDictBearerDeclaration(base) !== undefined;
    }

    // `startsWith/endsWith(..) === true|false` compares the runtime fn's bare bool
    // (is_equal of two Bool boxes is the payload compare); `a + b` on proven numeric kinds is the
    // `add` helper's Int/Float/Null dispatch, the same native match as `-`/`*`.
    boolCallEquality(left, right, op): string | undefined {
        const l: any = this.unwrapParensNode(left);
        const r: any = this.unwrapParensNode(right);
        const isBoolLit = (n: any) => n?.kind === SyntaxKind.TrueKeyword || n?.kind === SyntaxKind.FalseKeyword;
        if (isBoolLit(l) === isBoolLit(r)) return undefined;
        const literal: any = isBoolLit(l) ? l : r;
        const call: any = isBoolLit(l) ? r : l;
        if (!isCallExpression(call) || !isPropertyAccessExpression(call.expression)) return undefined;
        const name = String(call.expression.name.text);
        if ((name !== 'startsWith' && name !== 'endsWith') || call.arguments.length !== 1) return undefined;
        const text = this.printNode(call, 0).trim();
        const fn = name === 'startsWith' ? 'starts_with' : 'ends_with';
        const m = /^Value::Bool\((.*)\)$/s.exec(text);
        if (m === null || !m[1].startsWith(`${fn}(`) || !this.boolCallBalanced(m[1]) || text.includes('\n')) return undefined;
        const equals = op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken;
        return (literal.kind === SyntaxKind.TrueKeyword) === equals ? m[1] : `!${m[1]}`;
    }

    /** `fn(...)` whose first `(` closes at the very end (string literals skipped). */
    boolCallBalanced(text: string): boolean {
        let depth = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '"') { for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++; continue; }
            if (c === '(') depth++;
            else if (c === ')') { depth--; if (depth === 0 && i !== text.length - 1) return false; }
        }
        return depth === 0 && text.endsWith(')');
    }

    nativeNumericAdd(op, left, right, leftText: string, rightText: string): string | undefined {
        if (op !== SyntaxKind.PlusToken) return undefined;
        if (!this.printsValueExpression(this.rustStripWrappers(left)) || !this.printsValueExpression(this.rustStripWrappers(right))) return undefined;
        if (this.rustNumericKind(left) === undefined || this.rustNumericKind(right) === undefined) return undefined;
        return this.printNativeNumeric(op, leftText, rightText);
    }

    // `Object.keys/values` on a proven plain local in the base tier (the
    // helper's ws-tag filter is a no-op on a map built from literals), and native map reads
    // that are the receiver of a non-mutating string method (`currency['id'].toUpperCase ()`).

    /** Base-tier (`ts/src/base/**`) `Object.keys/values(x)` on a proven plain local. */
    baseEnum(node, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined {
        const arg: any = this.rustStripWrappers(node?.arguments?.[0]);
        if (arg === undefined || parsedArg === undefined || !isIdentifier(arg)
            || !RustTranspiler.RUST_BASE_TIER_FILE.test(this.provenDictFieldPath(node))
            || this.rustPlainReceiver(arg) !== 'local') return undefined;
        const body = kind === 'keys' ? '__m.keys().map(|__k| Value::Str(__k.clone().into())).collect()' : '__m.values().cloned().collect()';
        return `Value::Array(${parsedArg.trim()}.as_map().map(|__m| ${body}).unwrap_or_default())`;
    }

    private static readonly RUST_PURE_STRING_METHODS = new Set([ 'toUpperCase', 'toLowerCase', 'trim', 'startsWith', 'endsWith', 'split' ]);

    /** `x['k'].m (…)` with `m` a non-mutating string method on a checker-`string` read: no
     *  ccxt pass rewrites that target (only `.push` / calls of the read itself). */
    pureStringMethodReceiver(node: any): boolean {
        const access: any = node?.parent;
        const call: any = access?.parent;
        if (!isElementAccessExpression(node) || access === undefined || !isPropertyAccessExpression(access) || access.expression !== node
            || call === undefined || !isCallExpression(call) || call.expression !== access
            || !RustTranspiler.RUST_PURE_STRING_METHODS.has(String(access.name.text))) return false;
        const type = this.typeOfNodeIfAny(node);
        return type !== undefined && (type.flags & TypeFlags.StringLike) !== 0;
    }

    /** Locals whose Arr-only proof is in progress (a self-referencing write proves nothing new). */
    private arrVisiting = new Set<any>();

    /** More always-`Value::Arr` sources for the Arr-only proof: base `arrayConcat` (Array on every
     *  arm), base `sortBy`/`sortBy2` of an Arr-only local (returns its input's variant), and a
     *  plain alias of a non-nullable Arr-only local (COW: the push never reaches the alias). */
    extraArrSource(n: any): boolean {
        if (isCallExpression(n) && isPropertyAccessExpression(n.expression) && n.expression.expression.kind === SyntaxKind.ThisKeyword) {
            const callee = String(n.expression.name.text);
            if (callee === 'arrayConcat') return n.arguments.length === 2 && this.rustCalleeIsBase(n);
            if (callee === 'sortBy' || callee === 'sortBy2') {
                const first: any = this.rustStripWrappers(n.arguments[0]);
                return first !== undefined && isIdentifier(first) && this.rustCalleeIsBase(n) && this.arrAlias(first);
            }
            return false;
        }
        return isIdentifier(n) && String(n.text) !== 'undefined' && this.arrAlias(n);
    }

    arrAlias(ident: any): boolean {
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || !isVariableDeclaration(declaration)) return false;
        // the local under proof: its other writes decide
        if (this.arrVisiting.has(declaration)) return true;
        this.arrVisiting.add(declaration);
        try {
            return this.arrLocal(ident, false);
        } finally {
            this.arrVisiting.delete(declaration);
        }
    }

    // A numeric-kind local re-read inside its own write (`p = p + 4`) is the assumed kind.
    assumedNumericSelf(inner: any): string | undefined {
        if (!isIdentifier(inner)) return undefined;
        const declaration: any = this.rustSingleLocalDeclaration(inner);
        return declaration !== undefined && this.rustAssumed.has(declaration) ? 'number' : undefined;
    }

    private strVisiting = new Map<any, boolean>();

    /** Always `Value::Str`: string-helper shapes, a `+` chain with such an operand, or an always-Str local. */
    alwaysStrOperand(node: any): boolean {
        const inner: any = this.unwrapParensNode(node);
        if (inner === undefined) return false;
        if (this.alwaysStr(inner)) return true;
        if (isBinaryExpression(inner) && inner.operatorToken.kind === SyntaxKind.PlusToken) return this.alwaysStrOperand(inner.left) || this.alwaysStrOperand(inner.right);
        return isIdentifier(inner) && this.alwaysStrLocal(inner);
    }

    /** A plain `Value` local, never captured by a closure, whose every write is always-Str (`x += e`
     *  keeps it), or Str|Null (proven-Str source / nullish) when the checker narrows this read to `string`. */
    alwaysStrLocal(ident: any, allowNull = false): boolean {
        if (this.rustParamShadowOf(ident) !== undefined || this.rustStringLocalIdentifierIsTyped(ident) || this.rustVecLocalDeclarationOf(ident) !== undefined) return false;
        const declaration: any = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name) || declaration.initializer === undefined) return false;
        // inductive: a cycle back to a local under proof assumes that proof (strict covers lax)
        if (this.strVisiting.has(declaration)) return allowNull || this.strVisiting.get(declaration) === false;
        const fn = this.rustEnclosingFunction(declaration);
        if (fn === undefined) return false;
        const here: any = this.typeOfNodeIfAny(ident);
        const narrowed = allowNull || (here !== undefined && this.isStringLikeType(here));
        const nullish = (e: any) => { const n: any = this.unwrapParensNode(e); return n?.kind === SyntaxKind.NullKeyword || (isIdentifier(n) && String(n.text) === 'undefined'); };
        const local = (e: any) => { const n: any = this.unwrapParensNode(e); return isIdentifier(n) && (this.rustProvenStrIdentifier(n) || this.alwaysStrLocal(n, true)); };
        const source = (e: any) => this.alwaysStrOperand(e) || (narrowed && (nullish(e) || this.rustProvenStrSource(e) || local(e)));
        this.strVisiting.set(declaration, allowNull);
        try {
            if (!source(declaration.initializer)) return false;
            return this.rustLocalUsesAll(declaration, String(declaration.name.text), true, (n: any) => {
                if (this.rustEnclosingFunction(n) !== fn || this.rustWriteTarget(n)) return false;
                const parent: any = n.parent;
                if ((parent?.kind === SyntaxKind.PrefixUnaryExpression || parent?.kind === SyntaxKind.PostfixUnaryExpression) && parent.operator !== SyntaxKind.ExclamationToken) return false;
                if (!isBinaryExpression(parent) || parent.left !== n || !rustIsAssignmentOperator(parent.operatorToken.kind)) return true;
                const op = parent.operatorToken.kind;
                return op === SyntaxKind.PlusEqualsToken || (op === SyntaxKind.EqualsToken && source(parent.right));
            });
        } finally {
            this.strVisiting.delete(declaration);
        }
    }

    concatAnchor(node: any): boolean {
        const inner: any = this.unwrapParensNode(node);
        return inner !== undefined && this.printsValueExpression(inner) && this.alwaysStrOperand(inner);
    }

    strOrNullConcatIsAnchored(left, right, leftType, rightType): boolean {
        return (this.concatAnchor(left) && this.concatOperandSafe(right, rightType))
            || (this.concatAnchor(right) && this.concatOperandSafe(left, leftType));
    }

    /** `Option<&str>` text of an operand that is always `Value::Str` / `Value::Null`, else undefined. */
    strOrNullOperand(node: any): string | undefined {
        const inner: any = this.rustStripWrappers(node);
        if (inner === undefined) return undefined;
        if (isStringLiteral(inner)) return inner.text in this.StringLiteralReplacements ? undefined : `Some(${this.quotedStringLiteral(inner.text)})`;
        if (isIdentifier(inner) && this.alwaysStrLocal(inner, true)) {
            const text = this.printNode(inner, 0).trim();
            return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? `${text}.as_str()` : undefined;
        }
        const operand = this.rustStrOperand(inner, true);
        return operand === undefined ? undefined : `${operand}.as_str()`;
    }

    // `a < b` (`<=`, `>`, `>=`) on Str|Null operands: the helper's f64 parse of both strings, else
    // `str` order; `<=`/`>=` OR in `is_equal` (string equality, Null == Null).
    strOrderedComparison(node, op, left, right): string | undefined {
        const operator = RustTranspiler.NATIVE_COMPARISON_OPERATORS[op];
        const a = this.strOrNullOperand(left);
        const b = a === undefined ? undefined : this.strOrNullOperand(right);
        if (operator === undefined || b === undefined) return undefined;
        const strict = operator.charAt(0);
        const orEqual = operator.length === 2;
        const order = `(match (__x.parse::<f64>(), __y.parse::<f64>()) { (Ok(__p), Ok(__q)) => __p ${strict} __q, _ => __x ${strict} __y })`;
        const text = `(match (${a}, ${b}) { (Some(__x), Some(__y)) => ${order}${orEqual ? ' || __x == __y' : ''}, ${orEqual ? '(None, None) => true, ' : ''}_ => false })`;
        return this.isBooleanPosition(node) ? text : `Value::Bool(${text})`;
    }

    // The plain-dict sources (`safeDict*(x, k, {})`, same-file builders, `extend|omit`)
    // also hold in the base tier and pro files, where a tagged handle can only arrive through a
    // parameter: base admits typed plain-dict parameters, pro admits no parameter at all.
    rustSourceTier(node: Node): 'rest' | 'base' | 'pro' | undefined {
        const path = this.provenDictFieldPath(node);
        if (RustTranspiler.RUST_REST_FILE.test(path) && /\/ts\/src\/[^/]+\.ts$/.test(path)) return 'rest';
        if (RustTranspiler.RUST_BASE_TIER_FILE.test(path) && !/\/base\/ws\//.test(path)) return 'base';
        if (/\/ts\/src\/pro\/[^/]+\.ts$/.test(path)) return 'pro';
        return undefined;
    }

    plainSourceTier(node: Node): boolean {
        return this.rustSourceTier(node) !== undefined;
    }

    /** A copied/read dict argument outside REST: in pro only `this.options` or a proven plain
     *  local; in base also a parameter annotated with a plain-dict type (no `any` caller handle). */
    tierSourceOk(arg: any): boolean {
        const tier = this.rustSourceTier(arg);
        if (tier === 'rest') return true;
        const node: any = this.rustStripWrappers(arg);
        if (node === undefined || !isIdentifier(node)) return true;
        const declaration: any = this.rustSingleLocalDeclaration(node);
        // pro: a local read source must itself be proven plain (its root may be a handler parameter)
        if (tier === 'pro') return declaration !== undefined && !isParameterDeclaration(declaration) && this.rustPlainReceiver(node) === 'local';
        if (declaration === undefined || !isParameterDeclaration(declaration)) return true;
        if (tier !== 'base' || declaration.type === undefined || declaration.dotDotDotToken !== undefined) return false;
        const type = this.getCheckedTypeOf(declaration.type);
        return type !== undefined && this.isProvenMapType(type) && !this.rustParameterIsClientHandle(declaration);
    }

    /** `this.extend (plain, …unshared)` / `this.omit|keysort (plain, …)` called directly
     *  (not only as a builder's return): the same fresh-copy proof as `rustPlainReturn`. */
    private copyVisiting = new Set<any>();

    freshCopy(node: any, depth: number): boolean {
        const callee = String(node.expression.name.text);
        // the write-history -> plain-source hop restarts `depth`: a copy reached again through its own local proves nothing
        if ((callee !== 'extend' && callee !== 'omit' && callee !== 'keysort') || this.copyVisiting.has(node)) return false;
        this.copyVisiting.add(node);
        try {
            return this.rustPlainReturn(node, depth);
        } finally {
            this.copyVisiting.delete(node);
        }
    }

    // `a - b` / `a * b` / `a / b` and `a < b` (`<=`, `>`, `>=`) on unproven `Value`s print the
    // helper's own dispatch inline (f64 coercion: Int/Float, Str parse, Bool 1/0; `<=`/`>=` OR in
    // `is_equal`); `a + b` on two Str|Null operands (fields of same-file object literals) is `format!`.
    looseF64(binding: string): string {
        return `(match ${binding} { Value::Int(__n) => Some(*__n as f64), Value::Float(__f) => Some(*__f), Value::Str(__s) => __s.parse::<f64>().ok(), Value::Bool(__b) => Some(if *__b { 1.0 } else { 0.0 }), _ => None })`;
    }

    plainValueOperand(node: any): boolean {
        const inner: any = this.rustStripWrappers(node);
        if (inner === undefined || !this.printsValueExpression(inner) || this.rustNativeStrCalleeKind(inner) === 'str') return false;
        if (isIdentifier(inner) && this.rustParamShadowOf(inner) !== undefined) return false;
        return !(isIdentifier(inner) && (this.rustStringLocalIdentifierIsTyped(inner) || this.rustVecLocalDeclarationOf(inner) !== undefined));
    }

    nativeCoercingArithmetic(op, left, right, leftText: string, rightText: string): string | undefined {
        if (op === SyntaxKind.PlusToken) return this.nativeStrOrNullConcat(left, right, leftText, rightText);
        if (op !== SyntaxKind.MinusToken && op !== SyntaxKind.AsteriskToken && op !== SyntaxKind.SlashToken) return undefined;
        if (!this.plainValueOperand(left) || !this.plainValueOperand(right)) return undefined;
        const a = this.rustNumericKind(left) !== undefined ? '__a.as_f64()' : this.looseF64('__a');
        const b = this.rustNumericKind(right) !== undefined ? '__b.as_f64()' : this.looseF64('__b');
        if (op === SyntaxKind.SlashToken) {
            return `(match (&(${leftText}), &(${rightText})) { (__a, __b) => match (${a}, ${b}) { (Some(__x), Some(__y)) if __y != 0.0 => Value::Float(__x / __y), _ => Value::Null } })`;
        }
        const sign = op === SyntaxKind.MinusToken ? '-' : '*';
        return `(match (&(${leftText}), &(${rightText})) { (Value::Int(__x), Value::Int(__y)) => Value::Int(__x ${sign} __y),` +
            ` (__a, __b) => match (${a}, ${b}) { (Some(__x), Some(__y)) => Value::Float(__x ${sign} __y), _ => Value::Null } })`;
    }

    // is_less_than / is_greater_than: f64 order when both coerce, else `str` order of two Str;
    // the `-or_equal` forms OR in is_equal (Null==Null, same-variant payload, Int exact, else f64).
    nativeLooseOrderedComparison(node, op, left, right): string | undefined {
        const operator = RustTranspiler.NATIVE_COMPARISON_OPERATORS[op];
        if (operator === undefined || !this.plainValueOperand(left) || !this.plainValueOperand(right)) return undefined;
        const strict = operator.charAt(0);
        const p = `(${this.looseF64('__a')}, ${this.looseF64('__b')})`;
        const order = `(match ${p} { (Some(__x), Some(__y)) => __x ${strict} __y, _ => matches!((__a, __b), (Value::Str(__x), Value::Str(__y)) if __x ${strict} __y) })`;
        const equal = ` || (match (__a, __b) { (Value::Null, Value::Null) => true, (Value::Bool(__x), Value::Bool(__y)) => __x == __y, (Value::Str(__x), Value::Str(__y)) => __x == __y,` +
            ` (Value::Int(__x), Value::Int(__y)) => __x == __y, (Value::Float(__x), Value::Float(__y)) => __x == __y, _ => matches!(${p}, (Some(__x), Some(__y)) if __x == __y) })`;
        const text = `(match (&(${this.printNode(left, 0)}), &(${this.printNode(right, 0)})) { (__a, __b) => ${order}${operator.length === 2 ? equal : ''} })`;
        return this.isBooleanPosition(node) ? text : `Value::Bool(${text})`;
    }

    // Str+Str / Str+Null take `string_concat` (Display, Null is "null"); Null+Null is Null.
    nativeStrOrNullConcat(left, right, leftText: string, rightText: string): string | undefined {
        if (!this.strOrNull(left, 0) || !this.strOrNull(right, 0)) return undefined;
        return `(match (&(${leftText}), &(${rightText})) { (Value::Null, Value::Null) => Value::Null, (__a, __b) => Value::Str(format!("{}{}", __a, __b).into()) })`;
    }

    strOrNull(node: any, depth: number): boolean {
        const inner: any = this.rustStripWrappers(node);
        if (inner === undefined || depth > 12 || !this.plainValueOperand(inner)) return false;
        if (isStringLiteral(inner) || this.alwaysStrOperand(inner)) return true;
        // `pad_start` / `pad_end` (helper or native form) answer Str or Null
        if (isCallExpression(inner) && isPropertyAccessExpression(inner.expression)
            && (String(inner.expression.name.text) === 'padStart' || String(inner.expression.name.text) === 'padEnd')) return true;
        if (!isElementAccessExpression(inner) || !isStringLiteral(inner.argumentExpression)) return false;
        return this.dictFieldStrOrNull(inner.expression, String(inner.argumentExpression.text), depth + 1);
    }

    /** Every dict `node` can evaluate to holds `key` as Str/Null or lacks it (a read of a missing key / non-dict is Null). */
    dictFieldStrOrNull(node: any, key: string, depth: number): boolean {
        const inner: any = this.rustStripWrappers(node);
        if (inner === undefined || depth > 12) return false;
        if (inner.kind === SyntaxKind.NullKeyword || (isIdentifier(inner) && String(inner.text) === 'undefined')) return true;
        if (isObjectLiteralExpression(inner)) {
            for (const p of inner.properties as any) {
                if (p.kind !== SyntaxKind.PropertyAssignment) return false;
                const name: any = p.name;
                const text = (isStringLiteral(name) || isIdentifier(name)) ? String(name.text) : undefined;
                if (text === undefined) return false;
                if (text === key && !this.strOrNull(p.initializer, depth + 1)) return false;
            }
            return true;
        }
        if (isCallExpression(inner)) return this.methodFieldStrOrNull(inner, key, depth + 1);
        if (!isIdentifier(inner)) return false;
        const declaration: any = this.rustSingleLocalDeclaration(inner);
        if (declaration === undefined || !isVariableDeclaration(declaration) || !isIdentifier(declaration.name)
            || declaration.initializer === undefined || (declaration.parent?.flags & NodeFlags.Const) === 0) return false;
        const fn = this.rustEnclosingFunction(declaration);
        if (fn === undefined) return false;
        // no element write / delete rooted at the local
        for (const m of this.rustScopeNameNodes(fn, String(declaration.name.text)) as any[]) {
            if (m === declaration.name || m.kind !== SyntaxKind.Identifier) continue;
            let top: any = m;
            while (isElementAccessExpression(top.parent) && top.parent.expression === top) top = top.parent;
            if (top === m) continue;
            const parent: any = top.parent;
            if (isDeleteExpression(parent) || (isBinaryExpression(parent) && parent.left === top && rustIsAssignmentOperator(parent.operatorToken.kind))) return false;
        }
        return this.dictFieldStrOrNull(declaration.initializer, key, depth + 1);
    }

    /** `this.m(..)` resolved to a same-file method with a body whose every return holds `key` as Str/Null. */
    methodFieldStrOrNull(call: any, key: string, depth: number): boolean {
        const callee = call.expression;
        if (!isPropertyAccessExpression(callee) || callee.expression.kind !== SyntaxKind.ThisKeyword) return false;
        let declaration: any;
        try {
            declaration = signatureDeclaration((this.getChecker() as any).getResolvedSignature(call));
        } catch (e) {
            return false;
        }
        if (declaration?.kind !== SyntaxKind.MethodDeclaration || declaration.body === undefined
            || declaration.getSourceFile() !== call.getSourceFile() || RustTranspiler.RUST_BASE_TIER_FILE.test(this.provenDictFieldPath(call))) return false;
        let ok = true;
        const visit = (n: any) => {
            if (!ok || (n !== declaration && isFunctionLike(n))) return;
            if (isReturnStatement(n) && n.expression !== undefined && !this.dictFieldStrOrNull(n.expression, key, depth + 1)) ok = false;
            n.forEachChild?.(visit);
        };
        declaration.body.forEachChild(visit);
        return ok;
    }

    // Tuple slot 1 of the base `handle*AndParams` / `handleParam*` helpers is their
    // params argument or an `omit` copy of it: plain when that argument is a plain source.
    private static readonly PARAMS_SLOT_ARG: { [name: string]: number } = {
        handleOptionAndParams: 0, handleOptionAndParams2: 0, handleOptionStringAndParams: 0, handleOptionStringAndParams2: 0,
        handleOptionBoolAndParams: 0, handleOptionBoolAndParams2: 0, handleOptionIntegerAndParams: 0, handleOptionIntegerAndParams2: 0,
        handleParamString: 0, handleParamString2: 0, handleParamInteger: 0, handleParamInteger2: 0, handleParamBool: 0, handleParamBool2: 0,
        handleNetworkCodeAndParams: 0, handleMarginModeAndParams: 1, handleMarketTypeAndParams: 2, handleSubTypeAndParams: 2,
        handleMaxEntriesPerRequestAndParams: 2,
    };

    paramsSlot(rhs: Node, selfName: string | undefined, depth: number): boolean {
        const call: any = this.rustStripWrappers(rhs);
        if (depth > 4 || call === undefined || !isCallExpression(call) || !isPropertyAccessExpression(call.expression)
            || call.expression.expression.kind !== SyntaxKind.ThisKeyword || this.rustSourceTier(call) === undefined) {
            return false;
        }
        const index = RustTranspiler.PARAMS_SLOT_ARG[String(call.expression.name.text)];
        if (index === undefined || !this.rustCalleeIsBase(call)) return false;
        const arg: any = this.rustStripWrappers(call.arguments[index]);
        // an omitted params argument takes the `{}` default
        if (arg === undefined) return call.arguments.length <= index;
        if (this.rustPlainDictLiteral(arg)) return true;
        if (!isIdentifier(arg)) return false;
        if (String(arg.text) === selfName) return true;
        const declaration: any = this.rustSingleLocalDeclaration(arg);
        if (declaration !== undefined && isParameterDeclaration(declaration)) {
            // REST parameters are caller data; base needs a typed non-Client dict; pro rejects
            return this.tierSourceOk(arg) && (this.rustSourceTier(arg) !== 'base' || this.rustParamStaysPlainDict(declaration));
        }
        try {
            return this.rustPlainReceiver(arg) === 'local';
        } catch (e) {
            return false;
        }
    }

    // `slice` / `indexOf` / `toUpperCase` / `toLowerCase` on unproven `Value`s print the
    // runtime helper's own dispatch inline (`runtime.rs` slice/get_index_of/to_upper/to_lower);
    // every operand is evaluated once, in the helper's argument order.
    looseI64(expr: string): string {
        return `(match &(${expr}) { Value::Int(__n) => Some(*__n), Value::Float(__f) => Some(*__f as i64), Value::Str(__s) => __s.parse::<i64>().ok(), Value::Bool(__b) => Some(if *__b { 1 } else { 0 }), _ => None })`;
    }

    // The start bound of a slice: an Int literal is its own i64, a Null literal is 0 (the helper's Int / Null arms).
    looseI64OrZero(expr: string): string {
        const lit = /^Value::Int\((-?[0-9]+)\)$/.exec(expr);
        if (lit !== null && Math.abs(Number(lit[1])) < 2 ** 53) return lit[1].startsWith('-') ? `(${lit[1]}i64)` : `${lit[1]}i64`;
        if (expr === 'Value::Null') return '0i64';
        return `${this.looseI64(expr)}.unwrap_or(0)`;
    }

    looseSliceArm(variant: string, len: string, take: string, empty: string): string {
        const bound = (b: string) => `if ${b} < 0 { (__l + ${b}).max(0) } else { ${b}.min(__l) }`;
        return `(${variant}, __b, __e) => match (${len}) { __l => match (${bound('__b')}, match __e { None => __l, Some(__k) => ${bound('__k')} }) { (__i, __j) => if __i <= __j { ${take} } else { ${empty} } } }`;
    }

    looseSlice(name: string, start: string, end: string): string {
        const str = this.looseSliceArm('Value::Str(__sv)', '__sv.chars().count() as i64',
            'Value::Str(__sv.chars().skip(__i as usize).take((__j - __i) as usize).collect::<String>().into())', 'Value::Str(String::new().into())');
        const arr = this.looseSliceArm('Value::Arr(__a)', '__a.len() as i64',
            'Value::Array(__a[__i as usize..__j as usize].to_vec())', 'Value::Array(vec![])');
        return `(match (&(${name}), ${this.looseI64OrZero(start)}, ${this.looseI64(end)}) { ${str}, ${arr}, _ => Value::Null })`;
    }

    looseIndexOf(name: string, needle: string): string {
        const eq = `match (__it, __nd) { (Value::Null, Value::Null) => true, (Value::Bool(__x), Value::Bool(__y)) => __x == __y, (Value::Str(__x), Value::Str(__y)) => __x == __y, (Value::Int(__x), Value::Int(__y)) => __x == __y, (Value::Float(__x), Value::Float(__y)) => __x == __y, (__p, __q) => match (${this.looseF64('__p')}, ${this.looseF64('__q')}) { (Some(__x), Some(__y)) => __x == __y, _ => false } }`;
        return `(match (&(${name}), &(${needle})) { (Value::Arr(__a), __nd) => Value::Int(__a.iter().position(|__it| ${eq}).map(|__i| __i as i64).unwrap_or(-1)), (Value::Str(__s), Value::Str(__nd)) => Value::Int(__s.find(&**__nd).map(|__i| __i as i64).unwrap_or(-1)), _ => Value::Int(-1) })`;
    }

    looseStrCase(name: string, method: string): string {
        // An unproven operand: the helper's own dispatch inline (a place without literals/newlines reads as `if let`).
        if (!name.includes('"') && !name.includes('\n')) {
            return `(if let Some(__s) = (${name}).as_str() { Value::Str(__s.${method}().into()) } else { Value::Null })`;
        }
        return `(match &(${name}) { Value::Str(__s) => Value::Str(__s.${method}().into()), _ => Value::Null })`;
    }
}
