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

    printStringLiteral(node) {
        let text = node.text;
        if (text in this.StringLiteralReplacements) {
            return this.StringLiteralReplacements[text];
        }
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
        return `Value::Str("${text}".to_string())`;
    }

    printNumericLiteral(node) {
        const text = node.text;
        if (text.includes('.')) {
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

    // Ensure a & ref prefix — skip only if already a reference
    ensureRef(expr: string): string {
        if (expr.startsWith('&')) {
            return expr;
        }
        return `&${expr}`;
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
            const assignments = elements.map((e, idx) => {
                const target = this.printNode(e, 0);
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
            return `Value::Bool(in_op(&${this.printNode(right, 0)}, &${this.printNode(left, 0)}))`;
        }

        // Handle += for regular variables
        if (op === SyntaxKind.PlusEqualsToken && left.kind !== SyntaxKind.ElementAccessExpression) {
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);
            return `${leftText} = add(&${leftText}, &${rightText})`;
        }

        // Handle -= for regular variables
        if (op === SyntaxKind.MinusEqualsToken && left.kind !== SyntaxKind.ElementAccessExpression) {
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);
            return `${leftText} = subtract(&${leftText}, &${rightText})`;
        }

        // Binary wrapper functions (is_equal, add, etc.) - add & to both sides
        if (op in this.binaryExpressionsWrappers) {
            const [fnName, close] = this.binaryExpressionsWrappers[op];
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);
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
            parsedElements.forEach((e, idx) => {
                const line = `${this.getIden(identation)}let mut ${e}: Value = get_value(&${syntheticName}, &Value::Int(${idx}))`;
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

        return `${this.getIden(identation)}let mut ${varName}: Value = ${parsedValue}`;
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
            const type = global.checker.getReturnTypeOfSignature(global.checker.getSignatureFromDeclaration(node));
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
            return `get_array_length(&${leftExpr})`;
        }

        return `${leftExpr}.${rightSide}`;
    }

    transformPropertyAcessExpressionIfNeeded(node) {
        const rightSide = node.name.escapedText;
        const leftExpr = this.printNode(node.expression, 0);
        if (rightSide === 'length') {
            return `get_array_length(&${leftExpr})`;
        }
        return undefined;
    }

    printElementAccessExpression(node, identation) {
        const special = this.printElementAccessExpressionExceptionIfAny(node);
        if (special) return special;

        const keys: any[] = [];
        let baseExpr = null;
        let current: any = node;
        while (ts.isElementAccessExpression(current)) {
            keys.unshift(current.argumentExpression);
            const expr = current.expression;
            if (!ts.isElementAccessExpression(expr)) {
                baseExpr = expr;
                break;
            }
            current = expr;
        }

        const containerStr = this.printNode(baseExpr, 0);
        const keyStrs = keys.map(k => this.printNode(k, 0));

        let acc = containerStr;
        keyStrs.forEach(k => {
            const kRef = k.startsWith('Value::') ? `&${k}` : `&${k}`;
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
        const condStr = condNode ? this.printNode(condNode, 0) : 'true';
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

    printCondition(node, identation) {
        if (node.kind === SyntaxKind.BinaryExpression) {
            const opKind = node.operatorToken.kind;
            // Comparison binary expressions already return bool — skip is_true() wrapping
            if ((RustTranspiler as any).COMPARISON_OPS.has(opKind)) {
                return `${this.getIden(identation)}${this.printNode(node, 0)}`;
            }
            // Logical &&/|| operands are individually is_true()-wrapped in
            // printBinaryExpression, so the whole expression is already bool.
            if (opKind === SyntaxKind.AmpersandAmpersandToken ||
                opKind === SyntaxKind.BarBarToken) {
                return `${this.getIden(identation)}${this.printNode(node, 0)}`;
            }
        }
        // PrefixUnary ! — delegate to avoid double-wrapping
        if (node.kind === SyntaxKind.PrefixUnaryExpression &&
      node.operator === SyntaxKind.ExclamationToken) {
            return this.printPrefixUnaryExpression(node, identation);
        }
        const expression = this.printNode(node, 0);
        return `${this.getIden(identation)}is_true(&${expression})`;
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
            return `${this.getIden(identation)}${operandText} = add(&${operandText}, &Value::Int(1))`;
        }
        if (operator === SyntaxKind.MinusMinusToken) {
            return `${this.getIden(identation)}${operandText} = subtract(&${operandText}, &Value::Int(1))`;
        }
        return super.printPostFixUnaryExpression(node, identation);
    }

    printPrefixUnaryExpression(node, identation) {
        const { operand, operator } = node;
        if (operator === SyntaxKind.ExclamationToken) {
            return this.getIden(identation) + '!' + this.printCondition(node.operand, 0);
        }
        if (operator === SyntaxKind.MinusToken) {
            return this.getIden(identation) + `negate(&${this.printNode(operand, 0)})`;
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
        const whenTrue = this.printNode(node.whenTrue, 0);
        const whenFalse = this.printNode(node.whenFalse, 0);
        return `ternary(${condition}, ${whenTrue}, ${whenFalse})`;
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
