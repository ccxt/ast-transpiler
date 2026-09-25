import { BaseTranspiler } from "./baseTranspiler.js";
import ts from 'typescript';

const SyntaxKind = ts.SyntaxKind;

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
    declaration: ts.VariableDeclaration;
    start: number;
}

/** A `Dict`/`List` parameter whose body uses are all printable reads: the
 *  printer re-binds the same name to a borrowed container at fn entry
 *  (`let x = x.as_map().unwrap_or(&__x_empty);`) so every read is native. */
export interface RustParamShadow {
    kind: RustParamShadowKind;
    /** the parameter name; the shadow re-binds it, the `Value` ABI is untouched. */
    name: string;
    declaration: ts.ParameterDeclaration;
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
function rustIsAssignmentOperator(kind: ts.SyntaxKind): boolean {
    return kind === ts.SyntaxKind.EqualsToken ||
        (kind >= ts.SyntaxKind.PlusEqualsToken && kind <= ts.SyntaxKind.CaretEqualsToken);
}

export class RustTranspiler extends BaseTranspiler {

    binaryExpressionsWrappers;
    methodSignatures: Record<string, { requiredCount: number }>;
    forLoopCounter: number;
    /** The handler `message` parameter a shadow is being printed for (set only
     *  while its method body is printed). */
    rustProHandlerShadowParam: ts.ParameterDeclaration | undefined;

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

    capitalize(str: string) {
        return str[0].toUpperCase() + str.slice(1);
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
        if (text in this.StringLiteralReplacements) {
            return this.StringLiteralReplacements[text];
        }
        // `.into()` borrows the `&'static str` into the `Cow` payload — no alloc.
        return `Value::Str(${this.quotedStringLiteral(text)}.into())`;
    }

    printNumericLiteral(node) {
        const text = node.text;
        // a decimal point or an exponent makes the literal a float
        if (text.includes('.') || /[eE]/.test(text)) {
            return `Value::Float(${text})`;
        }
        return `Value::Int(${text})`;
    }

