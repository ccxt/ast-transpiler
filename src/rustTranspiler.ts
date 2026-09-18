import { BaseTranspiler } from "./baseTranspiler.js";
import ts from 'typescript';

const SyntaxKind = ts.SyntaxKind;

const parserConfig = {
    'ELSEIF_TOKEN': 'else if',
    'OBJECT_OPENING': '{',
    'OBJECT_CLOSING': '}',
    'ARRAY_OPENING_TOKEN': 'Value::List(vec![',
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
        return `Value::Str(${this.quotedStringLiteral(text)}.to_string())`;
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

    // A string literal whose text parses as a number — is_equal() coerces those
    // against numeric/bool operands, a plain string compare does not.
    stringLiteralCoercesToNumber(node): boolean {
        const text = node.text;
        if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) {
            return true;
        }
        return /^[+-]?(inf|infinity|nan)$/i.test(text);
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
            if (!this.printsValueExpression(other)) {
                return undefined;
            }
            const otherKind = this.primitiveKindOfType(this.getChecker().getTypeAtLocation(other));
            if (literalKind === 'null') {
                // Exact for every runtime value: is_equal(x, null) is true only
                // when x is Null, and the derived PartialEq says the same.
                return `${this.printNode(other, 0)} ${operator} Value::Null`;
            }
            if (literalKind === 'string') {
                if (literal.text in this.StringLiteralReplacements) {
                    return undefined;
                }
                if (this.stringLiteralCoercesToNumber(literal) && otherKind !== 'string') {
                    return undefined;
                }
                return `${this.printNode(other, 0)}.as_str() ${operator} Some(${this.quotedStringLiteral(literal.text)})`;
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
                if (otherKind !== 'boolean') {
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
        try {
            return this.getChecker().getTypeAtLocation(node);
        } catch (e) {
            return undefined;
        }
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
        return this.getChecker().isArrayType(type)
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

    // Object-typed values are Dicts at runtime, so `key in obj` is a plain
    // key lookup. Arrays keep the helper: `in_op` searches them element-wise.
    isDictShapedType(type: ts.Type | undefined): boolean {
        if (type === undefined || !(type.flags & ts.TypeFlags.Object)) {
            return false;
        }
        const checker = this.getChecker();
        if (checker.isArrayType(type) || checker.isTupleType(type) || checker.isArrayLikeType(type)) {
            return false;
        }
        const objectFlags = (type as ts.ObjectType).objectFlags;
        if (objectFlags & (ts.ObjectFlags.Class | ts.ObjectFlags.Reference)) {
            return false;
        }
        return type.getCallSignatures().length === 0;
    }

    // `"key" in obj` → `matches!(&obj, Value::Dict(__d) if __d.contains_key("key"))`
    // In the TS AST `key` is the left operand and `obj` the right one.
    printNativeInOperator(key, obj) {
        if (!ts.isStringLiteral(key)) {
            return undefined;
        }
        if (!this.isDictShapedType(this.typeOfNodeIfAny(obj))) {
            return undefined;
        }
        const printedKey = this.printStringLiteral(key);
        const keyLiteral = printedKey.match(/^Value::Str\((.+)\.to_string\(\)\)$/);
        if (!keyLiteral) {
            return undefined;
        }
        const objExpr = this.printNode(obj, 0);
        return `Value::Bool(matches!(&${objExpr}, Value::Dict(__d) if __d.contains_key(${keyLiteral[1]})))`;
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

    // ── native arithmetic (`+ - * /`) ────────────────────────────────────────
    // When the checker proves both operands are numbers (`Int`/`Float` at
    // runtime) or, for `+`, both are strings, the helper call is replaced by
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
        if (op === SyntaxKind.PlusToken && this.isStringLikeType(leftType) && this.isStringLikeType(rightType)) {
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
        if (op === SyntaxKind.PlusToken && this.isStringLikeType(leftType) && this.isStringLikeType(rightType)) {
            return this.printNativeStringConcat(leftText, rightText);
        }
        if (!this.isNumberLikeType(leftType) || !this.isNumberLikeType(rightType)) {
            return undefined;
        }
        return this.printNativeNumeric(op, leftText, rightText);
    }

    printNativeStringConcat(leftText: string, rightText: string): string {
        return `Value::Str(format!("{}{}", ${leftText}, ${rightText}))`;
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
            const nativeList = this.isProvenListExpression(right);
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
            return `add_element_to_object(${acc}, &${lastKey}, ${rhs})`;
        }

        // Handle typeof comparisons
        if (left.kind === SyntaxKind.TypeOfExpression) {
            const expression = left.expression;
            const rightText = right.text;
            const target = this.printNode(expression, 0);
            const isDiff = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
            const not = isDiff ? '!' : '';
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
            if (nativeOperator !== undefined && this.isNumberTyped(left) && this.isNumberTyped(right)) {
                return this.printNativeNumericComparison(node, nativeOperator, this.printNode(left, 0), this.printNode(right, 0));
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
            const nativeList = this.isProvenListExpression(declaration.initializer);
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

    // `Value::Bool(<expr>)` spanning the whole expression → `<expr>`.
    peelValueBoolBox(printedValue: string): string | undefined {
        const prefix = 'Value::Bool(';
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

    // ── declared-Dict locals (`let x: Value = self.safe_dict_k(..)`) ───────────
    //
    // The printer declares non-bool locals `Value`, and the checker types a
    // `safe_dict*` result `object | undefined`, so `get_value` / `in_op` /
    // `add_element_to_object` consumers cannot prove a Dict from the checker.
    // This table supplies the proof from the printer side and leaves the
    // declaration `Value`: the initialiser is a `safe_dict*` call whose
    // `optionalArgs` default is itself Dict-proven (the helper returns that
    // default whenever the key does not hold a Dict, so the local is a Dict on
    // every path), or a `Value::Map(..)` object literal; and no later write in
    // the enclosing function can change the kind (D2).
    //
    // Consumers ask `rustDeclaredLocalTypeResolver(node)` for the receiver of a
    // `get_value`/`get_value_k`/`in_op`/`add_element_to_object` call. A native
    // `HashMap<String, Value>` *declaration* is deliberately NOT emitted: it
    // would need a runtime `Value::Dict(Arc<..>)` -> `HashMap` conversion the
    // runtime does not have, and every use that passes the local to a `&Value`
    // helper would stop compiling.

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
        try {
            return this.getChecker().getSymbolAtLocation(node);
        } catch (e) {
            return undefined;
        }
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
        let parent: any = current.parent;
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
        const statements = node.body.statements.map(s => this.printNode(s, identation + 2)).join('\n');
        const body = blockOpen + optionalInits + statements + blockClose;

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
        if (outOfOrder) return outOfOrder;

        return super.printCallExpression(node, identation);
    }

    printThisKeyword(node, identation) {
        return 'self';
    }

    printNewExpression(node, identation) {
        let expression = node.expression?.escapedText;
        expression = expression ? expression : this.printNode(node.expression);
        const args = node.arguments.map(a => this.printNode(a, identation)).join(', ');
        // Plain `new Error(msg)` becomes just the message Value so it can be
        // formatted by `panic!("{:?}", ...)` in printThrowStatement.
        if (expression === 'Error') {
            return args || 'Value::Null';
        }
        // CCXT exception classes end in "Error", "Required", "Found", etc. and
        // are constructed via `new XError(msg)`. Route them through the runtime
        // error constructors (snake_case fn calls).
        const errorClassPattern = /^(?:[A-Z][a-zA-Z]*(?:Error|Required|Found|Failed|Rejected|Available|Exceeded|Limit|Pending|Funds|Address|Order|Cached|Fillable|Closed|Maintenance|Nonce|Timeout|Response|Settings|User|Supported|Implemented|Denied|Enabled|Suspended|Symbol|Change|Unavailable|Proxy|Set|Needed))$/;
        if (typeof expression === 'string' && errorClassPattern.test(expression)) {
            const snake = expression
                .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
                .replace(/([a-z\d])([A-Z])/g, '$1_$2')
                .toLowerCase();
            return `crate::exchange_errors::${snake}(${args})`;
        }
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
            this.isNativeAccessPositionSafe(node)) {
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

    toSnakeCaseName(name: string): string {
        return name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase();
    }

    escapeRustStringLiteral(text: string): string {
        return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    }

    getCheckedTypeOf(node): ts.Type | undefined {
        try {
            return this.getChecker().getTypeAtLocation(node);
        } catch (e) {
            return undefined;
        }
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
        if (!(type.flags & ts.TypeFlags.Object)) return false;
        if (this.isProvenListType(type)) return false;
        if (this.hasCallableShape(type)) return false;
        if (this.isClassInstanceType(type)) return false;
        if (this.isLibDeclaredType(type)) return false;
        // A named type or a string index signature; a bare `object` proves nothing.
        const hasStringIndex = this.getChecker().getIndexTypeOfType(type, ts.IndexKind.String) !== undefined;
        return hasStringIndex || this.typeSymbolOf(type) !== undefined;
    }

    isProvenMapExpression(node: ts.Node): boolean {
        const type = this.getCheckedTypeOf(node);
        return type !== undefined && this.isProvenMapType(type);
    }

    isProvenListExpression(node: ts.Node): boolean {
        const type = this.getCheckedTypeOf(node);
        return type !== undefined && this.isProvenListType(type);
    }

    /** Native list-index read of a generator temp (`__destr_tmp.as_array()…`). */
    printNativeListIndex(receiverText: string, index: number): string {
        return `${receiverText}.as_array().and_then(|__arr| __arr.get(${index})).cloned().unwrap_or(Value::Null)`;
    }

    /** Native read for one chain level, or undefined to keep `get_value`. */
    printNativeContainerAccess(receiverText: string, receiverNode: ts.Node, keyNode: ts.Node): string | undefined {
        if (ts.isStringLiteralLike(keyNode)) {
            return this.printNativeMapAccess(receiverText, receiverNode, keyNode.text);
        }
        if (ts.isNumericLiteral(keyNode)) {
            const index = Number(keyNode.text);
            if (!Number.isInteger(index) || index < 0) return undefined;
            if (!this.isProvenListExpression(receiverNode)) return undefined;
            return this.printNativeListIndex(receiverText, index);
        }
        return undefined;
    }

    printNativeMapAccess(receiverText: string, receiverNode: ts.Node, keyText: string): string | undefined {
        if (!this.isProvenMapExpression(receiverNode)) return undefined;
        const key = this.escapeRustStringLiteral(keyText);
        return `${receiverText}.as_map().and_then(|__m| __m.get("${key}")).cloned().unwrap_or(Value::Null)`;
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
                // `&mut self.<method>(...)` arg lists are hoisted by the ccxt pass.
                if (callee.expression.kind === ts.SyntaxKind.ThisKeyword &&
                    RustTranspiler.MUT_SELF_METHODS.has(this.toSnakeCaseName(String(callee.name.escapedText)))) return false;
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

    transformPropertyAcessExpressionIfNeeded(node) {
        const rightSide = node.name.escapedText;
        // Printed here (as before) so the receiver's loop-flag numbering in the
        // generated file matches the pinned baseline for non-length accesses.
        const leftExpr = this.printNode(node.expression, 0);
        if (rightSide === 'length') {
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
        let type;
        try {
            type = this.getChecker().getTypeAtLocation(container);
        } catch (e) {
            return undefined;
        }
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
        const nativeAllowed = this.isNativeAccessPositionSafe(node);

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
        const expression = this.printNode(node, 0);
        return `${this.getIden(identation)}is_true(&${expression})`;
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
        return `Value::List(vec![${elements}])`;
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
