import { BaseTranspiler } from "./baseTranspiler.js";
import { SyntaxKind, type Block, type CallExpression, type Declaration, type Expression, type Identifier, type Node, type NodeArray, type ParameterDeclaration, type SourceFile, type VariableDeclaration } from "typescript/unstable/ast";
import { isArrayLiteralExpression, isArrowFunction, isAsExpression, isBinaryExpression, isBindingElement, isBlock, isCallExpression, isClassDeclaration, isClassExpression, isConditionalExpression, isDeleteExpression, isElementAccessExpression, isForInStatement, isForOfStatement, isIdentifier, isMethodDeclaration, isNoSubstitutionTemplateLiteral, isNonNullExpression, isNumericLiteral, isObjectLiteralExpression, isParameterDeclaration, isParenthesizedExpression, isPrefixUnaryExpression, isPropertyAccessExpression, isReturnStatement, isShorthandPropertyAssignment, isSourceFile, isStatement, isStringLiteral, isStringLiteralLikeNode, isTypeAssertion, isVariableDeclaration } from "typescript/unstable/ast/is";
import { IndexKind, ObjectFlags, SignatureKind, SymbolFlags, TypeFlags, type Symbol as TsSymbol, type Type } from "typescript/unstable/sync";
import { findAncestor, getAllSuperTypeNodes, isFunctionLike, signatureDeclaration, symbolDeclarations, symbolValueDeclaration, typeParts, typeTarget } from "./tsUtils.js";

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
    /** use census: element-access receiver / kind-preserving mutator / anything else. */
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