    printBooleanLiteral(node) {
        if (ts.SyntaxKind.TrueKeyword === node.kind) {
            return 'Value::Bool(true)';
        }
        return 'Value::Bool(false)';
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
        if (type === undefined) {
            return undefined;
        }
        const flags = type.flags;
        if (this.isStringType(flags)) {
            return 'string';
        }
        if (flags === ts.TypeFlags.Number || flags === ts.TypeFlags.NumberLiteral) {
            return 'number';
        }
        if (flags === ts.TypeFlags.Boolean || flags === ts.TypeFlags.BooleanLiteral) {
            return 'boolean';
        }
        if (flags & ts.TypeFlags.Union) {
            let kind = undefined;
            for (const member of type.types ?? []) {
                if (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) {
                    continue;
                }
                const memberKind = this.primitiveKindOfType(member);
                if (memberKind === undefined || (kind !== undefined && kind !== memberKind)) {
                    return undefined;
                }
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
    isBooleanValueType(type: ts.Type | undefined): boolean {
        if (type === undefined) {
            return false;
        }
        if (type.flags & ts.TypeFlags.Union) {
            const members: ts.Type[] = (type as any).types ?? [];
            return members.length > 0 && members.every((member) => this.isBooleanValueType(member));
        }
        return (type.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) !== 0;
    }

    /** `boolean | undefined`: `undefined`/`null` both print `Value::Null` (false
     *  for the helper and for the `matches!` alike), so they may join the union. */
    isBooleanOrUndefinedType(type: ts.Type | undefined): boolean {
        if (type === undefined) {
            return false;
        }
        const members: ts.Type[] = (type.flags & ts.TypeFlags.Union) ? ((type as any).types ?? []) : [type];
        if (members.length === 0) {
            return false;
        }
        const onlyBooleanOrEmpty = members.every((member) =>
            this.isBooleanValueType(member) ||
            (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Null)) !== 0);
        return onlyBooleanOrEmpty && members.some((member) => this.isBooleanValueType(member));
    }

    /** Operands this unit owns: `safeBool`/`safeBool2`/`safeBoolN` calls (a
     *  `Value` in the port) and element accesses (printed as `get_value`). */
    isBooleanValueFamilyOperand(node): boolean {
        const inner = this.unwrapParens(node);
        if (inner === undefined) {
            return false;
        }
        if (ts.isElementAccessExpression(inner)) {
            return true;
        }
        if (ts.isCallExpression(inner)) {
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
        let current: any = node;
        let parent: any = current.parent;
        while (parent !== undefined) {
            if (ts.isParenthesizedExpression(parent)) {
                current = parent;
                parent = parent.parent;
                continue;
            }
            if (parent.kind === SyntaxKind.PrefixUnaryExpression &&
                parent.operator === SyntaxKind.ExclamationToken) {
                current = parent;
                parent = parent.parent;
                continue;
            }
            if (parent.kind === SyntaxKind.BinaryExpression &&
                (parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken ||
                 parent.operatorToken.kind === SyntaxKind.BarBarToken)) {
                current = parent;
                parent = parent.parent;
                continue;
            }
            break;
        }
        return this.isBooleanPosition(current);
    }

    // B-26 extends the proof with the printer's own bool-typed sinks: a narrowed `let x: bool = …`
    // (getRustBoolLocalInitializer) and a logical boxed in `Value::Bool(…)`
    // (printCustomBinaryExpressionIfAny) both demand a `bool`, so their operands may print bare.
    rustConditionBoolSlot(node): boolean {
        if (this.isBareBoolEmissionSafe(node)) {
            return true;
        }
        let current: any = node;
        let parent: any = current.parent;
        while (parent !== undefined) {
            if (ts.isParenthesizedExpression(parent) ||
                (parent.kind === SyntaxKind.PrefixUnaryExpression && parent.operator === SyntaxKind.ExclamationToken) ||
                (parent.kind === SyntaxKind.BinaryExpression &&
                 (parent.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken ||
                  parent.operatorToken.kind === SyntaxKind.BarBarToken))) {
                current = parent;
                parent = parent.parent;
                continue;
            }
            break;
        }
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
        if (declaration === undefined || !ts.isVariableDeclaration(declaration) ||
            declaration.initializer !== current || declaration.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        return this.rustNodeIsBoolExpression(declaration.initializer) &&
            this.rustTypeIsBoolean(declaration.initializer) &&
            this.rustLocalUsesAcceptBool(declaration, String(declaration.name.escapedText));
    }

    /** Native truthiness text of the operand, or undefined to keep `is_true`. */
    printNativeTruthiness(node): string | undefined {
        if (!this.isBooleanValueFamilyOperand(node)) {
            return undefined;
        }
        if (!this.printsValueExpression(node)) {
            return undefined;
        }
        if (!this.isBooleanOrUndefinedType(this.typeOfNodeIfAny(node))) {
            return undefined;
        }
        if (!this.isBareBoolEmissionSafe(node)) {
            return undefined;
        }
        return `matches!(${this.printNode(node, 0)}, Value::Bool(true))`;
    }

    // Kind of a literal operand whose printed Value variant is exactly known.
    literalKindOfNode(node): string {
        if (node === undefined) {
            return undefined;
        }
        switch (node.kind) {
        case SyntaxKind.StringLiteral: return 'string';
        case SyntaxKind.NumericLiteral: return 'number';
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword: return 'boolean';
        case SyntaxKind.NullKeyword: return 'null';
        case SyntaxKind.Identifier: return node.escapedText === 'undefined' ? 'null' : undefined;
        }
        return undefined;
    }

    // Does printNode() render `node` as a Rust `Value` (and not a bare bool)?
    printsValueExpression(node): boolean {
        if (node === undefined) {
            return false;
        }
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
        if (ts.isIdentifier(expression)) {
            return expression.escapedText as string;
        }
        if (ts.isPropertyAccessExpression(expression)) {
            return expression.name.escapedText as string;
        }
        return '';
    }

    // Does a string (literal text or literal-type value) parse as a number?
    // is_equal() coerces those against numeric/bool operands, a plain string
    // compare does not.
    textCoercesToNumber(text: string): boolean {
        if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) {
            return true;
        }
        return /^[+-]?(inf|infinity|nan)$/i.test(text);
    }

    stringLiteralCoercesToNumber(node): boolean {
        return this.textCoercesToNumber(node.text);
    }

    // f64 literal text for a numeric literal; undefined when it is not a Rust
    // decimal/float literal (hex/octal/binary fall back to the helper).
    numericLiteralF64Text(node): string {
        const text = node.text;
        if (text.startsWith('0x') || text.startsWith('0o') || text.startsWith('0b')) {
            return undefined;
        }
        if (text.startsWith('.')) {
            return `0${text}`;
        }
        if (text.includes('.') || text.includes('e') || text.includes('E')) {
            return text;
        }
        return `${text}.0`;
    }

    // The printer's own proof that a plain read prints as a Rust `Value`: `this.<field>` (every
    // declared field is `Value`) or an identifier bound to a local/param (a local is narrowed to
    // `bool` only when every use is a condition sink — never an is_equal argument).
    rustReadPrintsValue(node): boolean {
        if (node === undefined) {
            return false;
        }
        if (node.kind === SyntaxKind.PropertyAccessExpression && node.expression.kind === SyntaxKind.ThisKeyword) {
            return true;
        }
        if (node.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const symbol: any = this.getChecker().getSymbolAtLocation(node);
        const declarations: any[] = symbol?.declarations ?? [];
        if (declarations.length === 0) {
            return false;
        }
        return declarations.every((declaration) => ts.isParameter(declaration)
            || (ts.isVariableDeclaration(declaration)
                && declaration.initializer?.kind !== SyntaxKind.NewExpression));
    }

    // Can the checked type only hold a Bool, Null/undefined or a non-numeric
    // string? Then `x.as_bool() == Some(b)` answers exactly what is_equal(x, b)
    // does: its f64 fallback (Str parse / Bool→0|1) can never fire.
    rustBooleanComparableType(type): boolean {
        if (type === undefined) {
            return false;
        }
        if (type.flags & ts.TypeFlags.Union) {
            const members: any[] = (type as any).types ?? [];
            return members.length > 0 && members.every((member) => this.rustBooleanComparableType(member));
        }
        if (type.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
            return true;
        }
        if (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) {
            return true;
        }
        if (type.flags & ts.TypeFlags.StringLiteral) {
            return !this.textCoercesToNumber(String((type as any).value ?? ''));
        }
        return false;
    }

    // Native `==`/`!=` on the unwrapped payload when the checker proves the
    // Value variants line up; undefined keeps the is_equal() helper.
    printNativeEqualityComparison(left, right, op): string {
        const operator = (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken) ? '==' : '!=';
        const leftLiteral = this.literalKindOfNode(left);
        const rightLiteral = this.literalKindOfNode(right);
        if (leftLiteral !== undefined && rightLiteral !== undefined) {
            return undefined;
        }
        if (leftLiteral !== undefined || rightLiteral !== undefined) {
            const literal = leftLiteral !== undefined ? left : right;
            const literalKind = leftLiteral ?? rightLiteral;
            const other = leftLiteral !== undefined ? right : left;
            if (!this.printsValueExpression(other) && (literalKind !== 'null' || !this.rustReadPrintsValue(other))) {
                return undefined;
            }
            const otherType = this.getChecker().getTypeAtLocation(other);
            const otherKind = this.primitiveKindOfType(otherType);
            const typedStringLocal = this.rustStringLocalIdentifierIsTyped(other);
            if (literalKind === 'null') {
                // Exact for every runtime value: is_equal(x, null) is true only
                // when x is Null, and the derived PartialEq says the same.
                if (typedStringLocal) {
                    return `${this.printNode(other, 0)}.${operator === '==' ? 'is_none' : 'is_some'}()`;
                }
                return `${this.printNode(other, 0)} ${operator} Value::Null`;
            }
            if (literalKind === 'string') {
                if (literal.text in this.StringLiteralReplacements) {
                    return undefined;
                }
                if (this.stringLiteralCoercesToNumber(literal) && otherKind !== 'string') {
                    return undefined;
                }
                const accessor = typedStringLocal ? 'as_deref' : 'as_str';
                return `${this.printNode(other, 0)}.${accessor}() ${operator} Some(${this.quotedStringLiteral(literal.text)})`;
            }
            if (literalKind === 'number') {
                if (otherKind !== 'number') {
                    return undefined;
                }
                const text = this.numericLiteralF64Text(literal);
                if (text === undefined) {
                    return undefined;
                }
                return `${this.printNode(other, 0)}.as_f64() ${operator} Some(${text})`;
            }
            if (literalKind === 'boolean') {
                if (otherKind !== 'boolean' && !this.rustBooleanComparableType(otherType)) {
                    return undefined;
                }
                const value = literal.kind === SyntaxKind.TrueKeyword ? 'true' : 'false';
                return `${this.printNode(other, 0)}.as_bool() ${operator} Some(${value})`;
            }
            return undefined;
        }
        if (!this.printsValueExpression(left) || !this.printsValueExpression(right)) {
            return undefined;
        }
        const leftKind = this.primitiveKindOfType(this.getChecker().getTypeAtLocation(left));
        const rightKind = this.primitiveKindOfType(this.getChecker().getTypeAtLocation(right));
        if (leftKind === undefined || leftKind !== rightKind) {
            return undefined;
        }
        const accessor = RustTranspiler.PAYLOAD_ACCESSORS[leftKind];
        return `${this.printNode(left, 0)}.${accessor}() ${operator} ${this.printNode(right, 0)}.${accessor}()`;
    }

    // ── checker-typed helper elimination ─────────────────────────────────
    // Each predicate proves a static TS shape for which the native Rust form
    // is exactly what the runtime helper computes; only then is the helper
    // call dropped, anything unproven keeps the helper.

    typeOfNodeIfAny(node: ts.Node): ts.Type | undefined {
        // A transpile without a program/checker (bare snippet) has no types.
        return this.checkerOrUndefined()?.getTypeAtLocation(node);
    }

    // Arrays/tuples/strings: `.length` is exactly what `Value::len()` returns.
    // Other shapes (Dict) keep the helper — ArrayCache / OrderBookSide markers
    // hold their length in the marker dict, which get_array_length unwraps.
    isValueLengthType(type: ts.Type | undefined): boolean {
        if (type === undefined) {
            return false;
        }
        if (type.flags & ts.TypeFlags.Union) {
            const parts: ts.Type[] = (type as any).types ?? [];
            return parts.length > 0 && parts.every((part) => this.isValueLengthType(part));
        }
        // A `null`/`undefined` member boxes as `Value::Null`, whose `len()` is
        // the same number the helper's fallthrough returns for it.
        return (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) !== 0
            || this.getChecker().isArrayType(type)
            || this.getChecker().isTupleType(type)
            || this.isStringType(type.flags);
    }

    printArrayLength(node, identation, leftExpr = undefined) {
        const receiver = leftExpr ?? this.printNode(node.expression, 0);
        if (this.isValueLengthType(this.typeOfNodeIfAny(node.expression))) {
            return `Value::Int(${receiver}.len() as i64)`;
        }
        return `get_array_length(&${receiver})`;
    }

    // Native string search / slicing: `x.indexOf(y)` and `x.slice(a, b)` on a checker-proven
    // string receiver print native `str` code. The receiver is a `Value`, so the payload is reached
    // via `as_str()`; a `Value::Null` receiver takes the helper's `-1` / `Value::Null` branch.

    /** Literal integer bound of a `slice` call (`3`, `-64`), else undefined. */
    rustSliceLiteralBound(node): number | undefined {
        if (node === undefined) {
            return undefined;
        }
        if (ts.isNumericLiteral(node)) {
            const value = Number(node.text);
            return Number.isSafeInteger(value) ? value : undefined;
        }
        if (ts.isPrefixUnaryExpression(node) && node.operator === SyntaxKind.MinusToken &&
            ts.isNumericLiteral(node.operand)) {
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
        if (node === undefined || !ts.isCallExpression(node) ||
            !ts.isPropertyAccessExpression(node.expression) || node.arguments?.length !== 1) {
            return undefined;
        }
        if (this.primitiveKindOfType(this.typeOfNodeIfAny(node.expression.expression)) !== 'string') {
            return undefined;
        }
        const needle = node.arguments[0];
        if (!ts.isStringLiteral(needle) && !ts.isNoSubstitutionTemplateLiteral(needle)) {
            return undefined;
        }
        if (typeof receiverText !== 'string' || receiverText.includes('\n')) {
            return undefined;
        }
        const literal = this.escapeRustStringLiteral(needle.text);
        return `Value::Int(${receiverText}.as_str().and_then(|__s| __s.find("${literal}")).map(|__i| __i as i64).unwrap_or(-1))`;
    }

    // `x.slice(a)` / `x.slice(a, b)` with literal bounds on a proven string
    // receiver: the helper's char-vector clamps are inlined, so the emission
    // returns the same string (and `Value::Null` for a null receiver).
    printNativeStringSlice(node, receiverText: string): string | undefined {
        if (node === undefined || !ts.isCallExpression(node) ||
            !ts.isPropertyAccessExpression(node.expression)) {
            return undefined;
        }
        const args = node.arguments ?? [];
        if (args.length === 0 || args.length > 2) {
            return undefined;
        }
        if (this.primitiveKindOfType(this.typeOfNodeIfAny(node.expression.expression)) !== 'string') {
            return undefined;
        }
        if (typeof receiverText !== 'string' || receiverText.includes('\n')) {
            return undefined;
        }
        const start = this.rustSliceLiteralBound(args[0]);
        if (start === undefined) {
            return undefined;
        }
        let end = '__l';
        if (args[1] !== undefined && args[1].kind !== SyntaxKind.NullKeyword && args[1].kind !== SyntaxKind.UndefinedKeyword) {
            const bound = this.rustSliceLiteralBound(args[1]);
            if (bound === undefined) {
                return undefined;
            }
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
        const symbol = (this.getChecker() as any).getSymbolAtLocation(node);
        const declarations = symbol?.declarations ?? [];
        if (declarations.length === 0) {
            return false;
        }
        return declarations.every((declaration) => ts.isVariableDeclaration(declaration)
            || ts.isParameter(declaration)
            || ts.isBindingElement(declaration));
    }

    // A declared `Value` place: a local/param identifier, or a field/element
    // access rooted at `this` or at such an identifier. Those are the operands
    // whose printed text the helper already borrows as a `Value`.
    isDeclaredValuePlace(node): boolean {
        const inner = this.unwrapParens(node);
        if (inner === undefined) {
            return false;
        }
        if (ts.isIdentifier(inner)) {
            return this.isDeclaredValueIdentifier(inner);
        }
        if (ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner)) {
            const root = this.unwrapParens(this.valuePlaceRoot(inner));
            return root !== undefined &&
                (root.kind === SyntaxKind.ThisKeyword || this.isDeclaredValueIdentifier(root));
        }
        return false;
    }

    valuePlaceRoot(node): any {
        let current: any = node;
        while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
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
    isDictShapedType(type: ts.Type | undefined): boolean {
        if (type === undefined) {
            return false;
        }
        if (type.flags & ts.TypeFlags.Union) {
            // `Market | undefined` style aliases: a nullish member carries no
            // value, so only the value-carrying members have to be dict-shaped.
            // `in_op` and the native insert both answer false / no-op on Null.
            const parts: ts.Type[] = (type as any).types ?? [];
            const valueParts = parts.filter((part) => !this.rustTypeIsNullish(part));
            return parts.length > valueParts.length && valueParts.length > 0
                && valueParts.every((part) => this.isDictShapedType(part));
        }
        if (!(type.flags & ts.TypeFlags.Object)) {
            return false;
        }
        const checker = this.getChecker();
        if (checker.isArrayType(type) || checker.isTupleType(type) || checker.isArrayLikeType(type)) {
            return false;
        }
        if (type.getCallSignatures().length !== 0) {
            return false;
        }
        return !this.isClassInstanceType(type) && !this.isLibDeclaredType(type);
    }

    // `"key" in obj` → `matches!(&obj, Value::Dict(__d) if __d.contains_key("key"))`
    // In the TS AST `key` is the left operand and `obj` the right one.
    printNativeInOperator(key, obj) {
        if (!this.isDictShapedType(this.typeOfNodeIfAny(obj))) {
            return undefined;
        }
        if (!ts.isStringLiteral(key)) {
            return this.printNativeInOperatorDynamicKey(key, obj);
        }
        const printedKey = this.printStringLiteral(key);
        const keyLiteral = this.rustStringLiteralOf(printedKey);
        if (keyLiteral === undefined) {
            return undefined;
        }
        const objExpr = this.printNode(obj, 0);
        return `Value::Bool(matches!(&${objExpr}, Value::Dict(__d) if __d.contains_key(${keyLiteral})))`;
    }

    // `k in obj` with a checker-proven string `k` (a plain identifier) →
    // `matches!((&obj, &k), (Value::Dict(__d), Value::Str(__k)) if __d.contains_key(__k.as_ref()))`
    // — `in_op`'s own Dict/Str arm; a Null key or non-Dict receiver answers false in both.
    printNativeInOperatorDynamicKey(key, obj) {
        if (!ts.isIdentifier(key) || String(key.escapedText) === 'undefined') {
            return undefined;
        }
        if (!this.rustKeyIsProvenString(key) || !this.printsValueExpression(obj)) {
            return undefined;
        }
        // A retyped `Option<String>` local is no `Value::Str`; the key must stay a boxed place.
        const declaration: any = this.rustDeclarationOfIdentifier(key);
        if (declaration === undefined || !this.isDeclaredValueIdentifier(key)) {
            return undefined;
        }
        if (ts.isVariableDeclaration(declaration) && this.rustSafeStringLocalIsTyped(declaration)) {
            return undefined;
        }
        const keyText = this.printNode(key, 0).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyText)) {
            return undefined;
        }
        const objExpr = this.printNode(obj, 0);
        return `Value::Bool(matches!((&${objExpr}, &${keyText}), (Value::Dict(__d), Value::Str(__k)) if __d.contains_key(__k.as_ref())))`;
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
        if (receiver === undefined) {
            return undefined;
        }
        if (!this.rustReceiverStaysDict(baseExpr, receiver)) {
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
        let value = valueText;
        if (this.rustPrintedBoolArg(value)) {
            value = `Value::Bool(${value})`;
        }
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
        if (ts.isStringLiteral(keyNode)) {
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
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            return undefined;
        }
        if (receiver.isField ? key.includes('self') : new RegExp(`\\b${receiver.text}\\b`).test(key)) {
            return undefined;
        }
        return `crate::runtime::stringify_param(&${key})`;
    }

    // Receivers this unit may write natively: any local whose every path builds
    // a plain `Value::Map` (name-independent — rust-13's four names are the
    // batch-A subset of this proof), any parameter the checker proves is a
    rustNativeInsertReceiver(expr): { text: string, isField: boolean, plain: boolean, nameNode: any } | undefined {
        if (ts.isIdentifier(expr)) {
            const plain = this.rustInsertIdentifierReceiver(expr);
            if (plain !== undefined) {
                return { text: expr.text, isField: false, plain, nameNode: expr };
            }
            return undefined;
        }
        if (ts.isPropertyAccessExpression(expr) && expr.expression.kind === SyntaxKind.ThisKeyword
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
        if (declaration !== undefined && ts.isParameter(declaration as any)) {
            // A default value (`params: Dict = {}`) keeps the pre-unit
            // initializer proof — `rustReceiverStaysDict` runs both it and the
            // annotation proof and rejects the site when neither holds.
            const admitted = this.rustParamStaysPlainDict(declaration as ts.ParameterDeclaration)
                || (declaration as ts.ParameterDeclaration).initializer !== undefined;
            if (admitted) {
                return false;
            }
        } else if (declaration !== undefined && ts.isVariableDeclaration(declaration as any)) {
            if (this.rustInsertReceiverBuildsPlainDict(declaration as ts.VariableDeclaration)) {
                return true;
            }
            // A local the declared-Dict table proves holds a Dict at every use
            // (alwaysDict && stable): the helper's non-dict branches are dead,
            // so only the tag hooks and the insert remain — the key rules of
            if (this.rustDeclaredLocalEntry(ident) !== undefined
                && this.rustDeclaredInitIsTagFree(declaration as ts.VariableDeclaration)) {
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
    rustDeclaredInitIsTagFree(declaration: ts.VariableDeclaration): boolean {
        let init: any = declaration.initializer;
        while (init !== undefined
            && (ts.isParenthesizedExpression(init) || ts.isNonNullExpression(init) || ts.isAsExpression(init))) {
            init = init.expression;
        }
        if (init === undefined || !ts.isObjectLiteralExpression(init)) {
            return true;
        }
        return this.rustPlainDictLiteral(init);
    }

    /** The local's single declaration is initialised from a call that reads
     *  `x.hashmap` / `x.subscriptions` / `x.futures` — element dicts the runtime
     *  tags with a backref so writes reach the shared store, not the COW copy. */
    rustLocalInitReadsTaggedContainer(ident: ts.Identifier): boolean {
        const declaration = this.rustSingleLocalDeclaration(ident);
        if (declaration === undefined || !ts.isVariableDeclaration(declaration)) {
            return false;
        }
        let init: any = declaration.initializer;
        while (init !== undefined && (ts.isParenthesizedExpression(init) || ts.isNonNullExpression(init) || ts.isAsExpression(init))) {
            init = init.expression;
        }
        if (init === undefined || !ts.isCallExpression(init)) {
            return false;
        }
        return init.arguments.some((arg) => {
            let n: any = arg;
            while (n !== undefined && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n))) {
                n = n.expression;
            }
            return n !== undefined && ts.isPropertyAccessExpression(n)
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
    rustInsertReceiverBuildsPlainDict(declaration: ts.VariableDeclaration): boolean {
        const name = String((declaration.name as ts.Identifier).escapedText);
        if (!this.rustPlainDictLiteral(declaration.initializer)) {
            return false;
        }
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined) {
            return false;
        }
        const declarationSymbol = this.rustSymbolOf(declaration.name as ts.Identifier);
        let plain = true;
        const visit = (n) => {
            if (!plain || !ts.isBinaryExpression(n) || n.operatorToken.kind !== SyntaxKind.EqualsToken) {
                ts.forEachChild(n, visit);
                return;
            }
            const left: any = n.left;
            if (ts.isIdentifier(left) && String(left.escapedText) === name
                && (declarationSymbol === undefined || this.rustSymbolOf(left) === declarationSymbol)) {
                if (!this.rustPlainDictLiteral(n.right) && !this.rustTypeIsUndefinedish(n.right)) {
                    plain = false;
                }
            } else if (ts.isArrayLiteralExpression(left)
                && left.elements.some((e) => ts.isIdentifier(e) && String(e.escapedText) === name)) {
                if (!this.rustHandlerTupleCall(n.right)) {
                    plain = false;
                }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return plain;
    }

    /** An object literal with no runtime tag key — the transpiler built it, so
     *  it is a fresh plain `Value::Map` on every path. */
    rustPlainDictLiteral(node: ts.Node | undefined): boolean {
        if (node === undefined) {
            return false;
        }
        if (ts.isParenthesizedExpression(node)) {
            return this.rustPlainDictLiteral(node.expression);
        }
        if (!ts.isObjectLiteralExpression(node)) {
            return false;
        }
        return node.properties.every((property: any) => {
            const key = property.name;
            if (key === undefined) {
                return false;
            }
            const text = ts.isStringLiteral(key) ? key.text
                : (ts.isIdentifier(key) ? String(key.escapedText) : undefined);
            return text === undefined || !text.startsWith('__');
        });
    }

    /** `this.handle…(…)` — the hand-written `handle*AndParams` / `handleUntil…`
     *  family; each returns its own request/params dict arguments. */
    rustHandlerTupleCall(node: ts.Node | undefined): boolean {
        if (node === undefined || !ts.isCallExpression(node)) {
            return false;
        }
        const callee: any = node.expression;
        return ts.isPropertyAccessExpression(callee) && callee.expression.kind === SyntaxKind.ThisKeyword
            && callee.name?.kind === SyntaxKind.Identifier && /^handle[A-Z]/.test(callee.name.text);
    }

    /** A `null`/`undefined` write leaves the receiver a non-dict, which the
     *  emitted `if let Value::Dict` no-ops exactly like the helper. */
    private rustTypeIsUndefinedish(node: ts.Node): boolean {
        if (node.kind === SyntaxKind.NullKeyword || (ts.isIdentifier(node) && node.text === 'undefined')) {
            return true;
        }
        const type = this.typeOfNodeIfAny(node);
        if (type === undefined) {
            return false;
        }
        const mask = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;
        return (type.flags & mask) !== 0;
    }

    /** The single variable declaration a local identifier binds to, or
     *  undefined when the checker cannot answer / the binding is not a local. */
    rustSingleLocalDeclaration(ident: ts.Identifier): ts.VariableDeclaration | ts.ParameterDeclaration | undefined {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const declarations = checker.getSymbolAtLocation(ident)?.declarations ?? [];
        if (declarations.length !== 1) {
            return undefined;
        }
        const declaration: any = declarations[0];
        if (!ts.isVariableDeclaration(declaration) && !ts.isParameter(declaration)) {
            return undefined;
        }
        return declaration;
    }

    // Dict-shape proof for a write receiver: an object type with no class, array or callable shape
    // — `Dictionary<T>` instantiations count (they resolve to their interface target). A union keeps
    // the proof when every member is a Dict or `undefined` (both untaggable at runtime).
    rustWriteDictShape(type): boolean {
        if (type === undefined) {
            return false;
        }
        if (type.flags & ts.TypeFlags.Union) {
            const parts: any[] = (type as any).types ?? [];
            return parts.length > 0 && parts.every((part) => this.rustWriteDictShape(part));
        }
        if (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
            return true;
        }
        if (!(type.flags & ts.TypeFlags.Object)) {
            return false;
        }
        const checker = this.getChecker();
        if (checker.isArrayType(type) || checker.isTupleType(type) || checker.isArrayLikeType(type)) {
            return false;
        }
        const target: any = (type as any).target ?? type;
        if (target.objectFlags & ts.ObjectFlags.Class) {
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
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const declarations = checker.getSymbolAtLocation(ident)?.declarations ?? [];
        if (declarations.length !== 1) {
            return false;
        }
        const declaration: any = declarations[0];
        if (!ts.isVariableDeclaration(declaration) && !ts.isParameter(declaration)) {
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
        if (ts.isParameter(declaration) && this.rustParamStaysPlainDict(declaration)) {
            return true;
        }
        const name = ident.text;
        const initializer = declaration.initializer;
        if (initializer === undefined || ts.isElementAccessExpression(initializer)
            || declaration.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined) {
            return false;
        }
        let safe = this.rustWriteDictShape(this.typeOfNodeIfAny(ident))
            && this.rustWriteDictShape(this.typeOfNodeIfAny(initializer));
        const visit = (n) => {
            if (!safe) {
                return;
            }
            if (n !== declaration && this.rustBindsName(n, name)) {
                safe = false; // a second binding of the name in scope — stay boxed
                return;
            }
            if (ts.isBinaryExpression(n) && n.operatorToken.kind === SyntaxKind.EqualsToken
                && ts.isIdentifier(n.left) && n.left.text === name
                && !this.rustWriteDictShape(this.typeOfNodeIfAny(n.right))) {
                safe = false;
                return;
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return safe;
    }

    // `this.<field>` receivers: the field is a plain dict (object-shaped checker type, or held as one
    // by the hand-written base when the TS declaration is `any`) and no `this.<field> = …` in the
    // method assigns another shape. Handle fields (cache/client/subscriptions/order book) are excluded.
    rustFieldStaysDict(baseExpr, fieldName: string): boolean {
        if (RustTranspiler.RUST_TAGGED_HANDLE_FIELDS.has(fieldName)) {
            return false;
        }
        if (!this.rustWriteDictShape(this.typeOfNodeIfAny(baseExpr))
            && !RustTranspiler.RUST_PLAIN_DICT_FIELDS.has(fieldName)) {
            return false;
        }
        const scope = this.rustEnclosingFunction(baseExpr);
        if (scope === undefined) {
            return false;
        }
        let safe = true;
        const visit = (n) => {
            if (!safe) {
                return;
            }
            if (ts.isBinaryExpression(n) && n.operatorToken.kind === SyntaxKind.EqualsToken
                && ts.isPropertyAccessExpression(n.left) && n.left.expression.kind === SyntaxKind.ThisKeyword
                && n.left.name?.text === fieldName
                && !this.rustWriteDictShape(this.typeOfNodeIfAny(n.right))) {
                safe = false;
                return;
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return safe;
    }

    // A parameter the checker proves is a plain dict (`Dict`, `Dictionary<T>`,
    // a `Market`-style alias — the proof B-25's native reads use) whose every
    // write in the body keeps that shape: an object literal with no runtime tag
    rustParamStaysPlainDict(declaration: ts.ParameterDeclaration): boolean {
        if (declaration.type === undefined || declaration.name?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const type = this.getCheckedTypeOf(declaration.type);
        if (type === undefined || !this.isProvenMapType(type)) {
            return false;
        }
        const name = String((declaration.name as ts.Identifier).escapedText);
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined) {
            return false;
        }
        let plain = true;
        const visit = (n) => {
            if (!plain) {
                return;
            }
            if (ts.isBinaryExpression(n) && rustIsAssignmentOperator(n.operatorToken.kind)
                && ts.isIdentifier(n.left) && n.left.text === name
                && !this.rustPlainDictPreservingRhs(n.right, name)) {
                plain = false;
                return;
            }
            if (ts.isBinaryExpression(n) && n.operatorToken.kind === SyntaxKind.EqualsToken
                && ts.isArrayLiteralExpression(n.left)
                && n.left.elements.some((e) => ts.isIdentifier(e) && String((e as ts.Identifier).escapedText) === name)
                && !this.rustHandlerTupleCall(n.right)) {
                plain = false; // a tuple write keeps only the handle-arg family
                return;
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return plain;
    }

    /** RHS of a write to a plain-dict parameter that keeps the shape. */
    rustPlainDictPreservingRhs(node: ts.Node, name: string): boolean {
        if (this.rustPlainDictLiteral(node) || this.rustTypeIsUndefinedish(node)) {
            return true;
        }
        if (ts.isIdentifier(node) && node.text === name) {
            return true;
        }
        // `this.handle…(…)` returns its own dict arguments (rust-12's proof).
        if (this.rustHandlerTupleCall(node)) {
            return true;
        }
        if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isAsExpression(node)) {
            return this.rustPlainDictPreservingRhs(node.expression, name);
        }
        if (ts.isConditionalExpression(node)) {
            return this.rustPlainDictPreservingRhs(node.whenTrue, name)
                && this.rustPlainDictPreservingRhs(node.whenFalse, name);
        }
        if (ts.isBinaryExpression(node)
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
        if (!match) {
            return undefined;
        }
        const digits = match[3].replaceAll('_', '');
        if (digits.replace('.', '').length > 18) {
            return undefined; // leave big literals to the runtime helper
        }
        const sign = match[2] === '-' ? '' : '-';
        return `Value::${match[1]}(${sign}${match[3]})`;
    }

    // Ensure a & ref prefix — skip only if already a reference
    ensureRef(expr: string): string {
        if (expr.startsWith('&')) {
            return expr;
        }
        return `&${expr}`;
    }

    // TS `number` / number-literal type proof for a comparison operand. Unions
    // (`number | undefined`) and `any` are rejected — those keep the helper.
    isNumberTyped(node) {
        const type = this.getChecker().getTypeAtLocation(node);
        if (type === undefined) {
            return false;
        }
        return (type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) !== 0;
    }

    // Positions whose emitted Rust is a native `bool`: if/while/do/for
    // conditions, `? :` conditions, `!` operands and `&&` / `||` operands.
    // Parentheses are transparent.
    isBooleanPosition(node) {
        let current = node;
        let parent = current.parent;
        while (parent !== undefined && ts.isParenthesizedExpression(parent)) {
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
            return parent.condition === current;
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
        if (inner.kind === SyntaxKind.NumericLiteral) {
            return 'definite';
        }
        // `.length` prints through printArrayLength: `Value::Int(len)` or
        // `get_array_length`, both always `Value::Int`.
        if (ts.isPropertyAccessExpression(inner) && inner.name.escapedText === 'length') {
            return 'definite';
        }
        // `.indexOf(x)` prints through printIndexOfCall: `get_index_of`, which
        // returns `Value::Int` on every path.
        if (inner.kind === SyntaxKind.CallExpression && this.callExpressionName(inner) === 'indexOf') {
            return 'definite';
        }
        return this.isNumberTyped(node) ? 'number' : undefined;
    }

    // Parens and `x as T` print as the operand itself (printAsExpression drops
    // the assertion), so the operand's own shape drives the emission.
    orderedComparisonOperand(node) {
        let inner = node;
        while (inner !== undefined && (ts.isParenthesizedExpression(inner) || ts.isAsExpression(inner))) {
            inner = inner.expression;
        }
        return inner;
    }

    // Native text for an `is_less_than`-family call, undefined unless the
    // operands prove the helper's answer: one number pins `<`/`>`; `>=`/`<=`
    // OR `is_equal` in (TRUE for two Nulls) and need a 'definite' operand.
    printNativeOrderedComparison(node, op, left, right): string | undefined {
        const operator = RustTranspiler.NATIVE_COMPARISON_OPERATORS[op];
        if (operator === undefined) {
            return undefined;
        }
        if (!this.printsValueExpression(this.orderedComparisonOperand(left)) ||
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

    isNumberLikeType(type: any): boolean {
        if (!type) {
            return false;
        }
        if (type.flags === ts.TypeFlags.Number || type.flags === ts.TypeFlags.NumberLiteral) {
            return true;
        }
        if (type.flags === ts.TypeFlags.Union && Array.isArray(type.types)) {
            return type.types.length > 0 && type.types.every((member: any) => this.isNumberLikeType(member));
        }
        return false;
    }

    isStringLikeType(type: any): boolean {
        if (!type) {
            return false;
        }
        if (type.flags === ts.TypeFlags.String || type.flags === ts.TypeFlags.StringLiteral) {
            return true;
        }
        if (type.flags === ts.TypeFlags.Union && Array.isArray(type.types)) {
            return type.types.length > 0 && type.types.every((member: any) => this.isStringLikeType(member));
        }
        return false;
    }

    // Types whose runtime value the `add` helper stringifies exactly as `format!` does: a string,
    // or `undefined`/`null` boxed as `Value::Null` (`stringify_simple(Value::Null)` and `Display`
    // both give "null"). `any` is absent — the Precise-dict branch has no `Display` equivalent.
    private static readonly RUST_CONCAT_SAFE_FLAGS = new Set<number>([
        ts.TypeFlags.String,
        ts.TypeFlags.StringLiteral,
        ts.TypeFlags.Undefined,
        ts.TypeFlags.Null,
    ]);

    isStringOrNullishType(type: any): boolean {
        if (!type) {
            return false;
        }
        if (RustTranspiler.RUST_CONCAT_SAFE_FLAGS.has(type.flags)) {
            return true;
        }
        if (type.flags === ts.TypeFlags.Union && Array.isArray(type.types)) {
            return type.types.length > 0 && type.types.every((member: any) => this.isStringOrNullishType(member));
        }
        return false;
    }

    // `Str` (`string | undefined`) operands concatenate natively only against an operand proven
    // ALWAYS a string: the helper then takes its string branch, which `format!` reproduces.
    // Without that anchor (`Str + Str`) the both-null case yields `Value::Null`, not "nullnull".
    isNativeStringConcatPair(leftType: any, rightType: any): boolean {
        if (!this.isStringOrNullishType(leftType) || !this.isStringOrNullishType(rightType)) {
            return false;
        }
        return this.isStringLikeType(leftType) || this.isStringLikeType(rightType);
    }

    // `(+|-)` with the left operand of `+=`/`-=`: assignment plus the same
    // native emission as the plain binary form.
    printNativeAssignmentArithmetic(op, left, right, leftText, rightText): string | undefined {
        let leftType, rightType;
        try {
            const checker = this.getChecker();
            leftType = checker.getTypeAtLocation(left);
            rightType = checker.getTypeAtLocation(right);
        } catch (e) {
            return undefined;
        }
        if (op === SyntaxKind.PlusToken && this.isNativeStringConcatPair(leftType, rightType)) {
            return `${leftText} = ${this.printNativeStringConcat(leftText, rightText)}`;
        }
        if (!this.isNumberLikeType(leftType) || !this.isNumberLikeType(rightType)) {
            return undefined;
        }
        return `${leftText} = ${this.printNativeNumeric(op, leftText, rightText)}`;
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
        const left = `(${leftText})`;
        const right = `(${rightText})`;
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

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right;
        const op = node.operatorToken.kind;

        // Handle array destructuring reassignment: [a, b] = expr → bind once, reassign each
        if (op === SyntaxKind.EqualsToken && left.kind === SyntaxKind.ArrayLiteralExpression) {
            const elements = left.elements;
            const rhs = this.printNode(right, 0);
            const tmpName = '__destr_tmp';
            const nativeList = this.rustNativeListSource(right);
            const assignments = elements.map((e, idx) => {
                const target = this.printNode(e, 0);
                if (nativeList) {
                    return `${target} = ${this.printNativeListIndex(tmpName, idx)}`;
                }
                return `${target} = get_value(&${tmpName}, &Value::Int(${idx}))`;
            }).join('; ');
            return `{ let ${tmpName} = ${rhs}; ${assignments}; }`;
        }

        // Handle element access assignment: a[b] = v → add_element_to_object(&mut a, &b, v)
        if (op === SyntaxKind.EqualsToken && left.kind === SyntaxKind.ElementAccessExpression) {
            const keys: any[] = [];
            let baseExpr: any = null;
            let cur: any = left;
            while (ts.isElementAccessExpression(cur)) {
                keys.unshift(cur.argumentExpression);
                const expr = cur.expression;
                if (!ts.isElementAccessExpression(expr)) {
                    baseExpr = expr;
                    break;
                }
                cur = expr;
            }
            const containerStr = this.printNode(baseExpr, 0);
            const keyStrs = keys.map(k => this.printNode(k, 0));
            let acc = `&mut ${containerStr}`;
            for (let i = 0; i < keyStrs.length - 1; i++) {
                acc = `get_value_mut(${acc}, &${keyStrs[i]})`;
            }
            const lastKey = keyStrs[keyStrs.length - 1];
            const rhs = this.printNode(right, 0);
            if (keyStrs.length === 1) {
                const nativeInsert = this.printNativeDictInsert(baseExpr, keys[0], keyStrs[0], rhs);
                if (nativeInsert !== undefined) {
                    return nativeInsert;
                }
            }
            return `add_element_to_object(${acc}, &${lastKey}, ${rhs})`;
        }

        // Handle typeof comparisons
        if (left.kind === SyntaxKind.TypeOfExpression) {
            const expression = left.expression;
            const rightText = right.text;
            const target = this.printNode(expression, 0);
            const isDiff = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
            const not = isDiff ? '!' : '';
            const native = this.nativeValuePredicateText(rightText, expression, target);
            if (native !== undefined) {
                const negated = isDiff ? `!${native}` : native;
                // Conditions/logical operands expect a bool; every other
                // position stores the result in a `Value`, so box it as before.
                return this.isBooleanPosition(node) ? negated : `Value::Bool(${negated})`;
            }
            switch (rightText) {
            case 'string': return `${not}is_string(&${target})`;
            case 'number': return `${not}is_number(&${target})`;
            case 'boolean': return `${not}is_bool(&${target})`;
            case 'object': return `${not}is_object(&${target})`;
            case 'function': return `${not}is_function(&${target})`;
            }
        }

        // Handle in operator — wrap as Value so it composes in any context
        if (op === SyntaxKind.InKeyword) {
            const shadow = this.rustParamShadowOf(right);
            if (shadow !== undefined) {
                const native = this.printShadowInOperator(shadow, left);
                if (native !== undefined) {
                    return native;
                }
            }
            const native = this.printNativeInOperator(left, right);
            if (native !== undefined) {
                return native;
            }
            return `Value::Bool(in_op(&${this.printNode(right, 0)}, &${this.printNode(left, 0)}))`;
        }

        // Handle += for regular variables
        if (op === SyntaxKind.PlusEqualsToken && left.kind !== SyntaxKind.ElementAccessExpression) {
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);
            const native = this.printNativeAssignmentArithmetic(SyntaxKind.PlusToken, left, right, leftText, rightText);
            if (native !== undefined) {
                return native;
            }
            return `${leftText} = add(&${leftText}, &${rightText})`;
        }

        // Handle -= for regular variables
        if (op === SyntaxKind.MinusEqualsToken && left.kind !== SyntaxKind.ElementAccessExpression) {
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);
            const native = this.printNativeAssignmentArithmetic(SyntaxKind.MinusToken, left, right, leftText, rightText);
            if (native !== undefined) {
                return native;
            }
            return `${leftText} = subtract(&${leftText}, &${rightText})`;
        }

        // Native equality on unwrapped payloads when the checker proves the
        // variants line up (see printNativeEqualityComparison). Value positions
        // get the bool boxed, exactly like the other Value-returning helpers.
        if (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken ||
            op === SyntaxKind.ExclamationEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken) {
            const nativeEquality = this.printNativeEqualityComparison(left, right, op);
            if (nativeEquality) {
                return `Value::Bool(${nativeEquality})`;
            }
        }

        // A logical expression whose operands include a native compare no longer
        // starts with a bool helper, so box it here — the post-pass used to.
        if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken) {
            if (this.hasNativeComparisonOperand(left) || this.hasNativeComparisonOperand(right)) {
                return `Value::Bool(${this.printLogicalInBooleanContext(node)})`;
            }
        }

        // Binary wrapper functions (is_equal, add, etc.) - add & to both sides
        if (op in this.binaryExpressionsWrappers) {
            const nativeOperator = RustTranspiler.NATIVE_COMPARISON_OPERATORS[op];
            if (nativeOperator !== undefined) {
                const native = this.printNativeOrderedComparison(node, op, left, right);
                if (native !== undefined) {
                    return native;
                }
            }
            const [fnName, close] = this.binaryExpressionsWrappers[op];
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);
            const native = this.printNativeArithmetic(op, left, right, leftText, rightText);
            if (native !== undefined) {
                return native;
            }
            const leftRef = this.ensureRef(leftText);
            const rightRef = this.ensureRef(rightText);
            return `${fnName}${leftRef}, ${rightRef}${close}`;
        }

        return undefined;
    }

    printBinaryExpression(node, identation) {
        const custom = this.printCustomBinaryExpressionIfAny(node, identation);
        if (custom) {
            return custom;
        }
        return super.printBinaryExpression(node, identation);
    }

    // `Date.now()` → runtime helper returning current epoch millis.
    printDateNowCall(node, identation) {
        return 'date_now()';
    }

    // `str.padStart(len, pad)` / `str.padEnd(len, pad)` → runtime helpers
    // (`pad_start` / `pad_end` take `(&Value, &Value, &Value)`).
    printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
        return `pad_start(${this.ensureRef(name)}, ${this.ensureRef(parsedArg)}, ${this.ensureRef(parsedArg2)})`;
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return `pad_end(${this.ensureRef(name)}, ${this.ensureRef(parsedArg)}, ${this.ensureRef(parsedArg2)})`;
    }

    printVariableDeclarationList(node, identation) {
        const declaration = node.declarations[0];
        const isNew = declaration.initializer && declaration.initializer.kind === SyntaxKind.NewExpression;

        if (declaration?.name.kind === SyntaxKind.ArrayBindingPattern) {
            const elements = declaration.name.elements;
            const parsedElements = elements.map(e => this.printNode(e.name, 0));
            const syntheticName = parsedElements.join('') + 'Variable';
            let stmt = `${this.getIden(identation)}let mut ${syntheticName} = ${this.printNode(declaration.initializer, 0)};\n`;
            const nativeList = this.rustNativeListSource(declaration.initializer);
            parsedElements.forEach((e, idx) => {
                const access = nativeList
                    ? this.printNativeListIndex(syntheticName, idx)
                    : `get_value(&${syntheticName}, &Value::Int(${idx}))`;
                const line = `${this.getIden(identation)}let mut ${e}: Value = ${access}`;
                stmt += idx < parsedElements.length - 1 ? line + ';\n' : line;
            });
            return stmt;
        }

        const varName = this.printNode(declaration.name, 0);

        if (!declaration.initializer) {
            return `${this.getIden(identation)}let mut ${varName}: Value = Value::Null`;
        }

        const parsedValue = this.printNode(declaration.initializer, identation).trim();

        if (isNew) {
            return `${this.getIden(identation)}let mut ${varName} = ${parsedValue}`;
        }

        const boolValue = this.getRustBoolLocalInitializer(declaration, parsedValue);
        if (boolValue !== undefined) {
            return `${this.getIden(identation)}let mut ${varName}: bool = ${boolValue}`;
        }

        if (this.rustSafeStringLocalIsTyped(declaration)) {
            // A call to a native-`Option<String>` method already carries the
            // native payload; the `safeString` helpers still need the unwrap.
            const suffix = this.rustNativeStrCalleeKind(declaration.initializer) === 'str'
                ? '' : '.as_str().map(str::to_owned)';
            return `${this.getIden(identation)}let mut ${varName}: Option<String> = ${parsedValue}${suffix}`;
        }

        if (this.rustNativeStrCalleeKind(declaration.initializer) === 'str') {
            // The callee returns `Option<String>`; this local keeps the box.
            return `${this.getIden(identation)}let mut ${varName}: Value = ${this.rustNativeStrValueBox(parsedValue)}`;
        }

        return `${this.getIden(identation)}let mut ${varName}: Value = ${parsedValue}`;
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
        let name: string | undefined;
        if (callee?.kind === SyntaxKind.Identifier) {
            name = callee.escapedText;
        } else if (callee?.kind === SyntaxKind.PropertyAccessExpression) {
            name = callee.name?.escapedText;
        }
        if (name === undefined || !(RustTranspiler as any).RUST_BOOL_RESULT_CALLEES.has(name)) {
            return false;
        }
        return this.rustTypeIsBoolean(node);
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
            if (char === '"') {
                i++;
                while (i < printedValue.length && printedValue[i] !== '"') {
                    if (printedValue[i] === '\\') i++;
                    i++;
                }
                continue;
            }
            if (char === '(') depth++;
            else if (char === ')') {
                depth--;
                if (depth === 0) {
                    return i === printedValue.length - 1 ? printedValue.slice(prefix.length, i) : undefined;
                }
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
            for (let i = 0; i < value.length; i++) {
                const char = value[i];
                if (char === '"') {
                    i++;
                    while (i < value.length && value[i] !== '"') {
                        if (value[i] === '\\') i++;
                        i++;
                    }
                    continue;
                }
                if (char === '(') depth++;
                else if (char === ')') {
                    depth--;
                    if (depth === 0 && i !== value.length - 1) {
                        closesAtEnd = false;
                        break;
                    }
                }
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
        return match !== null && (RustTranspiler as any).RUST_BOOL_RESULT_HELPERS.has(match[1]);
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
        case SyntaxKind.BinaryExpression:
            return (RustTranspiler as any).COMPARISON_OPS.has(node.operatorToken.kind)
                || node.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken
                || node.operatorToken.kind === SyntaxKind.BarBarToken
                || node.operatorToken.kind === SyntaxKind.InKeyword
                || node.operatorToken.kind === SyntaxKind.InstanceOfKeyword;
        }
        return false;
    }

    rustTypeIsBoolean(node): boolean {
        try {
            const type = this.getChecker().getTypeAtLocation(node);
            if ((type.flags & ts.TypeFlags.BooleanLike) !== 0) {
                return true;
            }
            return this.getChecker().typeToString(type).trim() === 'boolean';
        } catch (e) {
            return false; // no checker type → keep the boxed form
        }
    }

    rustTypeIsString(node): boolean {
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false; // no checker type → keep the boxed form
        }
        return this.isStringLikeType(checker.getTypeAtLocation(node));
    }

    rustEnclosingFunction(node) {
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

    rustBindsName(node, name: string): boolean {
        switch (node?.kind) {
        case SyntaxKind.VariableDeclaration:
        case SyntaxKind.Parameter:
        case SyntaxKind.FunctionDeclaration:
        case SyntaxKind.ClassDeclaration:
        case SyntaxKind.PropertyDeclaration:
        case SyntaxKind.FunctionExpression:
        case SyntaxKind.ArrowFunction:
            return node.name?.kind === SyntaxKind.Identifier && node.name.escapedText === name;
        }
        return false;
    }

    // Only these uses compile against a native `bool` local today: `is_true(&x)`
    // (under any depth of `(...)`, `!`, `&&`/`||`), and the condition slot of
    // if/while/for/ternary — all printed is_true-wrapped.
    rustIdentifierUseIsCondition(node): boolean {
        let current: any = node;
        let parent: any = current.parent;
        while (parent) {
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
            current = parent;
            parent = current.parent;
        }
        return false;
    }

    rustLocalUsesAcceptBool(declaration, sourceName: string): boolean {
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined || sourceName === undefined) {
            return false;
        }
        let safe = true;
        const visit = (n) => {
            if (!safe) return;
            if (n !== declaration && this.rustBindsName(n, sourceName)) {
                safe = false; // a second binding of the name in scope — stay boxed
                return;
            }
            if (n.kind === SyntaxKind.Identifier && n.escapedText === sourceName && n !== declaration.name) {
                if (!this.rustIdentifierUseIsCondition(n)) {
                    safe = false;
                    return;
                }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return safe;
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
        if (declaration.name?.kind !== SyntaxKind.Identifier
            || initializer?.kind !== SyntaxKind.CallExpression) {
            return false;
        }
        if (this.rustNativeStrCalleeKind(initializer) === 'str') {
            return true;
        }
        const callee = initializer.expression;
        if (callee?.kind === SyntaxKind.PropertyAccessExpression) {
            return callee.expression?.kind === SyntaxKind.ThisKeyword
                && (RustTranspiler as any).RUST_STRING_LOCAL_HELPERS.has(callee.name.escapedText);
        }
        if (callee?.kind === SyntaxKind.Identifier) {
            return (RustTranspiler as any).RUST_STRING_LOCAL_HELPERS.has(callee.escapedText);
        }
        return false;
    }

    // The two uses that compile against an `Option<String>` local and print
    // natively: `x ==/!= null|undefined` and `x ==/!= "lit"`.
    rustStringLocalUseIsNative(node): boolean {
        const parent = node.parent;
        if (parent === undefined) {
            return false;
        }
        if (parent.kind !== SyntaxKind.BinaryExpression) {
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
        if (otherLiteral === 'null') {
            return true;
        }
        // The string-literal compare prints as `<x>.as_deref() == Some("lit")`;
        // the printer's own rejections (replacement tokens) must match.
        return otherLiteral === 'string' && !(other.text in this.StringLiteralReplacements);
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
        if (!this.rustSafeStringLocalInitializer(declaration)) {
            return false;
        }
        if (this.primitiveKindOfType(this.typeOfNodeIfAny(declaration.name)) !== 'string') {
            return false;
        }
        const name = declaration.name.escapedText;
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined) {
            return false;
        }
        let nativeUses = 0;
        let safe = true;
        const visit = (n) => {
            if (!safe) {
                return;
            }
            if (n !== declaration && this.rustBindsName(n, name)) {
                safe = false; // a second binding of the name in scope
                return;
            }
            if (n.kind === SyntaxKind.Identifier && n.escapedText === name && n !== declaration.name
                && !this.rustIdentifierIsPropertyName(n)) {
                if (!this.rustStringLocalUseIsNative(n)) {
                    safe = false;
                    return;
                }
                nativeUses++;
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return safe && nativeUses > 0;
    }

    // `x.foo` / `{ foo: 1 }` — a property name is not a use of the local.
    rustIdentifierIsPropertyName(node): boolean {
        const parent = node.parent;
        if (parent === undefined) {
            return false;
        }
        switch (parent.kind) {
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
        if (node?.kind !== SyntaxKind.Identifier) {
            return false;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return false;
        }
        const symbol = checker.getSymbolAtLocation(node);
        const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
        if (declaration?.kind !== SyntaxKind.VariableDeclaration) {
            return false;
        }
        return this.rustSafeStringLocalIsTyped(declaration);
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
        if (!this.rustTypeIsBoolean(initializer)) {
            return undefined;
        }
        if (!this.rustLocalUsesAcceptBool(declaration, declaration.name.escapedText)) {
            return undefined;
        }
        return peeled !== undefined ? peeled : inner;
    }

    // ── native `Option<String>` returns (`: Str` methods) ─────────────────────
    //
    // An internal, non-override, non-async method declared `: Str`

    private rustNativeStrReturnDecisions = new WeakMap<ts.Node, boolean>();

    // `ts/src/base/**` — the shared `Exchange` / `PredictionExchange` classes
    // (the transpiler synthesises variants like `.__ExchangeNoOverloads.ts`).
    private static readonly RUST_BASE_TIER_FILE = /ts[\\/]src[\\/]base[\\/]/;

    /** `'str'` when the method is emitted `-> Option<String>`, else undefined. */
    rustNativeStrReturnKind(node: ts.Node): string | undefined {
        if (node === undefined || node.kind !== SyntaxKind.MethodDeclaration) {
            return undefined;
        }
        const cached = this.rustNativeStrReturnDecisions.get(node);
        if (cached !== undefined) {
            return cached ? 'str' : undefined;
        }
        this.rustNativeStrReturnDecisions.set(node, false); // re-entrancy guard
        const decision = this.rustNativeStrReturnDecisionUncached(node);
        this.rustNativeStrReturnDecisions.set(node, decision);
        return decision ? 'str' : undefined;
    }

    private rustNativeStrReturnDecisionUncached(node): boolean {
        if (node.type === undefined || this.isAsyncFunction(node)) {
            return false;
        }
        if (this.getMethodOverride(node) !== undefined) {
            return false; // the base/trait copy prints `-> Value`
        }
        // The base classes are hand-tuned across the whole tree: their methods
        // are called from ~every derived file (and the hand-written runtime),
        // where the boxed `Value` ABI is load-bearing. Only per-exchange
        if (RustTranspiler.RUST_BASE_TIER_FILE.test(node.getSourceFile().fileName)) {
            return false;
        }
        let type: ts.Type;
        try {
            type = this.getChecker().getTypeFromTypeNode(node.type);
        } catch (e) {
            return false;
        }
        if (this.primitiveKindOfType(type) !== 'string') {
            return false;
        }
        return this.rustStrReturnPathsConvert(node.body);
    }

    /** Every `return` of the method's own body converts, and the body's last
     *  statement is one of them (so Rust sees no `()`-valued tail the
     *  `-> Value` post-passes would have patched with `Value::Null`). */
    rustStrReturnPathsConvert(body: ts.Block): boolean {
        if (body === undefined) {
            return false;
        }
        const statements = body.statements;
        const last = statements[statements.length - 1];
        if (last === undefined || !ts.isReturnStatement(last)) {
            return false;
        }
        let ok = true;
        const visit = (n: ts.Node) => {
            if (!ok) {
                return;
            }
            if (n !== body && ts.isFunctionLike(n)) {
                return; // a nested function keeps the boxed signature
            }
            if (ts.isReturnStatement(n) && !this.rustStrReturnValueConverts(n.expression)) {
                ok = false;
                return;
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(body, visit);
        return ok;
    }

    /** A `return` value of a native-`Str` method: a nullish literal, an
     *  expression already printing an `Option<String>` (a nested retyped call
     *  or a typed string local), or a `Value`-printing expression the checker
     *  types `string | undefined`. */
    rustStrReturnValueConverts(expression: ts.Node): boolean {
        const inner = this.unwrapParensNode(expression);
        if (inner === undefined) {
            return false;
        }
        if (this.literalKindOfNode(inner) === 'null') {
            return true;
        }
        if (this.rustStrNativeExpression(inner)) {
            return true;
        }
        if (!this.printsValueExpression(inner)) {
            return false;
        }
        return this.primitiveKindOfType(this.getCheckedTypeOf(inner)) === 'string';
    }

    /** An expression that already prints an `Option<String>` in a `: Str`
     *  method's return position. */
    rustStrNativeExpression(expression: ts.Node): boolean {
        const inner = this.unwrapParensNode(expression);
        if (inner === undefined) {
            return false;
        }
        if (ts.isCallExpression(inner)) {
            return this.rustNativeStrCalleeKind(inner) === 'str';
        }
        if (ts.isIdentifier(inner)) {
            return this.rustStringLocalIdentifierIsTyped(inner);
        }
        return false;
    }

    unwrapParensNode(node: ts.Node): ts.Node | undefined {
        let current = node;
        while (current !== undefined && ts.isParenthesizedExpression(current)) {
            current = current.expression;
        }
        return current;
    }

    /** The callee declaration behind `self.<method>(..)` when it is emitted
     *  `-> Option<String>`; undefined otherwise (no proof → keep the box). */
    rustNativeStrCalleeKind(node: ts.Node): string | undefined {
        if (node === undefined || node.kind !== SyntaxKind.CallExpression) {
            return undefined;
        }
        let declaration: ts.Node;
        try {
            declaration = (this.getChecker() as any).getResolvedSignature(node)?.declaration;
        } catch (e) {
            return undefined;
        }
        if (declaration === undefined || declaration.kind !== SyntaxKind.MethodDeclaration) {
            return undefined;
        }
        return this.rustNativeStrReturnKind(declaration);
    }

    /** `Option<String>` → `Value` (exact inverse of the return conversion). */
    rustNativeStrValueBox(text: string): string {
        return `${text}.map(|__s| Value::Str(__s.into())).unwrap_or(Value::Null)`;
    }

    /** True when a call to a native-`Str` callee must be boxed back to a
     *  `Value` at this position; the declaration and return printers run the
     *  conversion themselves. */
    rustNativeStrCallNeedsBox(node: ts.Node): boolean {
        let current: any = node;
        let parent: any = current.parent;
        while (parent !== undefined && ts.isParenthesizedExpression(parent) && parent.expression === current) {
            current = parent;
            parent = parent.parent;
        }
        if (parent === undefined) {
            return true;
        }
        if (ts.isVariableDeclaration(parent) && parent.initializer === current
            && ts.isIdentifier(parent.name)) {
            return false; // the declaration printer binds the type / boxes it
        }
        if (ts.isReturnStatement(parent) && parent.expression === current) {
            // only a native-`Str` method's own return printer runs the conversion
            const fn: any = ts.findAncestor(parent.parent, ts.isFunctionLike);
            return this.rustNativeStrReturnKind(fn) !== 'str';
        }
        return true;
    }

    /** Wrap a call text when the callee returns a native `Option<String>`
     *  and the position still needs a `Value`. */
    rustBoxNativeStrCallIfNeeded(node: ts.Node, text: string): string {
        if (this.rustNativeStrCalleeKind(node) !== 'str') {
            return text;
        }
        if (!this.rustNativeStrCallNeedsBox(node)) {
            return text;
        }
        return this.rustNativeStrValueBox(text);
    }

    // ── declared-Dict locals (`let x: Value = self.safe_dict_k(..)`) ───────────
    //
    // The printer declares non-bool locals `Value`, and the checker types a

    private declaredDictLocalsCache: { src: ts.SourceFile, table: Map<string, RustDeclaredDictLocalEntry[]> } | undefined;

    /** All `let x: Value = <dict-proven initialiser>` declarations of the current
     *  source file, keyed by local name in declaration order. */
    rustDeclaredDictLocals(): Map<string, RustDeclaredDictLocalEntry[]> {
        const src = this.getSrc();
        if (this.declaredDictLocalsCache === undefined || this.declaredDictLocalsCache.src !== src) {
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
    rustDeclaredLocalTypeResolver(node: ts.Node): RustDeclaredLocalKind | undefined {
        const entry = this.rustDeclaredLocalEntry(node);
        return entry === undefined ? undefined : entry.kind;
    }

    /** The table entry a use site resolves to (the declaration whose binding the
     *  use refers to, proven), or undefined. */
    rustDeclaredLocalEntry(node: ts.Node): RustDeclaredDictLocalEntry | undefined {
        if (node === undefined) return undefined;
        const name = ts.isVariableDeclaration(node) ? (node.name as ts.Identifier).text : this.rootPlaceText(node);
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
                const entrySymbol = this.rustSymbolOf((entry.declaration.name as ts.Identifier));
                if (symbol !== undefined && entrySymbol !== undefined && symbol !== entrySymbol) continue;
            }
            if (best === undefined || entry.start > best.start) best = entry;
        }
        return best;
    }

    /** The identifier at the head of a place (`x`, `x['k']`, `this.x` is not a
     *  local) — the node the resolver matches against the table. */
    private rustDeclaredLocalIdentifier(node: ts.Node): ts.Identifier | undefined {
        let current: any = node;
        while (current !== undefined) {
            if (ts.isIdentifier(current)) return current;
            if (ts.isElementAccessExpression(current) || ts.isPropertyAccessExpression(current)) {
                if (current.expression.kind === SyntaxKind.ThisKeyword) return undefined;
                current = current.expression;
                continue;
            }
            if (ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current)) {
                current = current.expression;
                continue;
            }
            return undefined;
        }
        return undefined;
    }

    /** Binding symbol of an identifier, or undefined when the checker cannot
     *  answer (ByContent probes without a class context, for instance). */
    private rustSymbolOf(node: ts.Identifier): ts.Symbol | undefined {
        return this.checkerOrUndefined()?.getSymbolAtLocation(node);
    }

    /** True when this identifier is a use of the given declaration's binding.
     *  Without a checker answer the callers stay conservative (reject). */
    private rustIdentifierRefersToDeclaration(node: ts.Identifier, declaration: ts.VariableDeclaration): boolean {
        const symbol = this.rustSymbolOf(node);
        const declarationSymbol = this.rustSymbolOf(declaration.name as ts.Identifier);
        if (symbol === undefined || declarationSymbol === undefined) return false;
        return symbol === declarationSymbol;
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

    private collectRustDeclaredDictLocals(src: ts.SourceFile): Map<string, RustDeclaredDictLocalEntry[]> {
        const candidates: { declaration: ts.VariableDeclaration, name: string, source: string, defaultNode: ts.Node | undefined }[] = [];
        const collect = (node) => {
            if (ts.isVariableDeclaration(node) && node.initializer !== undefined && node.name.kind === SyntaxKind.Identifier) {
                const info = this.rustDictInitializerInfo(node.initializer);
                if (info !== undefined) {
                    candidates.push({ declaration: node, name: String(node.name.escapedText), source: info.source, defaultNode: info.defaultNode });
                }
            }
            ts.forEachChild(node, collect);
        };
        ts.forEachChild(src, collect);
        candidates.sort((a, b) => a.declaration.getStart() - b.declaration.getStart());
        const table = new Map<string, RustDeclaredDictLocalEntry[]>();
        for (const candidate of candidates) {
            const declaration = candidate.declaration;
            const start = declaration.getStart();
            const alwaysDict = this.rustDictProvenExpression(candidate.defaultNode, table, start);
            const scan = this.rustDictLocalWriteScan(declaration, candidate.name, table);
            const entries = table.get(candidate.name) ?? [];
            entries.push({
                kind: RUST_DECLARED_DICT_LOCALS.DICT,
                name: candidate.name,
                source: candidate.source,
                alwaysDict,
                stable: scan.stable,
                uses: scan.uses,
                declaration,
                start,
            });
            table.set(candidate.name, entries);
        }
        return table;
    }

    /** The Dict-proven initialiser shape of a declaration, or undefined. */
    private rustDictInitializerInfo(node: ts.Node): { source: string, defaultNode: ts.Node | undefined } | undefined {
        if (ts.isObjectLiteralExpression(node)) {
            return { source: 'value_map', defaultNode: node };
        }
        if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
            return this.rustDictInitializerInfo(node.expression);
        }
        if (!ts.isCallExpression(node)) return undefined;
        const callee = this.rustSafeDictCallee(node);
        if (callee === undefined) return undefined;
        return { source: callee, defaultNode: node.arguments[RUST_DECLARED_DICT_LOCALS.SAFE_CALLEES[callee]] };
    }

    /** Printed `safe_dict*` callee name of `self.<name>(..)`, or undefined. */
    private rustSafeDictCallee(node: ts.CallExpression): string | undefined {
        const expression = node.expression;
        if (!ts.isPropertyAccessExpression(expression) || expression.expression.kind !== SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const printed = this.toSnakeCaseName(expression.name.text);
        return RUST_DECLARED_DICT_LOCALS.SAFE_CALLEES[printed] === undefined ? undefined : printed;
    }

    /** True when the expression can only be a Dict at run time: an object
     *  literal, a `safe_dict*` call with a Dict-proven default, an element of a
     *  one-element literal default, or an already-proven local. */
    private rustDictProvenExpression(node: ts.Node | undefined, table: Map<string, RustDeclaredDictLocalEntry[]>, useStart: number): boolean {
        if (node === undefined) return false;
        if (ts.isObjectLiteralExpression(node)) return true;
        if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
            return this.rustDictProvenExpression(node.expression, table, useStart);
        }
        if (ts.isArrayLiteralExpression(node)) {
            return node.elements.length === 1 && this.rustDictProvenExpression(node.elements[0], table, useStart);
        }
        if (ts.isIdentifier(node)) {
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
    private rustDictLocalWriteScan(declaration: ts.VariableDeclaration, name: string, table: Map<string, RustDeclaredDictLocalEntry[]>): { stable: boolean, uses: { elementAccess: number, mutHelper: number, other: number } } {
        const uses = { elementAccess: 0, mutHelper: 0, other: 0 };
        let stable = true;
        const scope = this.rustEnclosingFunction(declaration);
        if (scope === undefined) return { stable, uses };
        const declarationSymbol = this.rustSymbolOf(declaration.name as ts.Identifier);
        const visit = (node) => {
            if (!stable) return;
            if (node !== declaration && this.rustBindsName(node, name)) {
                const otherSymbol = this.rustSymbolOf((node as any).name);
                if (declarationSymbol === undefined || otherSymbol === undefined || otherSymbol === declarationSymbol) {
                    stable = false; // same binding, or the checker cannot tell them apart
                    return;
                }
            }
            if (node.kind === SyntaxKind.Identifier && node.escapedText === name && node !== declaration.name &&
                this.rustIdentifierRefersToDeclaration(node, declaration)) {
                this.rustDictLocalClassifyUse(node, uses);
            }
            if (ts.isBinaryExpression(node) && rustIsAssignmentOperator(node.operatorToken.kind) &&
                this.rustAssignmentWritesWholeLocal(node.left, declaration) &&
                !this.rustDictProvenExpression(node.right, table, declaration.getStart())) {
                stable = false; // the local itself is reassigned a non-Dict value
                return;
            }
            // `for (x of list)` / `for (x in obj)` rebind an existing local.
            if ((ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
                this.rustAssignmentWritesWholeLocal(node.initializer, declaration)) {
                stable = false;
                return;
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(scope, visit);
        return { stable, uses };
    }

    /** True when this assignment target writes the local ITSELF (`x = ..`,
     *  `[x, y] = ..`, `({x} = ..)`), as opposed to a write *into* it
     *  (`x['k'] = ..`, kind-preserving). */
    private rustAssignmentWritesWholeLocal(left: ts.Node, declaration: ts.VariableDeclaration): boolean {
        if (ts.isIdentifier(left)) {
            return this.rustIdentifierRefersToDeclaration(left, declaration);
        }
        if (ts.isParenthesizedExpression(left)) {
            return this.rustAssignmentWritesWholeLocal(left.expression, declaration);
        }
        if (ts.isArrayLiteralExpression(left)) {
            return left.elements.some((element) => this.rustAssignmentWritesWholeLocal(element, declaration));
        }
        if (ts.isObjectLiteralExpression(left)) {
            return left.properties.some((property) => {
                if (!ts.isShorthandPropertyAssignment(property)) return false;
                return this.rustAssignmentWritesWholeLocal(property.name, declaration);
            });
        }
        return false;
    }

    /** One use of a dict-proven local: an element-access chain (`x['k']`, also
     *  the `x['k'] = v` write), a kind-preserving mutator (`x.push(v)`,
     *  `delete x[k]`), or something that would need the local to still be a
     *  `Value`. */
    private rustDictLocalClassifyUse(node: ts.Node, uses: { elementAccess: number, mutHelper: number, other: number }): void {
        let current: any = node;
        const parent: any = current.parent;
        if (parent !== undefined && (ts.isElementAccessExpression(parent) || ts.isPropertyAccessExpression(parent)) && parent.expression === current) {
            current = parent;
            while (current.parent !== undefined &&
                (ts.isElementAccessExpression(current.parent) || ts.isPropertyAccessExpression(current.parent)) &&
                current.parent.expression === current) {
                current = current.parent;
            }
            if (ts.isElementAccessExpression(current)) {
                uses.elementAccess++;
                return;
            }
            uses.other++; // `x.field` on a dict value
            return;
        }
        if (parent !== undefined && ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) &&
            parent.expression.expression === current && parent.expression.name.text === 'push') {
            uses.mutHelper++;
            return;
        }
        if (parent !== undefined && ts.isDeleteExpression(parent)) {
            uses.mutHelper++;
            return;
        }
        uses.other++;
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
        const propDecls = node.members.filter(m => m.kind === SyntaxKind.PropertyDeclaration);
        return propDecls.map(p => {
            const name = this.printNode(p.name, 0);
            const init = p.initializer ? this.printNode(p.initializer, 0) : 'Value::Null';
            return { name, init };
        });
    }

    printStruct(node, identation) {
        const fields = this.getStructFields(node);
        const fieldLines = fields.map(f => `${this.getIden(identation + 1)}pub ${f.name}: Value,`).join('\n');
        return `#[derive(Debug, Clone)]\npub struct ${this.className} {\n${fieldLines}\n}`;
    }

    printNewMethod(node, identation) {
        const fields = this.getStructFields(node);
        const fieldInits = fields.map(f => `${this.getIden(identation + 2)}${f.name}: ${f.init},`).join('\n');
        return `\nimpl ${this.className} {\n${this.getIden(identation + 1)}pub fn new() -> Self {\n${this.getIden(identation + 2)}${this.className} {\n${fieldInits}\n${this.getIden(identation + 2)}}\n${this.getIden(identation + 1)}}\n}`;
    }

    printClass(node, identation) {
        this.className = node.name.escapedText;

        // First pass: collect method signatures for optional param handling
        const methods = node.members.filter(m => m.kind === SyntaxKind.MethodDeclaration);
        methods.forEach(method => {
            const name = (method as any).name.escapedText;
            const params = (method as any).parameters;
            const requiredCount = params.filter(p => !p.initializer && !p.questionToken).length;
            const hasOptional = params.some(p => p.initializer !== undefined || p.questionToken !== undefined);
            if (hasOptional) {
                this.methodSignatures[name] = { requiredCount };
            }
        });

        const struct = this.printStruct(node, identation);
        const newMethod = this.printNewMethod(node, identation);

        const classMethods = methods.map(m => this.printMethodDeclaration(m, identation)).join('\n\n');

        const implBlock = `\nimpl ${this.className} {\n${classMethods}\n}`;

        return struct + newMethod + implBlock;
    }

    printMethodDefinition(node, identation) {
        const name = (node.name as any).escapedText;
        const params = node.parameters;
        const hasOptional = params.some(p => p.initializer !== undefined || p.questionToken !== undefined);

        const requiredParams = params.filter(p => !p.initializer && !p.questionToken);
        const optionalParams = params.filter(p => p.initializer !== undefined || p.questionToken !== undefined);

        let parsedArgs = '&self';
        if (requiredParams.length > 0) {
            const reqArgs = requiredParams.map(p => `${this.printNode(p.name, 0)}: Value`).join(', ');
            parsedArgs += ', ' + reqArgs;
        }
        if (hasOptional) {
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
            const type = this.getChecker().getReturnTypeOfSignature(this.getChecker().getSignatureFromDeclaration(node));
            if (type.flags === ts.TypeFlags.Void) {
                return '';
            }
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
        let optionalInits = '';
        if (optionalParams.length > 0) {
            const requiredCount = params.filter(p => !p.initializer && !p.questionToken).length;
            optionalInits = optionalParams.map((p, idx) => {
                const pname = this.printNode(p.name, 0);
                const defaultVal = p.initializer ? this.printNode(p.initializer, 0) : 'Value::Null';
                return `${this.getIden(identation + 2)}let ${pname} = get_arg(optional_args, ${idx}, ${defaultVal});`;
            }).join('\n') + '\n';
        }

        const blockOpen = this.getBlockOpen(identation);
        const blockClose = this.getBlockClose(identation);
        const shadows = this.rustParamShadowLines(node, identation + 2);
        // D-27: a `handle*` method's `message: Dict` param gets a borrowed
        // `&IndexMap` shadow so its `safe_*` reads print natively.
        const shadowPlan = this.rustProHandlerShadowPlan(node, identation);
        const savedShadowParam = this.rustProHandlerShadowParam;
        if (shadowPlan !== undefined) {
            this.rustProHandlerShadowParam = shadowPlan.param;
        }
        const statements = node.body.statements.map(s => this.printNode(s, identation + 2)).join('\n');
        this.rustProHandlerShadowParam = savedShadowParam;
        const shadow = shadowPlan === undefined ? '' : shadowPlan.lines;
        const body = blockOpen + optionalInits + shadows + shadow + statements + blockClose;

        return this.printNodeCommentsIfAny(node, identation, methodDef + body);
    }

    printFunctionDefinition(node, identation) {
        const name = node.name?.escapedText ?? '';
        const params = node.parameters;
        const parsedArgs = params.map(p => `${this.printNode(p.name, 0)}: Value`).join(', ');
        const returnType = this.printRustFunctionType(node);
        const retStr = returnType ? ` -> ${returnType}` : '';
        return `${this.getIden(identation)}fn ${name}(${parsedArgs})${retStr}`;
    }

    printFunctionDeclaration(node, identation) {
        if (ts.isArrowFunction(node)) {
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
            const methodName = expr.name.escapedText;
            const sig = this.methodSignatures[methodName];
            if (sig) {
                const requiredArgs = args.slice(0, sig.requiredCount).map(a => this.printNode(a, 0)).join(', ');
                const optionalArgsList = args.slice(sig.requiredCount).map(a => this.printNode(a, 0)).join(', ');
                const optSlice = optionalArgsList ? `&[${optionalArgsList}]` : '&[]';
                const reqPart = requiredArgs ? `${requiredArgs}, ` : '';
                return `self.${methodName}(${reqPart}${optSlice})`;
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
                    const ref = argText.startsWith('Value::') ? `&${argText}` :
                        argText.startsWith('&') ? argText : `&${argText}`;
                    return `println_val(${ref})`;
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
            expression.name.escapedText === 'json' && node.arguments.length === 1) {
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
        exchange_error: ['msg'],
        authentication_error: ['msg'],
        permission_denied: ['msg'],
        account_not_enabled: ['msg'],
        account_suspended: ['msg'],
        arguments_required: ['msg'],
        bad_request: ['msg'],
        bad_symbol: ['msg'],
        operation_rejected: ['msg'],
        no_change: ['msg'],
        margin_mode_already_set: ['msg'],
        market_closed: ['msg'],
        manual_interaction_needed: ['msg'],
        restricted_location: ['msg'],
        insufficient_funds: ['msg'],
        invalid_address: ['msg'],
        address_pending: ['msg'],
        invalid_order: ['msg'],
        order_not_found: ['msg'],
        order_not_cached: ['msg'],
        order_immediately_fillable: ['msg'],
        order_not_fillable: ['msg'],
        duplicate_order_id: ['msg'],
        contract_unavailable: ['msg'],
        not_supported: ['msg'],
        invalid_proxy_settings: ['msg'],
        exchange_closed_by_user: ['msg'],
        operation_failed: ['msg'],
        network_error: ['msg'],
        d_do_s_protection: ['msg'],
        rate_limit_exceeded: ['msg'],
        exchange_not_available: ['msg'],
        on_maintenance: ['msg'],
        invalid_nonce: ['msg'],
        checksum_error: ['msg'],
        request_timeout: ['msg'],
        bad_response: ['msg'],
        null_response: ['msg'],
        cancel_pending: ['msg'],
        unsubscribe_error: ['msg'],
        create_error: ['str', 'msg'],
    };

    // A string literal prints as the bare `"lit"` (`&str` — no String
    // allocation); a checker-proven string drops the redundant `Value::Str` box.
    printErrorConstructorArg(name: string, index: number, node, identation: number): string {
        const kind = (RustTranspiler as any).RUST_ERROR_CONSTRUCTOR_ARGS[name]?.[index];
        if (kind === undefined) {
            return this.printNode(node, identation);
        }
        if (ts.isStringLiteral(node) && !(node.text in this.StringLiteralReplacements)) {
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
        return className
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
            .replace(/([a-z\d])([A-Z])/g, '$1_$2')
            .toLowerCase();
    }

    printNewExpression(node, identation) {
        let expression = node.expression?.escapedText;
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

        const rightSide = node.name.escapedText;
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
        if (ts.isIdentifier(node.name) && this.isShallowValueReceiver(node.expression) &&
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

    getCheckedTypeOf(node): ts.Type | undefined {
        return this.checkerOrUndefined()?.getTypeAtLocation(node);
    }

    typeSymbolOf(type: ts.Type): ts.Symbol | undefined {
        if (type === undefined || type === null) return undefined;
        return (type as any).getSymbol?.() ?? (type as any).symbol ?? (type as any).aliasSymbol;
    }

    /** Types declared outside ts/src (Date, Response, Array, Promise, …) are never
     *  backed by a plain `Value` map in the rust port. */
    isLibDeclaredType(type: ts.Type): boolean {
        const declarations: any[] = (this.typeSymbolOf(type) as any)?.declarations ?? [];
        return declarations.some(d => {
            const file = d?.getSourceFile?.()?.fileName ?? '';
            return /[\\/]lib\.[^\\/]*\.d\.ts$/.test(file) || /[\\/]node_modules[\\/]typescript[\\/]/.test(file);
        });
    }

    isClassInstanceType(type: ts.Type): boolean {
        if (type === undefined) return false;
        if (type.flags & (ts.TypeFlags.Union | ts.TypeFlags.Intersection)) {
            return ((type as any).types ?? []).some((member) => this.isClassInstanceType(member));
        }
        const symbol: any = this.typeSymbolOf(type) ?? type.aliasSymbol;
        if (symbol?.flags & ts.SymbolFlags.Class) return true;
        const declarations: any[] = symbol?.declarations ?? [];
        return declarations.some(d => ts.isClassDeclaration(d) || ts.isClassExpression(d));
    }

    hasCallableShape(type: ts.Type): boolean {
        const checker = this.getChecker();
        return checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0 ||
            checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0;
    }

    isProvenListType(type: ts.Type): boolean {
        if (!(type.flags & ts.TypeFlags.Object)) return false;
        // Tuple references carry the Tuple flag on their target.
        const objectFlags = ((type as any).objectFlags ?? 0) | (((type as any).target?.objectFlags) ?? 0);
        if (objectFlags & ts.ObjectFlags.Tuple) return true;
        const name = (this.typeSymbolOf(type) as any)?.getName?.();
        if (name === 'Array' || name === 'ReadonlyArray') return true;
        const targetName = (this.typeSymbolOf((type as any).target) as any)?.getName?.();
        return targetName === 'Array' || targetName === 'ReadonlyArray';
    }

    /** True only for object types the rust port represents as `Value::Dict`
     *  (plain interfaces / index-signature / literal types — never classes). */
    isProvenMapType(type: ts.Type): boolean {
        if (type === undefined) return false;
        if (type.flags & ts.TypeFlags.Union) {
            // `Market` / `Currency` / `Order | undefined` style aliases: the runtime value is the dict (or
            // Null), so a map receiver is proven once every value-carrying member is a proven map. An
            // all-dict union without a nullish member stays on the strict path (a class may hide behind it).
            const parts: ts.Type[] = (type as any).types ?? [];
            const nullish = parts.filter((p) => this.rustTypeIsNullish(p));
            const valueParts = parts.filter((p) => !this.rustTypeIsNullish(p));
            return nullish.length > 0 && valueParts.length > 0 && valueParts.every((p) => this.isProvenMapType(p));
        }
        if (!(type.flags & ts.TypeFlags.Object)) return false;
        if (this.isProvenListType(type)) return false;
        if (this.hasCallableShape(type)) return false;
        if (this.isClassInstanceType(type)) return false;
        if (this.isLibDeclaredType(type)) return false;
        // A named type or a string index signature; a bare `object` proves nothing.
        const hasStringIndex = this.getChecker().getIndexTypeOfType(type, ts.IndexKind.String) !== undefined;
        return hasStringIndex || this.typeSymbolOf(type) !== undefined;
    }

    /** `undefined` / `null` / `void` / `never` — a union member that carries no
     *  runtime value; `Value::Null` is the only box these ever get. */
    rustTypeIsNullish(type: ts.Type): boolean {
        return type !== undefined && (type.flags &
            (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void |
                ts.TypeFlags.Never)) !== 0;
    }

    isProvenMapExpression(node: ts.Node): boolean {
        const type = this.getCheckedTypeOf(node);
        return type !== undefined && this.isProvenMapType(type);
    }

    isProvenListExpression(node: ts.Node): boolean {
        const type = this.getCheckedTypeOf(node);
        return type !== undefined && this.isProvenListType(type);
    }

    /** RHS of a generator destructure that provably holds a `Value::Arr`: the
     *  checker-proven list, or a call whose callee returns an array literal on
     *  every path. */
    rustNativeListSource(node: ts.Node): boolean {
        return this.isProvenListExpression(node) || this.rustCallReturnsProvenList(node);
    }

    /** `x.split(sep)` → the runtime `split`, which yields an array on every
     *  path (a non-string receiver gives the empty array, never a dict). */
    rustCallPrintsRuntimeSplit(node: ts.Node): boolean {
        if (!ts.isCallExpression(node) || node.arguments.length === 0) return false;
        const expression: any = node.expression;
        if (!ts.isPropertyAccessExpression(expression)) return false;
        if (expression.expression.kind === SyntaxKind.ThisKeyword) return false;
        return String(expression.name.escapedText) === 'split';
    }

    /** True when the call's value is always a runtime array: the `handle*AndParams`
     *  family and its exchange overrides declare `any`, so the checker cannot
     *  prove the `[T, Dict]` tuple the body always builds — walk the resolved
     *  callee instead. */
    rustCallReturnsProvenList(node: ts.Node): boolean {
        if (!ts.isCallExpression(node)) return false;
        return this.rustProvenListCall(node, new Set());
    }

    private rustProvenListCall(node: ts.Node, stack: Set<ts.Node>): boolean {
        if (this.rustCallPrintsRuntimeSplit(node)) return true;
        const declaration = this.rustCalleeDeclaration(node);
        if (declaration === undefined) return false;
        return this.rustFunctionReturnsArrayLiteral(declaration, stack);
    }

    /** Implementation of a `x.y(..)` call, when the checker resolves one. */
    private rustCalleeDeclaration(node: ts.Node): ts.Node | undefined {
        if (!ts.isCallExpression(node)) return undefined;
        if (!ts.isPropertyAccessExpression((node as any).expression)) return undefined;
        try {
            const signature: any = (this.getChecker() as any).getResolvedSignature(node);
            return signature?.declaration ?? undefined;
        } catch (e) {
            return undefined;
        }
    }

    /** Every `return` in the function's own body builds an array literal, or
     *  delegates to a call that does. `throw` and fall-through (the printer's
     *  `Value::Null`) read the same through both forms. */
    private rustFunctionReturnsArrayLiteral(declaration: ts.Node, stack: Set<ts.Node>): boolean {
        if (stack.has(declaration)) return false;
        const body: any = (declaration as any).body;
        if (body === undefined || !ts.isBlock(body)) return false;
        stack.add(declaration);
        try {
            let returns = 0;
            let all = true;
            const visit = (node: ts.Node) => {
                if (!all) return;
                if (node !== body && ts.isFunctionLike(node)) return; // nested closure
                if (ts.isReturnStatement(node)) {
                    returns++;
                    const expression: any = node.expression;
                    if (expression === undefined || !ts.isArrayLiteralExpression(expression)) {
                        if (expression !== undefined && ts.isCallExpression(expression) &&
                            this.rustProvenListCall(expression, stack)) {
                            return;
                        }
                        if (expression !== undefined && ts.isParenthesizedExpression(expression) &&
                            ts.isArrayLiteralExpression(expression.expression)) {
                            return;
                        }
                        all = false;
                        return;
                    }
                    return;
                }
                ts.forEachChild(node, visit);
            };
            ts.forEachChild(body, visit);
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
    printNativeContainerAccess(receiverText: string, receiverNode: ts.Node, keyNode: ts.Node): string | undefined {
        // A shadowed parameter reads through the borrowed container.
        const shadow = this.rustParamShadowOf(receiverNode);
        if (shadow !== undefined) {
            const native = this.printShadowContainerRead(shadow, keyNode);
            if (native !== undefined) return native;
        }
        if (ts.isStringLiteralLike(keyNode)) {
            return this.printNativeMapAccess(receiverText, receiverNode, keyNode.text);
        }
        if (ts.isNumericLiteral(keyNode)) {
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
    printNativeDynamicListIndex(receiverText: string, receiverNode: ts.Node, keyNode: ts.Node): string | undefined {
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
    isWriteBackBindRead(read: ts.Node): boolean {
        const declaration: any = read === undefined ? undefined : read.parent;
        if (declaration === undefined || !ts.isVariableDeclaration(declaration) || declaration.initializer !== read) return false;
        if (!ts.isIdentifier(declaration.name)) return false;
        const name = String(declaration.name.escapedText);
        let statement: any = declaration;
        while (statement !== undefined && !ts.isStatement(statement)) statement = statement.parent;
        const siblings: any[] = statement?.parent?.statements ?? [];
        const at = siblings.indexOf(statement);
        if (at < 0 || at + 1 >= siblings.length) return false;
        return this.rustStatementMutatesLocal(siblings[at + 1], name);
    }

    /** A statement containing a write into a local (`x['k'] = v`, `x.k = v`,
     *  `x.push(v)`). */
    rustStatementMutatesLocal(node: ts.Node, name: string): boolean {
        let mutated = false;
        const visit = (n: ts.Node) => {
            if (mutated) return;
            if (ts.isBinaryExpression(n) && rustIsAssignmentOperator(n.operatorToken.kind) &&
                this.rootPlaceText(n.left) === name) {
                mutated = true;
                return;
            }
            if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
                n.expression.name.text === 'push' && this.rootPlaceText(n.expression.expression) === name) {
                mutated = true;
                return;
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(node, visit);
        return mutated;
    }

    /** A dynamic index the printer emits as a `Value` number: a `let x = <numeric
     *  literal>` declaration of the same function (the C-style loop counter).
     *  Any other shape keeps the helper — the printed local could be a native
     *  `i64`/`f64`, which the `Value` match would not compile against. */
    isRustValueIndexKey(node: ts.Node): boolean {
        let current: any = node;
        while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current)) {
            current = current.expression;
        }
        if (!ts.isIdentifier(current)) return false;
        const type = this.getCheckedTypeOf(current);
        if (type === undefined || !(type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral))) return false;
        const declaration: any = this.rustDeclarationOfIdentifier(current);
        if (declaration === undefined || !ts.isVariableDeclaration(declaration) || declaration.initializer === undefined) return false;
        let initializer: any = declaration.initializer;
        while (ts.isParenthesizedExpression(initializer) || ts.isAsExpression(initializer) || ts.isNonNullExpression(initializer)) {
            initializer = initializer.expression;
        }
        return ts.isNumericLiteral(initializer);
    }

    // Typed-parameter dict reads: a checker-proven plain dict param (`Dict`, `Dictionary<T>`,
    // `Market`-style alias) holds the dict or `Value::Null`, so `get_value`'s marker routes cannot
    // fire and the read is `m.get(k)`. The key must be a proven `Str` box so `.as_str()` reproduces it.

    /** The parameter declaration behind a receiver when its *annotation* proves
     *  a plain dict; undefined otherwise (no proof → keep the helper). */
    rustProvenDictParameter(node: ts.Node): ts.ParameterDeclaration | undefined {
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !ts.isParameter(declaration)) return undefined;
        if (declaration.type === undefined) return undefined;
        const type = this.getCheckedTypeOf(declaration.type);
        if (type === undefined || !this.isProvenMapType(type)) return undefined;
        // D2: a later write can change the kind.
        return this.rustLocalIsReassigned(declaration, String((declaration.name as any).escapedText)) ? undefined : declaration;
    }

    /** `Str` (`string | undefined`) — the key box is `Value::Str` or Null. */
    rustKeyIsProvenString(node: ts.Node): boolean {
        const type = this.getCheckedTypeOf(node);
        if (type === undefined) return false;
        const parts: ts.Type[] = (type.flags & ts.TypeFlags.Union) ? ((type as any).types ?? []) : [type];
        let strings = 0;
        for (const part of parts) {
            if (part.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
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
    rustProvenDynamicMapReceiver(node: ts.Node): ts.Declaration | undefined {
        const parameter = this.rustProvenDictParameter(node);
        if (parameter !== undefined) return parameter;
        if (!ts.isIdentifier(node)) return undefined;
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined || !ts.isVariableDeclaration(declaration)) return undefined;
        if (declaration.initializer === undefined) return undefined;
        if (!this.isProvenMapExpression(node)) return undefined;
        if (this.rustLocalIsReassigned(declaration, String(node.escapedText))) return undefined;
        return declaration;
    }

    /** The element-access read a key node belongs to (`x[k]`, `x[(k)]`). */
    rustElementReadOfKey(keyNode: ts.Node): ts.Node | undefined {
        let current: any = keyNode;
        while (current !== undefined && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current))) {
            current = current.parent;
        }
        const parent: any = current === undefined ? undefined : current.parent;
        if (parent === undefined || !ts.isElementAccessExpression(parent) || parent.argumentExpression !== current) return undefined;
        return parent;
    }

    /** `x[k]` where `x` is a proven-dict parameter and `k` a proven string. */
    printNativeDynamicMapAccess(receiverText: string, receiverNode: ts.Node, keyNode: ts.Node): string | undefined {
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

    private paramShadowCache: { src: ts.SourceFile, tables: Map<ts.Node, Map<string, RustParamShadow>> } | undefined;

    /** Functions whose shadow lines were actually emitted — a read converts
     *  only inside one of those (an arrow body prints inline and gets none). */
    private paramShadowEmitted: { src: ts.SourceFile, fns: Set<ts.Node> } | undefined;

    private rustParamShadowEmittedSet(): Set<ts.Node> {
        const src = this.getSrc();
        if (this.paramShadowEmitted === undefined || this.paramShadowEmitted.src !== src) {
            this.paramShadowEmitted = { src, fns: new Set() };
        }
        return this.paramShadowEmitted.fns;
    }

    rustParamShadowTables(): Map<ts.Node, Map<string, RustParamShadow>> {
        const src = this.getSrc();
        if (this.paramShadowCache === undefined || this.paramShadowCache.src !== src) {
            this.paramShadowCache = { src, tables: new Map() };
        }
        return this.paramShadowCache.tables;
    }

    /** Emitted shadow lines for a function, or '' when no parameter qualifies.
     *  The caller must use this before printing the body statements (it both
     *  registers the function as shadowed and computes the lines). */
    rustParamShadowLines(fn: ts.Node, identation: number): string {
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

    private rustParamShadowTable(fn: ts.Node): Map<string, RustParamShadow> {
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
    rustParamShadowOf(node: ts.Node): RustParamShadow | undefined {
        if (node === undefined) return undefined;
        let current: any = node;
        while (current !== undefined && (ts.isParenthesizedExpression(current) ||
            ts.isAsExpression(current) || ts.isNonNullExpression(current))) {
            current = current.expression;
        }
        if (current === undefined || !ts.isIdentifier(current)) return undefined;
        const name = String(current.escapedText);
        const declaration = this.rustDeclarationOfIdentifier(current);
        if (declaration === undefined || !ts.isParameter(declaration)) return undefined;
        const emitted = this.rustParamShadowEmittedSet();
        let scope: any = current.parent;
        while (scope !== undefined) {
            if (ts.isFunctionLike(scope)) {
                const entry = emitted.has(scope) ? this.rustParamShadowTable(scope).get(name) : undefined;
                if (entry !== undefined && entry.declaration === declaration) return entry;
            }
            scope = scope.parent;
        }
        return undefined;
    }

    /** True when the enclosing function already binds this name somewhere. */
    private rustFunctionDeclaresName(fn: ts.Node, name: string): boolean {
        let found = false;
        const visit = (node: ts.Node) => {
            if (found) return;
            if (node !== fn && ts.isFunctionLike(node)) return; // nested closure: own scope
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
                found = true;
                return;
            }
            if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === name) {
                found = true;
                return;
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(fn, visit);
        return found;
    }

    private collectRustParamShadows(fn: ts.Node): Map<string, RustParamShadow> {
        const table = new Map<string, RustParamShadow>();
        const parameters: any[] = (fn as any).parameters ?? [];
        const body: any = (fn as any).body;
        if (body === undefined) return table;
        for (const param of parameters) {
            if (!ts.isParameter(param) || !ts.isIdentifier(param.name)) continue;
            const name = String(param.name.escapedText);
            if (name === 'optional_args') continue;
            if (param.type === undefined) continue;
            const type = this.getCheckedTypeOf(param.type);
            if (type === undefined) continue;
            let kind: RustParamShadowKind | undefined;
            if (this.isProvenMapType(type)) {
                kind = RUST_PARAM_SHADOWS.MAP;
            } else if (this.isProvenShadowListType(type)) {
                kind = RUST_PARAM_SHADOWS.LIST;
            }
            if (kind === undefined) continue;
            if (this.rustParameterIsClientHandle(param)) continue;
            if (this.rustParamShadowUseCensus(fn, param, kind) === undefined) continue;
            table.set(name, { kind, name, declaration: param });
        }
        return table;
    }

    /** A checker-proven array parameter type (`Vec<Value>` on the rust side);
     *  tuples are excluded (their printed shape is not a plain `Vec`). */
    isProvenShadowListType(type: ts.Type): boolean {
        if (type === undefined) return false;
        if (!(type.flags & ts.TypeFlags.Object)) return false;
        const objectFlags = ((type as any).objectFlags ?? 0) | (((type as any).target?.objectFlags) ?? 0);
        if (objectFlags & ts.ObjectFlags.Tuple) return false;
        if (this.hasCallableShape(type)) return false;
        if (this.isClassInstanceType(type)) return false;
        const name = (this.typeSymbolOf(type) as any)?.getName?.();
        if (name === 'Array' || name === 'ReadonlyArray') return true;
        const targetName = (this.typeSymbolOf((type as any).target) as any)?.getName?.();
        return targetName === 'Array' || targetName === 'ReadonlyArray';
    }

    /** Every reference to the parameter must be a printable read, and at least
     *  one must exist; anything else (a write, a `Value` pass-through, a Null
     *  comparison, a marker key) answers undefined and the parameter keeps its
     *  box. */
    private rustParamShadowUseCensus(fn: ts.Node, param: ts.ParameterDeclaration, kind: RustParamShadowKind): { reads: number } | undefined {
        const name = String((param.name as ts.Identifier).escapedText);
        const paramSymbol = this.rustSymbolOf(param.name as ts.Identifier);
        if (paramSymbol === undefined) return undefined;
        let reads = 0;
        let ok = true;
        const visit = (node: ts.Node) => {
            if (!ok) return;
            if (ts.isIdentifier(node) && node.text === name && node !== param.name) {
                if (this.rustSymbolOf(node) !== paramSymbol || !this.rustParamUseIsRead(node, kind)) {
                    ok = false;
                    return;
                }
                reads++;
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild((fn as any).body, visit);
        return ok && reads > 0 ? { reads } : undefined;
    }

    /** One reference of a shadow candidate: true only for a read the shadow can
     *  print exactly (same proofs the emitted forms re-check). */
    private rustParamUseIsRead(id: ts.Identifier, kind: RustParamShadowKind): boolean {
        const parent: any = id.parent;
        if (parent === undefined) return false;
        // `x[k]` — element read. Writes (`x[k] = v`, `x[k].push(..)`) and the
        // post-pass write-back binds keep the box.
        if (ts.isElementAccessExpression(parent) && parent.expression === id) {
            if (this.isNativeWriteTargetBase(id)) return false;
            if (!this.isNativeAccessPositionSafe(id)) return false;
            if (this.isWriteBackBindRead(parent)) return false;
            return this.rustShadowKeyIsReadable(parent.argumentExpression, kind);
        }
        // `x.length` — array length read.
        if (ts.isPropertyAccessExpression(parent) && parent.expression === id) {
            return kind === RUST_PARAM_SHADOWS.LIST && String(parent.name.escapedText) === 'length';
        }
        // `'k' in x` / `k in x`.
        if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.InKeyword && parent.right === id) {
            if (kind !== RUST_PARAM_SHADOWS.MAP) return false;
            return this.rustShadowKeyIsReadable(parent.left, RUST_PARAM_SHADOWS.MAP);
        }
        // `this.safe<Type>(x, 'k'[, default])` — the read families the shadow
        // inlines (literal keys only). Any other call keeps the box.
        if (ts.isCallExpression(parent) && kind === RUST_PARAM_SHADOWS.MAP) {
            if (this.rustShadowSafeCallee(parent) === undefined) return false;
            const args: ts.NodeArray<ts.Expression> = parent.arguments;
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
            if (ts.isStringLiteralLike(key)) return this.rustShadowKeyIsLiteral(key);
            if (ts.isIdentifier(key)) {
                return this.rustKeyIsProvenString(key) && !this.rustNodeIsKeyUnsafePlace(String(key.escapedText));
            }
            return false;
        }
        if (ts.isNumericLiteral(key)) {
            const index = Number(key.text);
            return Number.isInteger(index) && index >= 0;
        }
        return false;
    }

    private rustShadowKeyIsLiteral(key: any): boolean {
        if (key === undefined || !ts.isStringLiteralLike(key)) return false;
        const text = String(key.text);
        return this.rustShadowKeyLiteral(text) && !this.rustNodeIsKeyUnsafePlace(text);
    }

    /** Keys whose text is safe to inline into a rust string literal. */
    private rustShadowKeyLiteral(text: string): boolean {
        return /^[A-Za-z0-9_./-]*$/.test(text) && text.length > 0;
    }

    /** `this.safeString`-style callee of a call, or undefined. */
    private rustShadowSafeCallee(node: ts.CallExpression): string | undefined {
        const callee: any = (node as any).expression;
        if (callee === undefined || !ts.isPropertyAccessExpression(callee)) return undefined;
        if (callee.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        const name = String(callee.name.escapedText);
        return RUST_PARAM_SHADOWS.SAFE_READS.has(name) ? name : undefined;
    }

    /** `x['k']` / `x[i]` / `'k' in x` on a shadowed parameter: the native read,
     *  or undefined to keep the helper (the census guarantees it never happens
     *  for an emitted shadow). */
    printShadowContainerRead(shadow: RustParamShadow, keyNode: ts.Node): string | undefined {
        const key: any = keyNode;
        if (shadow.kind === RUST_PARAM_SHADOWS.MAP) {
            if (ts.isStringLiteralLike(key)) {
                const text = String(key.text);
                if (!this.rustShadowKeyLiteral(text) || this.rustNodeIsKeyUnsafePlace(text)) return undefined;
                return `${shadow.name}.get("${text}").cloned().unwrap_or(Value::Null)`;
            }
            if (ts.isIdentifier(key) && this.rustKeyIsProvenString(key) && !this.rustNodeIsKeyUnsafePlace(String(key.escapedText))) {
                const keyText = this.printNode(key, 0).trim();
                if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyText)) return undefined;
                return `${keyText}.as_str().and_then(|__k| ${shadow.name}.get(__k)).cloned().unwrap_or(Value::Null)`;
            }
            return undefined;
        }
        if (ts.isNumericLiteral(key)) {
            const index = Number(key.text);
            if (!Number.isInteger(index) || index < 0) return undefined;
            return `${shadow.name}.get(${index}).cloned().unwrap_or(Value::Null)`;
        }
        return undefined;
    }

    /** `'k' in x` on a shadowed dict parameter. */
    printShadowInOperator(shadow: RustParamShadow, keyNode: ts.Node): string | undefined {
        const key: any = keyNode;
        if (shadow.kind !== RUST_PARAM_SHADOWS.MAP) return undefined;
        if (ts.isStringLiteralLike(key)) {
            const text = String(key.text);
            if (!this.rustShadowKeyLiteral(text) || this.rustNodeIsKeyUnsafePlace(text)) return undefined;
            return `Value::Bool(${shadow.name}.contains_key("${text}"))`;
        }
        if (ts.isIdentifier(key) && this.rustKeyIsProvenString(key) && !this.rustNodeIsKeyUnsafePlace(String(key.escapedText))) {
            const keyText = this.printNode(key, 0).trim();
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyText)) return undefined;
            return `Value::Bool(${keyText}.as_str().map(|__k| ${shadow.name}.contains_key(__k)).unwrap_or(false))`;
        }
        return undefined;
    }

    /** `x.length` on a shadowed list parameter — `get_array_length` natively. */
    printShadowLength(shadow: RustParamShadow): string | undefined {
        if (shadow.kind !== RUST_PARAM_SHADOWS.LIST) return undefined;
        return `Value::Int(${shadow.name}.len() as i64)`;
    }

    /** `this.safe<Type>(x, 'k'[, default])` on a shadowed dict parameter: the
     *  runtime helper's exact semantics over `.get(..)`. */
    printShadowSafeReadCall(node: ts.CallExpression): string | undefined {
        const callee = this.rustShadowSafeCallee(node);
        if (callee === undefined) return undefined;
        const args: any[] = (node as any).arguments ?? [];
        if (args.length < 2 || args.length > 3) return undefined;
        const shadow = this.rustParamShadowOf(args[0]);
        if (shadow === undefined || shadow.kind !== RUST_PARAM_SHADOWS.MAP) return undefined;
        const key: any = args[1];
        if (!ts.isStringLiteralLike(key)) return undefined;
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
    rustProHandlerMessageParam(node: ts.Node): ts.ParameterDeclaration | undefined {
        if (node === undefined || !ts.isMethodDeclaration(node) || node.body === undefined) return undefined;
        const params: any[] = (node.parameters ?? []) as any;
        if (params.length < 2) return undefined;
        const methodName: any = node.name;
        if (methodName === undefined || !/^handle[A-Z]/.test(String(methodName.escapedText ?? ''))) return undefined;
        const param: any = params[1];
        if (param === undefined || !ts.isIdentifier(param.name) || param.type === undefined) return undefined;
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
        const name = String(param.name.escapedText);
        return this.rustProHandlerParamIsWritten(param, name) ? undefined : param;
    }

    /** D2: a write rooted at the parameter (reassignment, element/property
     *  write, a merge/splice onto it) can reshape the dict after the shadow is
     *  taken — the shadow is skipped and every read keeps the helper. */
    rustProHandlerParamIsWritten(param: ts.ParameterDeclaration, name: string): boolean {
        if (this.rustLocalIsReassigned(param, name)) return true;
        const scope = this.rustEnclosingFunction(param);
        if (scope === undefined) return true;
        const merging = ['deepExtend', 'extend', 'addElementToObject', 'remove'];
        let written = false;
        const visit = (n: ts.Node) => {
            if (written) return;
            if (ts.isBinaryExpression(n) && rustIsAssignmentOperator(n.operatorToken.kind) &&
                this.rootPlaceText(n.left) === name) {
                written = true;
                return;
            }
            if (ts.isCallExpression(n) && n.arguments.length > 0 && ts.isIdentifier(n.arguments[0]) &&
                (n.arguments[0] as any).escapedText === name) {
                const callee: any = n.expression;
                const calleeName = ts.isPropertyAccessExpression(callee) ? String(callee.name?.escapedText ?? '') :
                    ts.isIdentifier(callee) ? String(callee.escapedText ?? '') : '';
                if (merging.includes(calleeName)) {
                    written = true;
                    return;
                }
            }
            if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
                n.expression.name?.text === 'push' && this.rootPlaceText(n.expression.expression) === name) {
                written = true;
                return;
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return written;
    }

    /** Shadow plan for a handler: the parameter plus the two binding lines,
     *  present only when some body read actually turns native (no dead shed). */
    rustProHandlerShadowPlan(node: ts.Node, identation: number): { param: ts.ParameterDeclaration, lines: string } | undefined {
        const param = this.rustProHandlerMessageParam(node);
        if (param === undefined) return undefined;
        // a D-25 parameter shadow already rebinds the name to the borrowed map; its reads are native
        if (this.rustParamShadowTable(node).has(String((param.name as any).escapedText))) return undefined;
        const saved = this.rustProHandlerShadowParam;
        this.rustProHandlerShadowParam = param;
        let hasRead = false;
        const scope = this.rustEnclosingFunction(param);
        const visit = (n: ts.Node) => {
            if (hasRead) return;
            if (ts.isCallExpression(n) && this.printProHandlerShadowRead(n, true) !== undefined) {
                hasRead = true;
                return;
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        this.rustProHandlerShadowParam = saved;
        if (!hasRead) return undefined;
        const name = String((param.name as any).escapedText);
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
    printProHandlerShadowRead(node: ts.Node, probe = false): string | undefined {
        const param = this.rustProHandlerShadowParam;
        if (param === undefined || node === undefined || !ts.isCallExpression(node)) return undefined;
        const callee: any = node.expression;
        if (callee === undefined || !ts.isPropertyAccessExpression(callee)) return undefined;
        if (callee.expression.kind !== SyntaxKind.ThisKeyword) return undefined;
        const kind = RustTranspiler.PRO_HANDLER_SHADOW_SAFE_READS[String(callee.name?.escapedText ?? '')];
        if (kind === undefined) return undefined;
        const args: any[] = (node.arguments ?? []) as any;
        if (args.length < 2 || args.length > 3) return undefined;
        const receiver: any = args[0];
        if (receiver === undefined || receiver.kind !== SyntaxKind.Identifier) return undefined;
        if (this.rustDeclarationOfIdentifier(receiver) !== param) return undefined;
        const key: any = args[1];
        if (key === undefined || !ts.isStringLiteral(key)) return undefined;
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
    rustProHandlerShadowDefaultShape(node: ts.Node): boolean {
        return node.kind === SyntaxKind.StringLiteral || node.kind === SyntaxKind.NumericLiteral ||
            node.kind === SyntaxKind.TrueKeyword || node.kind === SyntaxKind.FalseKeyword ||
            node.kind === SyntaxKind.NullKeyword || node.kind === SyntaxKind.ArrayLiteralExpression ||
            node.kind === SyntaxKind.ObjectLiteralExpression ||
            (ts.isIdentifier(node) && (node as any).escapedText === 'undefined');
    }

    rustProHandlerShadowDefault(node: ts.Node): string | undefined {
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

    printNativeMapAccess(receiverText: string, receiverNode: ts.Node, keyText: string): string | undefined {
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

    rustDeclarationOfIdentifier(node: ts.Node): ts.Declaration | undefined {
        if (!ts.isIdentifier(node)) return undefined;
        try {
            const symbol: any = this.getChecker().getSymbolAtLocation(node);
            return symbol?.valueDeclaration;
        } catch (e) {
            return undefined;
        }
    }

    /** Initializer shapes that construct or return a plain dict. */
    rustDictProducingInitializer(node: ts.Node | undefined, seen: Set<ts.Node>): boolean {
        if (node === undefined || node === null || seen.has(node)) return false;
        seen.add(node);
        if (ts.isObjectLiteralExpression(node)) return true;
        if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
            ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node)) {
            return this.rustDictProducingInitializer((node as any).expression, seen);
        }
        if (ts.isIdentifier(node)) {
            const declaration: any = this.rustDeclarationOfIdentifier(node);
            if (declaration === undefined || !ts.isVariableDeclaration(declaration)) return false;
            return this.rustDictProducingInitializer(declaration.initializer, seen);
        }
        if (ts.isElementAccessExpression(node)) {
            // `this.markets[symbol]`: the container's declared element type is
            // what the rust port stores there.
            const containerType = this.getCheckedTypeOf((node as any).expression);
            if (containerType === undefined) return false;
            const elementType = this.getChecker().getIndexTypeOfType(containerType, ts.IndexKind.String);
            return elementType !== undefined && this.isProvenMapType(elementType);
        }
        if (!ts.isCallExpression(node)) return false;
        const callee: any = (node as any).expression;
        if (!ts.isPropertyAccessExpression(callee) || callee.expression.kind !== ts.SyntaxKind.ThisKeyword) {
            return false;
        }
        const name = String(callee.name.escapedText);
        // Readers whose rust counterpart returns the stored dict itself.
        if (name === 'safeDict' || name === 'safeMarketStructure' || name === 'market' ||
            name === 'currency' || name === 'safeMarket' || name === 'safeCurrency') {
            return true;
        }
        // `this.client(url)` returns the WS client handle Dict the runtime keeps
        // (`Map{url, subscriptions, futures}`), never a class instance.
        if (name === 'client') {
            return true;
        }
        // `extend`/`deepExtend` merge onto their first argument.
        if (name === 'extend' || name === 'deepExtend') {
            return this.rustDictProducingInitializer((node as any).arguments[0], seen);
        }
        return false;
    }

    /** D2: the proof holds only while nothing re-assigns the local. */
    rustLocalIsReassigned(declaration: ts.Declaration, name: string): boolean {
        let scope: ts.Node | undefined = declaration;
        while (scope !== undefined && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) {
            scope = scope.parent;
        }
        if (scope === undefined) return true;
        let reassigned = false;
        const visit = (node: ts.Node) => {
            if (reassigned) return;
            if (ts.isBinaryExpression(node)) {
                const operator = node.operatorToken.kind;
                if (operator >= SyntaxKind.FirstAssignment && operator <= SyntaxKind.LastAssignment &&
                    ts.isIdentifier(node.left) && node.left.text === name) {
                    reassigned = true;
                    return;
                }
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(scope, visit);
        return reassigned;
    }

    /** True when the receiver is a local declared as (or provably holding) a
     *  plain dict — `get_value(_k)` and this read agree on every key the
     *  runtime does not route elsewhere. */
    rustIsDeclaredDictLocal(node: ts.Node): boolean {
        const declaration: any = this.rustDeclarationOfIdentifier(node);
        if (declaration === undefined) return false;
        const name = declaration.name?.text;
        if (typeof name !== 'string') return false;
        if (ts.isParameter(declaration)) {
            // A `Client`-typed parameter is the WS handle passed to `handle_message`/`handle*`
            // (`ws_client::client_value`): a `Value::Dict{url, subscriptions, futures}` in the port, not
            // the TS class. Its fields are plain map reads.
            if (!this.rustParameterIsClientHandle(declaration)) {
                const fallback = declaration.initializer;
                if (fallback === undefined || !this.rustDictProducingInitializer(fallback, new Set())) return false;
            }
        } else if (ts.isVariableDeclaration(declaration)) {
            const initializer = declaration.initializer;
            if (initializer === undefined) return false;
            if (!this.rustDictProducingInitializer(initializer, new Set())) return false;
        } else {
            return false;
        }
        return !this.rustLocalIsReassigned(declaration, name);
    }

    /** A parameter declared as the ws `Client` class (or a union with it). The
     *  class is the default export of `ts/src/base/ws/Client.ts`, so its type
     *  symbol is named `default`; the declaration itself carries the name. */
    rustParameterIsClientHandle(declaration: ts.ParameterDeclaration): boolean {
        const named = (type: ts.Type | undefined): boolean => {
            if (type === undefined) return false;
            const symbol: any = this.typeSymbolOf(type);
            const declarations: any[] = symbol?.declarations ?? [];
            return declarations.some((d) => {
                if (!ts.isClassDeclaration(d) || d.name === undefined || d.name.text !== 'Client') return false;
                const file = String(d.getSourceFile().fileName).replace(/\\/g, '/');
                return file.endsWith('/ws/Client.ts') || file.endsWith('/ws/Client.d.ts');
            });
        };
        const type = this.getCheckedTypeOf(declaration.name);
        if (named(type)) return true;
        return ((type as any)?.types ?? []).some((member: ts.Type) => named(member));
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
    printNativeParseCall(node: ts.CallExpression): string | undefined {
        const callee = node.expression;
        if (!ts.isIdentifier(callee)) return undefined;
        const name = String(callee.escapedText);
        const helper = RustTranspiler.RUST_PARSE_HELPERS[name];
        if (helper === undefined) return undefined;
        if (node.arguments.length !== 1) return undefined; // radix / unknown arity
        const arg = node.arguments[0];
        const type = this.getCheckedTypeOf(arg);
        if (type === undefined || !this.isStringType(type.flags)) return undefined;
        if (ts.isStringLiteralLike(arg)) {
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

    isNodeInsideNode(node: ts.Node, container: ts.Node): boolean {
        return node.pos >= container.pos && node.end <= container.end;
    }

    /** Root place of an access chain (`x` for `x['a']['b']`, `this.balance` for
     *  `this.balance['usdt']`), or undefined for a temporary. */
    rootPlaceText(node: ts.Node): string | undefined {
        let current: any = node;
        while (current) {
            if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
                if (current.expression.kind === ts.SyntaxKind.ThisKeyword) return current.getText().trim();
                current = current.expression;
                continue;
            }
            if (ts.isParenthesizedExpression(current)) {
                current = current.expression;
                continue;
            }
            if (ts.isIdentifier(current) || current.kind === ts.SyntaxKind.ThisKeyword) {
                return current.getText().trim();
            }
            return undefined;
        }
        return undefined;
    }

    /** The ccxt post-passes hoist `get_value(...)` reads out of `&mut` calls by
     *  matching their text; the native form is invisible to them, so it is only
     *  emitted where no such hoist is needed. */
    isNativeAccessPositionSafe(node: ts.Node): boolean {
        const parent = node.parent;
        // `x['k'].push(...)` / `x['k'](...)`: the post-pass rewrites the target.
        if (parent && ts.isPropertyAccessExpression(parent) && parent.expression === node) return false;
        if (parent && ts.isCallExpression(parent) && parent.expression === node) return false;
        const root = this.rootPlaceText(node);
        let current: any = node.parent;
        while (current) {
            if (ts.isStatement(current) || ts.isSourceFile(current) || ts.isFunctionLike(current)) break;
            if (ts.isBinaryExpression(current) && this.isNodeInsideNode(node, current.right)) {
                const op = current.operatorToken.kind;
                const isAssign = op === ts.SyntaxKind.EqualsToken ||
                    (op >= ts.SyntaxKind.PlusEqualsToken && op <= ts.SyntaxKind.CaretEqualsToken);
                if (isAssign && root !== undefined && this.rootPlaceText(current.left) === root) return false;
            }
            if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression) &&
                this.isNodeInsideNode(node, current) && current.arguments.some(a => this.isNodeInsideNode(node, a))) {
                const callee = current.expression;
                // Same-place receiver (`x.push(x[0])`) is rewritten to `&mut x` args.
                if (root !== undefined && this.rootPlaceText(callee.expression) === root) return false;
                // `&mut self.<method>(...)` arg lists are hoisted by the ccxt
                // pass because a `&self` reborrow conflicts with the outer
                // `&mut self`. A read of a local or a parameter performs no
                if (callee.expression.kind === ts.SyntaxKind.ThisKeyword &&
                    RustTranspiler.MUT_SELF_METHODS.has(this.toSnakeCaseName(String(callee.name.escapedText))) &&
                    (root === undefined || root === 'this' || root.startsWith('this.'))) return false;
            }
            current = current.parent;
        }
        return true;
    }

    /** Receiver shapes whose printed text is a single `Value` place (`x`, `this.x`). */
    isShallowValueReceiver(node: ts.Node): boolean {
        if (ts.isIdentifier(node)) return true;
        return ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword;
    }

    /** True when this read is the receiver of an element-access chain that is
     *  written (`x['a'] = v`, `x['a']['b'] = v`, `delete x['a']['b']`), or a
     *  property write itself (`x.k = v`, `delete x.k`). The ccxt write passes
     *  match the `get_value(&…)` / `x.k` text to reach the real container, so a
     *  native read would write into a discarded clone. */
    isNativeWriteTargetBase(node: ts.Node): boolean {
        const parent: any = node.parent;
        if (parent === undefined) return false;
        if (ts.isBinaryExpression(parent) && parent.left === node && rustIsAssignmentOperator(parent.operatorToken.kind)) return true;
        if (ts.isDeleteExpression(parent)) return true;
        if (!ts.isElementAccessExpression(parent) || parent.expression !== node) return false;
        let current: any = parent;
        while (current.parent !== undefined && ts.isElementAccessExpression(current.parent) && current.parent.expression === current) {
            current = current.parent;
        }
        const top: any = current.parent;
        if (top === undefined) return false;
        if (ts.isDeleteExpression(top)) return true;
        return ts.isBinaryExpression(top) && top.left === current && rustIsAssignmentOperator(top.operatorToken.kind);
    }

    transformPropertyAcessExpressionIfNeeded(node) {
        const rightSide = node.name.escapedText;
        // Printed here (as before) so the receiver's loop-flag numbering in the
        // generated file matches the pinned baseline for non-length accesses.
        const leftExpr = this.printNode(node.expression, 0);
        if (rightSide === 'length') {
            const shadow = this.rustParamShadowOf(node.expression);
            if (shadow !== undefined) {
                const native = this.printShadowLength(shadow);
                if (native !== undefined) return native;
            }
            return this.printArrayLength(node, 0, leftExpr);
        }
        return undefined;
    }

    // `crate::value::get_value_k` is `get_value` for a `&str` key — the same
    // dict lookup minus the per-read `Value::Str` allocation. Three literal-key
    // families reach branches only `get_value` has (numeric cache/side indices,
    // the cache `hashmap` bucket, live client `subscriptions`/`futures`) and a
    // `this`/class receiver is not a `Value`, so those keep `get_value`.
    staticKeyLookup(node, container): string | undefined {
        if (!ts.isStringLiteral(node)) {
            return undefined;
        }
        // Test sources keep the allocating form: the test-only post-passes
        // pattern-match `get_value(&…, &Value::Str(…))` call sites.
        const source = (node as any).getSourceFile ? (node as any).getSourceFile().fileName : '';
        if (typeof source === 'string' && /\/test\//.test(source)) {
            return undefined;
        }
        if (container.kind === SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const text = node.text;
        if (text === '' || text in this.StringLiteralReplacements) {
            return undefined;
        }
        if (/^\d+$/.test(text) || text === 'hashmap' || text === 'subscriptions' || text === 'futures') {
            return undefined;
        }
        const checker: any = this.checkerOrUndefined();
        if (checker === undefined) {
            return undefined;
        }
        const type = checker.getTypeAtLocation(container);
        if (type !== undefined && ((type as any).objectFlags & ts.ObjectFlags.Class)) {
            return undefined;
        }
        return this.quotedStringLiteral(text);
    }

    printElementAccessExpression(node, identation) {
        const special = this.printElementAccessExpressionExceptionIfAny(node);
        if (special) return special;

        // `obj['x'] = v` is rewritten to `crate::set_value(...)` by a pass that
        // matches the `get_value(&obj, &key)` target shape, so targets and
        // computed reads keep that shape.
        const parent = node.parent;
        const isAssignmentTarget = parent !== undefined
            && ts.isBinaryExpression(parent)
            && parent.left === node
            && parent.operatorToken.kind >= SyntaxKind.FirstAssignment
            && parent.operatorToken.kind <= SyntaxKind.LastAssignment;

        // `d['a'].push(v)` lowers to `append_to_array(&mut <target>, v)` and the
        // ccxt pass that gives that append write-through semantics
        // (`append_to_object_array`) matches the target text literally
        // (`append_to_array(&mut get_value(&`), so a call/property target must
        // keep the allocating `get_value(&d, &Value::Str("a").to_string())`
        // form: the `get_value_k` spelling is invisible to that pass and the
        // append would land on a discarded COW clone.
        const isCallOrPropertyTarget = parent !== undefined
            && ((ts.isPropertyAccessExpression(parent) && parent.expression === node)
                || (ts.isCallExpression(parent) && parent.expression === node));

        const keys: any[] = [];
        const receivers: any[] = [];
        const containers: any[] = [];
        let baseExpr = null;
        let current: any = node;
        while (ts.isElementAccessExpression(current)) {
            keys.unshift(current.argumentExpression);
            receivers.unshift(current.expression);
            containers.unshift(current.expression);
            const expr = current.expression;
            if (!ts.isElementAccessExpression(expr)) {
                baseExpr = expr;
                break;
            }
            current = expr;
        }

        // One checker proof per chain: the emitted text replaces `get_value` only
        // when it is legal at the position the whole chain occupies.
        const nativeAllowed = this.isNativeAccessPositionSafe(node) && !this.isNativeWriteTargetBase(node);

        let acc = this.printNode(baseExpr, 0);
        keys.forEach((key, index) => {
            const native = nativeAllowed
                ? this.printNativeContainerAccess(acc, receivers[index], key)
                : undefined;
            if (native !== undefined) {
                acc = native;
                return;
            }
            const staticKey = (isAssignmentTarget || isCallOrPropertyTarget)
                ? undefined
                : this.staticKeyLookup(key, containers[index]);
            if (staticKey !== undefined) {
                acc = `crate::value::get_value_k(&${acc}, ${staticKey})`;
                return;
            }
            const kRef = `&${this.printNode(key, 0)}`;
            acc = `get_value(&${acc}, ${kRef})`;
        });
        return acc;
    }

    printForStatement(node, identation) {
        const initNode = node.initializer;
        const condNode = node.condition;
        const incrNode = node.incrementor;

        const idn = this.getIden(identation);
        const idn1 = this.getIden(identation + 1);

        const initStr = initNode ? this.printNode(initNode, identation + 1) + ';\n' : '';
        const condStr = condNode ? this.printComparisonInBooleanContext(condNode, 0).trim() : 'true';
        const incrStr = incrNode ? this.printNode(incrNode, 0) : '';

        const statements = node.statement.statements.map(s => this.printNode(s, identation + 1)).join('\n');
        const body = `{\n${statements}\n${idn}}`;

        // A C-style `for` becomes a Rust `while`. The increment must run on
        // every iteration *including* one ended by `continue` — a `continue`
        // re-evaluates the loop condition, so the increment is folded into
        // it (guarded by a first-iteration flag). Putting the increment at
        // the end of the body instead would let `continue` skip it and spin
        // the loop forever.
        if (incrStr !== '') {
            const flag = `__for_first_${this.forLoopCounter++}`;
            const cond = `{ if !${flag} { ${incrStr}; } ${flag} = false; ${condStr} }`;
            return `${idn}{\n${idn1}${initStr}${idn1}let mut ${flag}: bool = true;\n${idn1}while ${cond} ${body}\n${idn}}`;
        }
        return `${idn}{\n${idn1}${initStr}${idn1}while ${condStr} ${body}\n${idn}}`;
    }

    private static readonly COMPARISON_OPS = new Set([
        SyntaxKind.EqualsEqualsToken,
        SyntaxKind.EqualsEqualsEqualsToken,
        SyntaxKind.ExclamationEqualsToken,
        SyntaxKind.ExclamationEqualsEqualsToken,
        SyntaxKind.LessThanToken,
        SyntaxKind.LessThanEqualsToken,
        SyntaxKind.GreaterThanToken,
        SyntaxKind.GreaterThanEqualsToken,
    ]);

    // Comparison helpers that can be replaced by a native numeric operator.
    private static readonly NATIVE_COMPARISON_OPERATORS: Record<number, string> = {
        [SyntaxKind.LessThanToken]: '<',
        [SyntaxKind.LessThanEqualsToken]: '<=',
        [SyntaxKind.GreaterThanToken]: '>',
        [SyntaxKind.GreaterThanEqualsToken]: '>=',
    };

    printCondition(node, identation) {
        if (node.kind === SyntaxKind.BinaryExpression) {
            const opKind = node.operatorToken.kind;
            // Comparison binary expressions already return bool — skip is_true() wrapping
            if ((RustTranspiler as any).COMPARISON_OPS.has(opKind)) {
                return this.printComparisonInBooleanContext(node, identation);
            }
            // Logical &&/|| operands are individually is_true()-wrapped in
            // printBinaryExpression, so the whole expression is already bool —
            // unless one carries a native compare, which needs no is_true().
            if (opKind === SyntaxKind.AmpersandAmpersandToken ||
                opKind === SyntaxKind.BarBarToken) {
                if (this.hasNativeComparisonOperand(node.left) || this.hasNativeComparisonOperand(node.right)) {
                    return `${this.getIden(identation)}${this.printLogicalInBooleanContext(node)}`;
                }
                return `${this.getIden(identation)}${this.printNode(node, 0)}`;
            }
        }
        // `(a === b)` — a native payload compare is already bool; keep the
        // is_true() marker so the post-pass still sees a bool expression.
        // PrefixUnary ! — delegate to avoid double-wrapping
        if (node.kind === SyntaxKind.PrefixUnaryExpression &&
      node.operator === SyntaxKind.ExclamationToken) {
            return this.printPrefixUnaryExpression(node, identation);
        }
        // A call to a hand-written `-> bool` fn is already a Rust bool.
        if (this.rustCallPrintsBool(node)) {
            return `${this.getIden(identation)}${this.printNode(node, 0)}`;
        }
        // Checker-proved boolean Value (safe_bool / get_value): native matches!.
        const nativeTruthiness = this.printNativeTruthiness(node);
        if (nativeTruthiness !== undefined) {
            return `${this.getIden(identation)}${nativeTruthiness}`;
        }
        // B-26: an operand whose printer emission is already a Rust `bool`.
        const nativeCondition = this.printNativeParenthesizedCondition(node);
        if (nativeCondition !== undefined && this.rustConditionBoolSlot(node)) {
            return `${this.getIden(identation)}${nativeCondition}`;
        }
        const expression = this.printNode(node, 0);
        const peeled = this.peelValueBoolBox(this.stripOuterParens(expression));
        if (peeled !== undefined && this.rustConditionBoolSlot(node) &&
            !this.printedBoolHelperCall(this.stripOuterParens(peeled))) {
            return `${this.getIden(identation)}(${peeled})`;
        }
        return `${this.getIden(identation)}is_true(&${this.printTruthyArgument(expression)})`;
    }

    // B-26: `is_true(&(…)` on an operand the printer already emits as a native Rust `bool` (payload
    // compares, `matches!` predicates, `&&`/`||` of those) is the identity (`IsTruthy for bool`);
    // native text has no helper token, so it is emitted only in a bool slot (`isBareBoolEmissionSafe`).

    /** Bool-slot text of a parenthesised native comparison/predicate, else undefined. */
    printNativeParenthesizedCondition(node): string | undefined {
        const inner = this.unwrapParens(node);
        if (inner === undefined || inner === node || inner.kind !== SyntaxKind.BinaryExpression) {
            return undefined;
        }
        const op = inner.operatorToken.kind;
        if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken) {
            // Every operand of a logical already prints a bool; keep the wrapper
            // when they are all helper-led (the post-passes key on that token).
            if (!this.hasNativeComparisonOperand(inner.left) && !this.hasNativeComparisonOperand(inner.right)) {
                return undefined;
            }
            return `(${this.printLogicalInBooleanContext(inner)})`;
        }
        if (!(RustTranspiler as any).COMPARISON_OPS.has(op)) {
            return undefined;
        }
        // `typeof x === 'string'` prints the same native predicate as `x in obj`.
        if (inner.left.kind === SyntaxKind.TypeOfExpression) {
            const native = this.nativeValuePredicateText(inner.right.text, inner.left.expression,
                this.printNode(inner.left.expression, 0));
            if (native === undefined) {
                return undefined;
            }
            const isDiff = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
            return `(${isDiff ? '!' : ''}${native})`;
        }
        if (op === SyntaxKind.EqualsEqualsToken || op === SyntaxKind.EqualsEqualsEqualsToken ||
            op === SyntaxKind.ExclamationEqualsToken || op === SyntaxKind.ExclamationEqualsEqualsToken) {
            const native = this.nativeEqualityText(inner);
            return native === undefined ? undefined : `(${native})`;
        }
        const native = this.printNativeOrderedComparison(inner, op, inner.left, inner.right);
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
                i++;
                while (i < parsedArgs.length && parsedArgs[i] !== '"') {
                    if (parsedArgs[i] === '\\') i++;
                    i++;
                }
                continue;
            }
            if (char === '(' || char === '[' || char === '{') depth++;
            else if (char === ')' || char === ']' || char === '}') depth--;
            else if (char === ',' && depth === 0) {
                return [parsedArgs.slice(0, i), parsedArgs.slice(i)];
            }
        }
        return [parsedArgs, ''];
    }

    // Bool-position text for a comparison: the native payload compare (already
    // bool) when the checker proves it, the is_equal() helper otherwise.
    printComparisonInBooleanContext(node, identation) {
        const native = this.nativeEqualityText(node);
        if (native) {
            return `${this.getIden(identation)}(${native})`;
        }
        return `${this.getIden(identation)}${this.printNode(node, 0)}`;
    }

    // Native equality text of `node` (parens unwrapped), if the checker proves it.
    nativeEqualityText(node) {
        const inner = this.unwrapParens(node);
        if (inner === undefined || inner.kind !== SyntaxKind.BinaryExpression) {
            return undefined;
        }
        const op = inner.operatorToken.kind;
        if (op !== SyntaxKind.EqualsEqualsToken && op !== SyntaxKind.EqualsEqualsEqualsToken &&
            op !== SyntaxKind.ExclamationEqualsToken && op !== SyntaxKind.ExclamationEqualsEqualsToken) {
            return undefined;
        }
        return this.printNativeEqualityComparison(inner.left, inner.right, op);
    }

    unwrapParens(node) {
        let inner = node;
        while (inner !== undefined && inner.kind === SyntaxKind.ParenthesizedExpression) {
            inner = inner.expression;
        }
        return inner;
    }

    // Does `node` carry a native payload compare in a position where the old
    // text started with a bool helper? The post-pass types locals by that token.
    hasNativeComparisonOperand(node) {
        const inner = this.unwrapParens(node);
        if (inner === undefined) {
            return false;
        }
        if (inner.kind === SyntaxKind.PrefixUnaryExpression &&
            inner.operator === SyntaxKind.ExclamationToken) {
            return this.hasNativeComparisonOperand(inner.operand);
        }
        if (this.nativeEqualityText(inner) !== undefined) {
            return true;
        }
        if (inner.kind === SyntaxKind.BinaryExpression) {
            const op = inner.operatorToken.kind;
            if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken) {
                return this.hasNativeComparisonOperand(inner.left) || this.hasNativeComparisonOperand(inner.right);
            }
        }
        return false;
    }

    // Bare `&&`/`||` text of a logical expression (its operands are bools).
    printLogicalInBooleanContext(node) {
        const token = node.operatorToken.kind === SyntaxKind.AmpersandAmpersandToken ? '&&' : '||';
        const left = this.printCondition(node.left, 0).trim();
        const right = this.printCondition(node.right, 0).trim();
        return `${left} ${token} ${right}`;
    }

    printWhileStatement(node, identation) {
        const expr = this.printCondition(node.expression, 0);
        const body = this.printBlock(node.statement, identation);
        return `${this.getIden(identation)}while ${expr}${body}`;
    }

    printIfStatement(node, identation) {
        const expression = this.printCondition(node.expression, 0);
        const elseExists = node.elseStatement !== undefined;
        const ifBody = this.printBlock(node.thenStatement, identation, elseExists);

        let ifComplete = `${expression}${ifBody}`;
        const isElseIf = node.parent.kind === SyntaxKind.IfStatement;
        if (isElseIf) {
            ifComplete = `else if ${ifComplete}`;
        } else {
            ifComplete = `${this.getIden(identation)}if ${ifComplete}`;
        }

        const elseStatement = node.elseStatement;
        if (elseStatement?.kind === SyntaxKind.Block) {
            ifComplete += ` else${this.printBlock(elseStatement, identation)}`;
        } else if (elseStatement?.kind === SyntaxKind.IfStatement) {
            ifComplete += ' ' + this.printIfStatement(elseStatement, identation);
        }
        return this.printNodeCommentsIfAny(node, identation, ifComplete);
    }

    printPostFixUnaryExpression(node, identation) {
        const { operand, operator } = node;
        const operandText = this.printNode(operand, 0);
        if (operator === SyntaxKind.PlusPlusToken) {
            const native = this.printNativeIncrement(SyntaxKind.PlusToken, operand, operandText);
            if (native !== undefined) {
                return `${this.getIden(identation)}${operandText} = ${native}`;
            }
            return `${this.getIden(identation)}${operandText} = add(&${operandText}, &Value::Int(1))`;
        }
        if (operator === SyntaxKind.MinusMinusToken) {
            const native = this.printNativeIncrement(SyntaxKind.MinusToken, operand, operandText);
            if (native !== undefined) {
                return `${this.getIden(identation)}${operandText} = ${native}`;
            }
            return `${this.getIden(identation)}${operandText} = subtract(&${operandText}, &Value::Int(1))`;
        }
        return super.printPostFixUnaryExpression(node, identation);
    }

    // `x++` / `x--` on a checker-typed number: native `+`/`-` with `Value::Int(1)`.
    printNativeIncrement(op, operand, operandText: string): string | undefined {
        try {
            if (!this.isNumberLikeType(this.getChecker().getTypeAtLocation(operand))) {
                return undefined;
            }
        } catch (e) {
            return undefined;
        }
        return this.printNativeNumeric(op, operandText, 'Value::Int(1)');
    }

    printPrefixUnaryExpression(node, identation) {
        const { operand, operator } = node;
        if (operator === SyntaxKind.ExclamationToken) {
            return this.getIden(identation) + '!' + this.printCondition(node.operand, 0);
        }
        if (operator === SyntaxKind.MinusToken) {
            const operandText = this.printNode(operand, 0);
            const folded = this.foldNegateLiteral(operandText);
            if (folded !== undefined) {
                return this.getIden(identation) + folded;
            }
            return this.getIden(identation) + `negate(&${operandText})`;
        }
        return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printNode(operand, 0);
    }

    printObjectLiteralExpression(node, identation) {
        if (node.properties.length === 0) {
            return 'Value::Map({\n' + this.getIden(identation + 1) + 'let mut m = std::collections::HashMap::new();\n' + this.getIden(identation + 1) + 'm\n' + this.getIden(identation) + '})';
        }
        const escapeKey = (s: any): string => {
            return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        };
        const lines = node.properties.map(p => {
            // Shorthand: { foo }  →  m.insert("foo", foo.clone());
            if (ts.isShorthandPropertyAssignment(p)) {
                const name = p.name.escapedText;
                return `${this.getIden(identation + 2)}m.insert("${escapeKey(name)}".to_string(), ${name}.clone());`;
            }
            const { name, initializer } = p;
            const keyText = ts.isStringLiteral(name) ? name.text : name.escapedText;
            const valText = this.printNode(initializer, 0);
            return `${this.getIden(identation + 2)}m.insert("${escapeKey(keyText)}".to_string(), ${valText});`;
        }).join('\n');
        return `Value::Map({\n${this.getIden(identation + 1)}let mut m = std::collections::HashMap::new();\n${lines}\n${this.getIden(identation + 1)}m\n${this.getIden(identation)}})`;
    }

    printArrayLiteralExpression(node, identation) {
        const elements = node.elements.map(e => this.printNode(e, 0)).join(', ');
        return `Value::from(vec![${elements}])`;
    }

    printDeleteExpression(node, identation) {
        const object = this.printNode(node.expression.expression, 0);
        const key = this.printNode(node.expression.argumentExpression, 0);
        const keyRef = key.startsWith('Value::') ? `&${key}` : `&${key}`;
        return `remove(&mut ${object}, ${keyRef})`;
    }

    printInstanceOfExpression(node, identation) {
        const left = this.printNode(node.left, 0);
        const right = this.printNode(node.right, 0);
        return `${this.getIden(identation)}is_instance(&${left}, &${right})`;
    }

    printConditionalExpression(node, identation) {
        const condition = this.printCondition(node.condition, 0);
        const whenTrue = this.printTernaryArm(node.whenTrue);
        const whenFalse = this.printTernaryArm(node.whenFalse);
        // `ternary` is `if cond { a } else { b }` over `Value`; the arms are
        // normalized to `Value` below, so the native form matches it and
        // evaluates only the taken arm (TS semantics).
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
        for (;;) {
            if (!(value.startsWith('(') && value.endsWith(')'))) {
                break;
            }
            let depth = 0;
            let wrapsWhole = true;
            for (let i = 0; i < value.length; i++) {
                if (value[i] === '(') {
                    depth++;
                } else if (value[i] === ')') {
                    depth--;
                    if (depth === 0 && i < value.length - 1) {
                        wrapsWhole = false;
                        break;
                    }
                }
            }
            if (!wrapsWhole) {
                break;
            }
            value = value.slice(1, -1).trim();
        }
        if (value.startsWith('!')) {
            value = value.slice(1).trim();
        }
        return RustTranspiler.BOOL_VALUE_PREFIXES.some((fn) => value.startsWith(fn + '('));
    }

    // An if-expression arm keeps the type `ternary()`'s `Value` parameters gave
    // it: box bool expressions, and clone bare identifiers so the arm does not
    // move a local the caller still uses.
    printTernaryArm(node, identation = 0) {
        const text = this.printNode(node, identation);
        const trimmed = text.trim();
        if (RustTranspiler.isBoolValueExpression(trimmed)) {
            return `Value::Bool(${trimmed})`;
        }
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed) &&
            trimmed !== 'self' && trimmed !== 'true' && trimmed !== 'false') {
            return `${trimmed}.clone()`;
        }
        return text;
    }

    // Built-in method call overrides
    printArrayIsArrayCall(node, identation, parsedArg = undefined) {
        const native = this.nativeValuePredicateText('array', node?.arguments?.[0], parsedArg);
        if (native !== undefined) {
            return `Value::Bool(${native})`;
        }
        return `Value::Bool(is_array(&${parsedArg}))`;
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

    printPromiseAllCall(node, identation, parsedArg = undefined) {
        // No trailing `.await` here — when the TS source has
        // `await Promise.all(...)`, `printAwaitExpression` will append it.
        // Adding it here too would produce `.await.await` (double-await).
        return `promise_all(&${parsedArg})`;
    }

    // Rust uses postfix `.await`; the base transpiler defaults to prefix.
    printAwaitExpression(node, identation) {
        const expr = this.printNode(node.expression, identation);
        return `${expr}.await`;
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
        const pRef = parsedArg?.startsWith('Value::') ? `&${parsedArg}` : `&${parsedArg}`;
        return `Value::Bool(contains(&${name}, ${pRef}))`;
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        const native = this.printNativeStringIndexOf(node, name);
        if (native !== undefined) {
            return native;
        }
        return `get_index_of(&${name}, &${parsedArg})`;
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
        const native = this.printNativeStringSlice(node, name);
        if (native !== undefined) {
            return native;
        }
        const arg2 = parsedArg2 ?? 'Value::Null';
        return `slice(&${name}, &${parsedArg}, &${arg2})`;
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `replace_str(&${name}, &${parsedArg}, &${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `replace_all_str(&${name}, &${parsedArg}, &${parsedArg2})`;
    }

    printThrowStatement(node, identation) {
        const expression = this.printNode(node.expression, 0);
        // `{}` (Display) renders an ExchangeError as `[Kind] message`;
        // `{:?}` would dump the struct fields.
        return `${this.getIden(identation)}panic!("{}", ${expression});`;
    }

    printTryStatement(node, identation) {
        const tryBody = node.tryBlock.statements.map(s => this.printNode(s, identation + 1)).join('\n');
        const catchBody = node.catchClause.block.statements.map(s => this.printNode(s, identation + 1)).join('\n');
        const rawName = node.catchClause?.variableDeclaration?.name?.escapedText;
        const errorName = rawName ? `_${rawName}` : '_e';
        const iden = this.getIden(identation);
        return `${iden}let _try_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {\n${tryBody}\n${iden}}));\n${iden}if let Err(${errorName}) = _try_result {\n${catchBody}\n${iden}}`;
    }

    printReturnStatement(node, identation) {
        const exp = node.expression;
        if (!exp) {
            return `${this.getIden(identation)}return;`;
        }
        // `return X;` inside a native-`Option<String>` method: the printed
        // expression is still the `Value` box, so convert it back to the
        // native payload (a nullish literal is the `None` arm).
        const fn: any = ts.findAncestor(node.parent, ts.isFunctionLike);
        if (this.rustNativeStrReturnKind(fn) === 'str' && this.rustStrReturnValueConverts(exp)) {
            const inner = this.unwrapParensNode(exp);
            if (this.literalKindOfNode(inner) === 'null') {
                return `${this.getIden(identation)}return None;`;
            }
            const text = this.printNode(exp, 0).trim();
            const suffix = this.rustStrNativeExpression(exp) ? '' : '.as_str().map(str::to_owned)';
            return `${this.getIden(identation)}return ${text}${suffix};`;
        }
        const rightPart = this.printNode(exp, 0).trim();
        return `${this.getIden(identation)}return ${rightPart};`;
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
        const expression = this.printNode(node.expression, 0);
        return `${this.getIden(identation)}${expression}`;
    }
}