/** Shadow kinds: `&IndexMap<String, Value>` / `&Vec<Value>` (D-25). */
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

    constructor(config = {}) {
        config['parser'] = Object.assign({}, parserConfig, config['parser'] ?? {});
        super(config);

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

    // Receiver locals whose element writes may go native (rust-13). `request`
    // is rust-12's family; every other receiver keeps the helper.
    private static readonly RUST_NATIVE_INSERT_RECEIVERS = new Set([
        'result',
        'account',
        'params',
        'fee',
    ]);

    // Scalar book fields the shared order-book store keeps instead of the Dict
    // (value.rs `is_book_meta_key` plus the `cache` replacement write).
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

    /** Operands this unit owns: `safeBool`/`safeBool2`/`safeBoolN` calls (a
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

    // B-26 extends the proof with the printer's own bool-typed sinks: a narrowed `let x: bool = …`
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
        if (this.isValueLengthType(this.typeOfNodeIfAny(node.expression))) return `Value::Int(${receiver}.len() as i64)`;
        return `get_array_length(&${receiver})`;
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
            `.map(|__s| Value::Str(__s.into())).unwrap_or(Value::Null)`;
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
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed) && trimmed !== 'self'
            && trimmed !== 'true' && trimmed !== 'false') {
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

    // Receivers this unit may write natively: any local whose every path builds
    // a plain `Value::Map` (name-independent — rust-13's four names are the
    // batch-A subset of this proof), any parameter the checker proves is a
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

    /** Element-write receiver proof for a local: the batch-A names (rust-13,
     *  `plain: false` — the whitelist is not a construction proof) or, for any
     *  other name, the dict-shape proof plus a plain-`Value::Map` build on
     *  every path (rust-12's proof, read off the checker), or a parameter whose
     *  annotation proves a plain dict and whose writes keep that shape. The
     *  returned flag is the *by-construction* plainness (literal-init locals,
     *  handler tuples, hand-written plain fields) that a book-meta key needs. */
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
            return false; // rust-13 whitelist: not a construction proof
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
        // (`Dict`-style params — the B-25 read family) can admit it.
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
    // a `Market`-style alias — the proof B-25's native reads use) whose every
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
        // `this.handle…(…)` returns its own dict arguments (rust-12's proof).
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
        if (!proven) {
            return undefined;
        }
        return this.printNativeNumericComparison(node, operator, this.printNode(left, 0), this.printNode(right, 0));
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
        if (op === SyntaxKind.PlusToken && this.isNativeStringConcatPair(leftType, rightType)) {
            return this.printNativeStringConcat(leftText, rightText);
        }
        if (!this.isNumberLikeType(leftType) || !this.isNumberLikeType(rightType)) {
            return undefined;
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
            const assignments = left.elements.map((e, idx) => `${this.printNode(e, 0)} = ${nativeList
                ? this.printNativeListIndex(tmpName, idx) : `get_value(&${tmpName}, &Value::Int(${idx}))`}`).join('; ');
            return `{ let ${tmpName} = ${rhs}; ${assignments}; }`;
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
            const nativeInsert = keyStrs.length === 1 ? this.printNativeDictInsert(baseExpr, keys[0], keyStrs[0], rhs) : undefined;
            return nativeInsert ?? `add_element_to_object(${acc}, &${keyStrs[keyStrs.length - 1]}, ${rhs})`;
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
                ?? this.printNativeInOperator(left, right)
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
        return `pad_start(${this.ensureRef(name)}, ${this.ensureRef(parsedArg)}, ${this.ensureRef(parsedArg2)})`;
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return `pad_end(${this.ensureRef(name)}, ${this.ensureRef(parsedArg)}, ${this.ensureRef(parsedArg2)})`;
    }

    printVariableDeclarationList(node, identation) {
        const declaration = node.declarations[0];
        const indent = this.getIden(identation);
        if (declaration?.name.kind === SyntaxKind.ArrayBindingPattern) {
            const parsedElements = declaration.name.elements.map(e => this.printNode(e.name, 0));
            const syntheticName = parsedElements.join('') + 'Variable';
            const head = `${indent}let mut ${syntheticName} = ${this.printNode(declaration.initializer, 0)};\n`;
            const nativeList = this.rustNativeListSource(declaration.initializer);
            const lines = parsedElements.map((e, idx) => `${indent}let mut ${e}: Value = ${nativeList
                ? this.printNativeListIndex(syntheticName, idx) : `get_value(&${syntheticName}, &Value::Int(${idx}))`}`);
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
        const boolValue = this.getRustBoolLocalInitializer(declaration, parsedValue);
        if (boolValue !== undefined) {
            return `${indent}let mut ${varName}: bool = ${boolValue}`;
        }
        const typedStr = this.rustSafeStringLocalIsTyped(declaration);
        const nativeStr = this.rustNativeStrCalleeKind(declaration.initializer) === 'str';
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
        return this.rustLocalUsesAll(declaration, sourceName, false, (n) => this.rustIdentifierUseIsCondition(n));
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
        const decision = this.rustSafeStringLocalIsTypedUncached(declaration);
        this.rustStringLocalDecisions.set(declaration, decision);
        return decision;
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

    /** `Option<String>` → `Value` (exact inverse of the return conversion). */
    rustNativeStrValueBox(text: string): string {
        return `${text}.map(|__s| Value::Str(__s.into())).unwrap_or(Value::Null)`;
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

        // First pass: collect method signatures for optional param handling
        const methods = node.members.filter(m => m.kind === SyntaxKind.MethodDeclaration);
        methods.forEach((method: any) => {
            const requiredCount = method.parameters.filter(p => !p.initializer && !p.questionToken).length;
            if (requiredCount < method.parameters.length) {
                this.methodSignatures[method.name.text] = { requiredCount };
            }
        });

        const struct = this.printStruct(node, identation);
        const newMethod = this.printNewMethod(node, identation);
        const classMethods = methods.map(m => this.printMethodDeclaration(m, identation)).join('\n\n');
        return struct + newMethod + `\nimpl ${this.className} {\n${classMethods}\n}`;
    }

    printMethodDefinition(node, identation) {
        const name = (node.name as any).text;
        const params = node.parameters;
        const requiredParams = params.filter(p => !p.initializer && !p.questionToken);
        let parsedArgs = ['&self', ...requiredParams.map(p => `${this.printNode(p.name, 0)}: Value`)].join(', ');
        if (requiredParams.length < params.length) {
            parsedArgs += ', optional_args: &[Value]';
        }
        const returnType = this.printRustFunctionType(node);
        const retStr = returnType ? ` -> ${returnType}` : '';
        return `${this.getIden(identation + 1)}pub fn ${name}(${parsedArgs})${retStr}`;
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
            return `${this.getIden(identation + 2)}let ${this.printNode(p.name, 0)} = get_arg(optional_args, ${idx}, ${defaultVal});\n`;
        }).join('');

        const blockOpen = this.getBlockOpen(identation);
        const blockClose = this.getBlockClose(identation);
        const shadows = this.rustParamShadowLines(node, identation + 2);
        // D-27: a `handle*` method's `message: Dict` param gets a borrowed
        // `&IndexMap` shadow so its `safe_*` reads print natively.
        const shadowPlan = this.rustProHandlerShadowPlan(node, identation);
        const savedShadowParam = this.rustProHandlerShadowParam;
        if (shadowPlan !== undefined) this.rustProHandlerShadowParam = shadowPlan.param;
        const statements = node.body.statements.map(s => this.printNode(s, identation + 2)).join('\n');
        this.rustProHandlerShadowParam = savedShadowParam;
        const body = blockOpen + optionalInits + shadows + (shadowPlan?.lines ?? '') + statements + blockClose;

        return this.printNodeCommentsIfAny(node, identation, methodDef + body);
    }

    printFunctionDefinition(node, identation) {
        const name = node.name?.text ?? '';
        const params = node.parameters;
        const parsedArgs = params.map(p => `${this.printNode(p.name, 0)}: Value`).join(', ');
        const returnType = this.printRustFunctionType(node);
        const retStr = returnType ? ` -> ${returnType}` : '';
        return `${this.getIden(identation)}fn ${name}(${parsedArgs})${retStr}`;
    }

    printFunctionDeclaration(node, identation) {
        if (isArrowFunction(node)) {
            const parameters = node.parameters.map(p => `${this.printNode(p.name, 0)}: Value`).join(', ');
            const body = this.printNode(node.body);
            return `|${parameters}| ${body}`;
        }
        const funcDef = this.printFunctionDefinition(node, identation);
        const funcBody = super.printFunctionBody(node, identation);
        return this.printNodeCommentsIfAny(node, identation, funcDef + funcBody);
    }

    printOutOfOrderCallExpressionIfAny(node, identation) {
        if (node.expression.kind !== SyntaxKind.PropertyAccessExpression) {
            return undefined;
        }

        const expr = node.expression;
        const args = node.arguments;

        // Handle this.method(...) calls with optional params
        if (expr.expression.kind === SyntaxKind.ThisKeyword) {
            const methodName = expr.name.text;
            const sig = this.methodSignatures[methodName];
            if (sig) {
                const printArgs = (list) => list.map(a => this.printNode(a, 0)).join(', ');
                const requiredArgs = printArgs(args.slice(0, sig.requiredCount));
                const reqPart = requiredArgs ? `${requiredArgs}, ` : '';
                return `self.${methodName}(${reqPart}&[${printArgs(args.slice(sig.requiredCount))}])`;
            }
        }

        return undefined;
    }

    printCallExpression(node, identation) {
        const expression = node.expression;

        // `this.safeString(<shadowed param>, 'k')` — the read inlined against
        // the parameter shadow (D-25). Ahead of the optional-arg dispatch below,
        // which prints the call for any callee with optional parameters
        const shadowSafeRead = this.printShadowSafeReadCall(node);
        if (shadowSafeRead !== undefined) return shadowSafeRead;

        // D-27: `this.safe_*(message, "k")` on a shadowed WS-handler param —
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

        const outOfOrder = this.printOutOfOrderCallExpressionIfAny(node, identation);
        if (outOfOrder) {
            return this.rustBoxNativeStrCallIfNeeded(node, outOfOrder);
        }

        // `parseInt`/`parseFloat` on a checker-proven string: native `str::parse`
        // instead of the runtime helper the ccxt post-pass would emit.
        const nativeParse = this.printNativeParseCall(node);
        if (nativeParse !== undefined) return nativeParse;

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
        if (typeof expression === 'string' && errorClassPattern.test(expression)) {
            const snake = this.rustErrorConstructorName(expression);
            const args = node.arguments.map((a, index) => this.printErrorConstructorArg(snake, index, a, identation)).join(', ');
            return `crate::exchange_errors::${snake}(${args})`;
        }
        // Classes the ccxt post-pass routes to the same constructors — their
        // message argument is audited too; every other `X::new(..)` prints as
        // before.
        const args = typeof expression === 'string'
            ? node.arguments.map((a, index) => this.printErrorConstructorArg(this.rustErrorConstructorName(expression), index, a, identation)).join(', ')
            : node.arguments.map(a => this.printNode(a, identation)).join(', ');
        return `${expression}::new(${args})`;
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

        // Typed field on a checker-proven map local (`x.field`) reads natively;
        // the ccxt post-pass otherwise rewrites it to `get_value(&x, "field")`.
        if (isIdentifier(node.name) && this.isShallowValueReceiver(node.expression) &&
            this.isNativeAccessPositionSafe(node) && !this.isNativeWriteTargetBase(node)) {
            const native = this.printNativeMapAccess(leftExpr, node.expression, String(rightSide));
            if (native) return native;
        }

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
    printNativeListIndex(receiverText: string, index: number): string {
        return `${receiverText}.as_array().and_then(|__arr| __arr.get(${index})).cloned().unwrap_or(Value::Null)`;
    }

    /** Native read for one chain level, or undefined to keep `get_value`. */
    printNativeContainerAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        // A shadowed parameter reads through the borrowed container.
        const shadow = this.rustParamShadowOf(receiverNode);
        if (shadow !== undefined) {
            const native = this.printShadowContainerRead(shadow, keyNode);
            if (native !== undefined) return native;
        }
        if (isStringLiteralLikeNode(keyNode)) {
            return this.printNativeMapAccess(receiverText, receiverNode, keyNode.text);
        }
        if (isNumericLiteral(keyNode)) {
            const index = Number(keyNode.text);
            if (!Number.isInteger(index) || index < 0) return undefined;
            if (!this.isProvenListExpression(receiverNode)) return undefined;
            return this.printNativeListIndex(receiverText, index);
        }
        const dictRead = this.printNativeDynamicMapAccess(receiverText, receiverNode, keyNode);
        if (dictRead !== undefined) return dictRead;
        // A non-literal index (the `for (let i = 0; …)` counter) into a
        // checker-proven list reads natively too.
        return this.printNativeDynamicListIndex(receiverText, receiverNode, keyNode);
    }

    /** `get_value(&X, &i)` for a checker-proven list `X` and a dynamic integer
     *  index local `i`: the runtime's own array branch, spelled natively.
     *  `get_value` reaches its array arm for an `Arr` receiver and its default
     *  (`Value::Null`) otherwise, so the emitted match reproduces both — an
     *  `Int` index by value (a negative or out-of-range index misses), a
     *  numeric string by parse, anything else a miss. */
    printNativeDynamicListIndex(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined {
        if (!this.isProvenListExpression(receiverNode)) return undefined;
        if (!this.isRustValueIndexKey(keyNode)) return undefined;
        // The ccxt `writeBackIndexedMutations` pass matches the `let x = get_value(&C, &K)` text to
        // write a mutated `x` back into `C[K]`; native text is invisible to it, so a bind the next
        // statement mutates keeps the helper.
        if (this.isWriteBackBindRead(keyNode.parent)) return undefined;
        const keyText = this.printNode(keyNode, 0).trim();
        // A text that already carries the post-pass `&` is not a place.
        if (!keyText || keyText.startsWith('&')) return undefined;
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
     *  annotation proves a plain dict (B-25), or any local whose checker type
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
        return `${receiverText}.as_map().and_then(|__m| ${keyText}.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null)`;
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
            const kind: RustParamShadowKind | undefined = this.isProvenMapType(type) ? RUST_PARAM_SHADOWS.MAP :
                this.isProvenShadowListType(type) ? RUST_PARAM_SHADOWS.LIST : undefined;
            if (kind === undefined) continue;
            if (this.rustParameterIsClientHandle(param)) continue;
            if (this.rustParamShadowUseCensus(fn, param, kind) === undefined) continue;
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
    private rustParamShadowUseCensus(fn: Node, param: ParameterDeclaration, kind: RustParamShadowKind): { reads: number } | undefined {
        const name = String((param.name as Identifier).text);
        const paramSymbol = this.rustSymbolOf(param.name as Identifier);
        if (paramSymbol === undefined) return undefined;
        let reads = 0;
        let ok = true;
        const visit = (node: Node) => {
            if (!ok) return;
            if (isIdentifier(node) && node.text === name && node !== param.name) {
                if (this.rustSymbolOf(node) !== paramSymbol || !this.rustParamUseIsRead(node, kind)) {
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
    private rustParamUseIsRead(id: Identifier, kind: RustParamShadowKind): boolean {
        const parent: any = id.parent;
        if (parent === undefined) return false;
        // `x[k]` — element read. Writes (`x[k] = v`, `x[k].push(..)`) and the
        // post-pass write-back binds keep the box.
        if (isElementAccessExpression(parent) && parent.expression === id) {
            if (this.isNativeWriteTargetBase(id)) return false;
            if (!this.isNativeAccessPositionSafe(id)) return false;
            if (this.isWriteBackBindRead(parent)) return false;
            return this.rustShadowKeyIsReadable(parent.argumentExpression, kind);
        }
        // `x.length` — array length read.
        if (isPropertyAccessExpression(parent) && parent.expression === id) {
            return kind === RUST_PARAM_SHADOWS.LIST && String(parent.name.text) === 'length';
        }
        // `'k' in x` / `k in x`.
        if (isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.InKeyword && parent.right === id) {
            if (kind !== RUST_PARAM_SHADOWS.MAP) return false;
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
        return false;
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

    /** `x['k']` / `x[i]` / `'k' in x` on a shadowed parameter: the native read,
     *  or undefined to keep the helper (the census guarantees it never happens
     *  for an emitted shadow). */
    printShadowContainerRead(shadow: RustParamShadow, keyNode: Node): string | undefined {
        const key: any = keyNode;
        if (shadow.kind === RUST_PARAM_SHADOWS.MAP) {
            const k = this.rustShadowMapKey(key);
            if (k === undefined) return undefined;
            return k.literal !== undefined ? `${shadow.name}.get("${k.literal}").cloned().unwrap_or(Value::Null)`
                : `${k.place}.as_str().and_then(|__k| ${shadow.name}.get(__k)).cloned().unwrap_or(Value::Null)`;
        }
        if (isNumericLiteral(key)) {
            const index = Number(key.text);
            if (!Number.isInteger(index) || index < 0) return undefined;
            return `${shadow.name}.get(${index}).cloned().unwrap_or(Value::Null)`;
        }
        return undefined;
    }

    /** `'k' in x` on a shadowed dict parameter. */
    printShadowInOperator(shadow: RustParamShadow, keyNode: Node): string | undefined {
        if (shadow.kind !== RUST_PARAM_SHADOWS.MAP) return undefined;
        const k = this.rustShadowMapKey(keyNode);
        if (k === undefined) return undefined;
        return k.literal !== undefined ? `Value::Bool(${shadow.name}.contains_key("${k.literal}"))`
            : `Value::Bool(${k.place}.as_str().map(|__k| ${shadow.name}.contains_key(__k)).unwrap_or(false))`;
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

    // ── pro-tier WS handler `message` shadow (D-27) ───────────────────────────
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
        // a D-25 parameter shadow already rebinds the name to the borrowed map; its reads are native
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
        const lines =
            `${ind}let ${arc}: std::sync::Arc<${map}> = (match &${name} { Value::Dict(__d) => __d.clone(), _ => std::sync::Arc::new(indexmap::IndexMap::new()) });\n` +
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

    printNativeMapAccess(receiverText: string, receiverNode: Node, keyText: string): string | undefined {
        if (!this.isProvenMapExpression(receiverNode)) {
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

    /** A parameter declared as the ws `Client` class (or a union with it). The
     *  class is the default export of `ts/src/base/ws/Client.ts`, so its type
     *  symbol is named `default`; the declaration itself carries the name. */
    rustParameterIsClientHandle(declaration: ParameterDeclaration): boolean {
        const named = (type: Type | undefined): boolean => {
            if (type === undefined) return false;
            const symbol: any = this.typeSymbolOf(type);
            const declarations: any[] = symbolDeclarations(symbol);
            return declarations.some((d) => {
                if (!isClassDeclaration(d) || d.name === undefined || d.name.text !== 'Client') return false;
                const file = String(d.getSourceFile().fileName).replace(/\\/g, '/');
                return file.endsWith('/ws/Client.ts') || file.endsWith('/ws/Client.d.ts');
            });
        };
        const type = this.getCheckedTypeOf(declaration.name);
        if (named(type)) return true;
        return (typeParts(type) ?? []).some((member: Type) => named(member));
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
    isNativeAccessPositionSafe(node: Node): boolean {
        const parent = node.parent;
        // `x['k'].push(...)` / `x['k'](...)`: the post-pass rewrites the target.
        if (parent && (isPropertyAccessExpression(parent) || isCallExpression(parent)) && parent.expression === node) return false;
        const root = this.rootPlaceText(node);
        for (let current: any = node.parent; current; current = current.parent) {
            if (isStatement(current) || isSourceFile(current) || isFunctionLike(current)) break;
            if (isBinaryExpression(current) && this.isNodeInsideNode(node, current.right)) {
                const op = current.operatorToken.kind;
                const isAssign = op === SyntaxKind.EqualsToken || (op >= SyntaxKind.PlusEqualsToken && op <= SyntaxKind.CaretEqualsToken);
                if (isAssign && root !== undefined && this.rootPlaceText(current.left) === root) return false;
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
        let acc = this.printNode(current, 0);
        for (const { expression: receiver, argumentExpression: key } of chain) {
            const native = nativeAllowed ? this.printNativeContainerAccess(acc, receiver, key) : undefined;
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
        const initStr = node.initializer ? this.printNode(node.initializer, identation + 1) + ';\n' : '';
        const condStr = node.condition ? this.printComparisonInBooleanContext(node.condition, 0).trim() : 'true';
        const incrStr = node.incrementor ? this.printNode(node.incrementor, 0) : '';
        const statements = node.statement.statements.map(s => this.printNode(s, identation + 1)).join('\n');
        const body = `{\n${statements}\n${idn}}`;
        // A C-style `for` becomes a Rust `while`. The increment must run on
        // every iteration *including* one ended by `continue`, so it is folded
        // into the condition (guarded by a first-iteration flag); at the end of
        // the body a `continue` would skip it and spin the loop forever.
        if (incrStr !== '') {
            const flag = `__for_first_${this.forLoopCounter++}`;
            const cond = `{ if !${flag} { ${incrStr}; } ${flag} = false; ${condStr} }`;
            return `${idn}{\n${idn1}${initStr}${idn1}let mut ${flag}: bool = true;\n${idn1}while ${cond} ${body}\n${idn}}`;
        }
        return `${idn}{\n${idn1}${initStr}${idn1}while ${condStr} ${body}\n${idn}}`;
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
        // A call to a hand-written `-> bool` fn is already a Rust bool.
        if (this.rustCallPrintsBool(node)) return idn + this.printNode(node, 0);
        // Checker-proved boolean Value (safe_bool / get_value): native matches!.
        const nativeTruthiness = this.printNativeTruthiness(node);
        if (nativeTruthiness !== undefined) return idn + nativeTruthiness;
        // B-26: an operand whose printer emission is already a Rust `bool`.
        const nativeCondition = this.printNativeParenthesizedCondition(node);
        if (nativeCondition !== undefined && this.rustConditionBoolSlot(node)) return idn + nativeCondition;
        const expression = this.printNode(node, 0);
        const peeled = this.peelValueBoolBox(this.stripOuterParens(expression));
        if (peeled !== undefined && this.rustConditionBoolSlot(node) && !this.printedBoolHelperCall(this.stripOuterParens(peeled))) {
            return `${idn}(${peeled})`;
        }
        return `${idn}is_true(&${this.printTruthyArgument(expression)})`;
    }

    // B-26: `is_true(&(…)` on an operand the printer already emits as a native Rust `bool` (payload
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
        return idn + (this.foldNegateLiteral(operandText) ?? `negate(&${operandText})`);
    }

    printObjectLiteralExpression(node, identation) {
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
        return `Value::Map({\n${idn1}let mut m = std::collections::HashMap::new();\n${body}${idn1}m\n${this.getIden(identation)}})`;
    }

    printArrayLiteralExpression(node, identation) {
        return `Value::from(vec![${node.elements.map(e => this.printNode(e, 0)).join(', ')}])`;
    }

    printDeleteExpression(node, identation) {
        return `remove(&mut ${this.printNode(node.expression.expression, 0)}, &${this.printNode(node.expression.argumentExpression, 0)})`;
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
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed) && trimmed !== 'self' && trimmed !== 'true' && trimmed !== 'false') return `${trimmed}.clone()`;
        return text;
    }

    // Built-in method call overrides
    printArrayIsArrayCall(node, identation, parsedArg = undefined) {
        return `Value::Bool(${this.nativeValuePredicateText('array', node?.arguments?.[0], parsedArg) ?? `is_array(&${parsedArg})`})`;
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        return `object_keys(&${parsedArg})`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        return `object_values(&${parsedArg})`;
    }

    printJsonParseCall(node, identation, parsedArg = undefined) {
        return `json_parse(&${parsedArg})`;
    }

    printJsonStringifyCall(node, identation, parsedArg = undefined) {
        return `json_stringify(&${parsedArg})`;
    }

    printMathFloorCall(node, identation, parsedArg = undefined) {
        return `math_floor(&${parsedArg})`;
    }

    // No `.await` here: `printAwaitExpression` appends it for `await Promise.all(...)`.
    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return `promise_all(&${parsedArg})`;
    }

    // Rust uses postfix `.await`; the base transpiler defaults to prefix.
    printAwaitExpression(node, identation) {
        return `${this.printNode(node.expression, identation)}.await`;
    }

    printMathRoundCall(node, identation, parsedArg = undefined) {
        return `math_round(&${parsedArg})`;
    }

    printMathCeilCall(node, identation, parsedArg = undefined) {
        return `math_ceil(&${parsedArg})`;
    }

    printNumberIsIntegerCall(node, identation, parsedArg = undefined) {
        return `is_integer(&${parsedArg})`;
    }

    printArrayPushCall(node, identation, name = undefined, parsedArg = undefined) {
        return `append_to_array(&mut ${name}, ${parsedArg})`;
    }

    printIncludesCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Value::Bool(contains(&${name}, &${parsedArg}))`;
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        return this.printNativeStringIndexOf(node, name) ?? `get_index_of(&${name}, &${parsedArg})`;
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Value::Bool(starts_with(&${name}, &${parsedArg}))`;
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Value::Bool(ends_with(&${name}, &${parsedArg}))`;
    }

    printTrimCall(node, identation, name = undefined) {
        return `trim(&${name})`;
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        return `join(&${name}, &${parsedArg})`;
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        return `split(&${name}, &${parsedArg})`;
    }

    printConcatCall(node, identation, name = undefined, parsedArg = undefined) {
        return `concat(${name}.clone(), ${parsedArg}.clone())`;
    }

    printToFixedCall(node, identation, name = undefined, parsedArg = undefined) {
        return `to_fixed(&${name}, &${parsedArg})`;
    }

    printToStringCall(node, identation, name = undefined) {
        return `to_string_val(&${name})`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        return `to_upper(&${name})`;
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        return `to_lower(&${name})`;
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
        return this.printNativeStringSlice(node, name) ?? `slice(&${name}, &${parsedArg}, &${parsedArg2 ?? 'Value::Null'})`;
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `replace_str(&${name}, &${parsedArg}, &${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `replace_all_str(&${name}, &${parsedArg}, &${parsedArg2})`;
    }

    // `{}` (Display) renders an ExchangeError as `[Kind] message`; `{:?}` would dump the struct fields.
    printThrowStatement(node, identation) {
        return `${this.getIden(identation)}panic!("{}", ${this.printNode(node.expression, 0)});`;
    }

    printTryStatement(node, identation) {
        const body = (block) => block.statements.map(s => this.printNode(s, identation + 1)).join('\n');
        const rawName = node.catchClause?.variableDeclaration?.name?.text;
        const iden = this.getIden(identation);
        const errorName = rawName ? `_${rawName}` : '_e';
        return `${iden}let _try_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {\n${body(node.tryBlock)}\n${iden}}));\n` +
            `${iden}if let Err(${errorName}) = _try_result {\n${body(node.catchClause.block)}\n${iden}}`;
    }

    printReturnStatement(node, identation) {
        const exp = node.expression;
        const idn = this.getIden(identation);
        if (!exp) return `${idn}return;`;
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
}
