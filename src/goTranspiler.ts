import { BaseTranspiler } from "./baseTranspiler.js";
import ts, { BinaryExpression, CallExpression, TypeChecker } from 'typescript';

const SyntaxKind = ts.SyntaxKind;

const parserConfig = {
    'ELSEIF_TOKEN': 'else if',
    'OBJECT_OPENING': 'map[string]any {',
    'ARRAY_OPENING_TOKEN': '[]any{',
    'ARRAY_CLOSING_TOKEN': '}',
    'PROPERTY_ASSIGNMENT_TOKEN': ':',
    'VAR_TOKEN': 'object', // object
    'METHOD_TOKEN': 'func',
    'PROPERTY_ASSIGNMENT_OPEN': '',
    'PROPERTY_ASSIGNMENT_CLOSE': '',
    'SUPER_TOKEN': 'base',
    'SUPER_CALL_TOKEN': 'base',
    'FALSY_WRAPPER_OPEN': 'IsTrue(',
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

// Go static type of the value each base helper returns. A local initialised by
// one of these already holds that concrete type inside its `any` box, so naming
// the type at the declaration site keeps the very same runtime value and only
// refines what the Go compiler knows about it.
const GO_HELPER_RETURN_TYPES: { [name: string]: string } = {
    'GetArrayLength': 'int',
    'GetIndexOf': 'int',
    'ToString': 'string',
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
    'this.Microseconds': 'int64',
    'ParseInt': 'int64',
    'MathFloor': 'float64',
    'MathCeil': 'float64',
    'MathRound': 'float64',
    'MathAbs': 'float64',
    'MathPow': 'float64',
    'ToFloat64': 'float64',
    'IsTrue': 'bool',
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
};

// helpers whose Go signature is `any` (SafeString, GetValue, Ternary, Add,
// Precise.StringMul, ...) are deliberately absent above: their box holds a value
// the printer cannot name, so those locals stay `any`.

const GO_TYPE_NAMES = [ 'string', 'int', 'int64', 'float64', 'bool', 'any' ];

export class GoTranspiler extends BaseTranspiler {

    binaryExpressionsWrappers;
    wrapThisCalls: boolean;
    wrapCallMethods: string[] = [];
    classNameMap: { [key: string]: string };
    DEFAULT_RETURN_TYPE = 'any';
    // suffix of the sibling body method an async trampoline hands its work to
    ASYNC_BODY_SUFFIX = 'Body';

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
            [ts.SyntaxKind.EqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.EqualsEqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.ExclamationEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
            [ts.SyntaxKind.ExclamationEqualsEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
            [ts.SyntaxKind.GreaterThanToken]: [this.GREATER_THAN_WRAPPER_OPEN, this.GREATER_THAN_WRAPPER_CLOSE],
            [ts.SyntaxKind.GreaterThanEqualsToken]: [this.GREATER_THAN_EQUALS_WRAPPER_OPEN, this.GREATER_THAN_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.LessThanToken]: [this.LESS_THAN_WRAPPER_OPEN, this.LESS_THAN_WRAPPER_CLOSE],
            [ts.SyntaxKind.LessThanEqualsToken]: [this.LESS_THAN_EQUALS_WRAPPER_OPEN, this.LESS_THAN_EQUALS_WRAPPER_CLOSE],
            [ts.SyntaxKind.PlusToken]: [this.PLUS_WRAPPER_OPEN, this.PLUS_WRAPPER_CLOSE],
            [ts.SyntaxKind.MinusToken]: [this.MINUS_WRAPPER_OPEN, this.MINUS_WRAPPER_CLOSE],
            [ts.SyntaxKind.AsteriskToken]: [this.MULTIPLY_WRAPPER_OPEN, this.MULTIPLY_WRAPPER_CLOSE],
            [ts.SyntaxKind.PercentToken]: [this.MOD_WRAPPER_OPEN, this.MOD_WRAPPER_CLOSE],
            [ts.SyntaxKind.SlashToken]: [this.DIVIDE_WRAPPER_OPEN, this.DIVIDE_WRAPPER_CLOSE],
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


    printPropertyDeclaration(node, identation) {
        // let modifiers = this.printModifiers(node);
        // modifiers = modifiers ? modifiers + " " : modifiers;
        const name = this.capitalize(this.printNode(node.name, 0));
        let type = 'any';
        if (node.type === undefined) {
            type = 'any';
        } else if (node.type.kind === SyntaxKind.StringKeyword) {
            type = 'string';
        } else if (node.type.kind === SyntaxKind.NumberKeyword) {
            type = 'int';
        } else if (node.type.kind === SyntaxKind.BooleanKeyword || (ts as any).isBooleanLiteral(node)) {
            type = 'bool';
        } else if (node.type.kind === SyntaxKind.ArrayType) {
            type = '[]any';
        }
        if (node.initializer) {
            // we have to save the value and initialize it later
            let initializer = this.printNode(node.initializer, 0);
            // quick fix
            initializer = initializer.replaceAll('"', '');
            return this.getIden(identation) + name + ' ' + type + ' ' + `\`default:"${initializer}"\`` + this.LINE_TERMINATOR;
        }
        return this.getIden(identation) + name + ' ' + type + this.LINE_TERMINATOR;
    }

    printStruct(node, indentation) {

        // check if we have heritage
        let heritageName = '';
        if (node?.heritageClauses?.length > 0) {
            const heritage = node.heritageClauses[0];
            const heritageType = heritage.types[0];
            let heritageEscapedText = heritageType.expression.escapedText;
            if (this.classNameMap[heritageEscapedText]) {
                heritageEscapedText = this.classNameMap[heritageEscapedText];
            }
            heritageName = this.getIden(indentation+1) + heritageEscapedText + '\n';
        }

        const propDeclarations = node.members.filter(member => member.kind === SyntaxKind.PropertyDeclaration);
        return `type ${this.className} struct {\n${heritageName}${propDeclarations.map(member => this.printNode(member, indentation+1)).join("\n")}\n}`;
    }

    printNewStructMethod(node){
        return `
func New${this.capitalize(this.className)}() *${(this.className)} {
    p := &${this.className}{}
    setDefaults(p)
    return p
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
        this.className = node.name.escapedText;
        if (this.classNameMap[this.className]) {
            this.className = this.classNameMap[this.className];
        }

        const struct = this.printStruct(node, identation);
        const newMethod = this.printNewStructMethod(node);

        const methods = node.members.filter(member => member.kind === SyntaxKind.MethodDeclaration);
        const classMethods = methods.map(method => this.printMethodDeclaration(method, identation)).join("\n");
        // const classDefinition = this.printClassDefinition(node, identation);

        // const classBody = this.printClassBody(node, identation);

        // const classClosing = this.getBlockClose(identation);

        // return classDefinition + classBody + classClosing;
        return struct + "\n" + newMethod  + "\n" + classMethods;
    }

    printPropertyAccessModifiers (node) {
        return "";
    }

    printSpreadElement(node, identation) {
        const expression = this.printNode(node.expression, 0);
        return this.getIden(identation) + expression + this.SPREAD_TOKEN;
    }

    printMethodDeclaration(node, identation) {

        let methodDef = this.printMethodDefinition(node, identation);

        const isAsync = this.isAsyncFunction(node);

        const funcBody = this.printFunctionBody(node, identation, isAsync);

        if (!isAsync) {
            methodDef += funcBody;
            return methodDef;
        }

        // Trampoline + body pair, see printAsyncTrampolineBlock.
        const goName = this.transformMethodNameIfNeeded(node.name.escapedText);
        const bodyName = this.getAsyncBodyName(node, goName);
        const trampoline = methodDef + this.printAsyncTrampolineBlock(node, identation, `${this.THIS_TOKEN}.${bodyName}`);
        const bodyDef = `${this.getIden(identation)}func (${this.THIS_TOKEN} *${this.className}) ${bodyName}(${this.printAsyncBodyParameters(node)}) ${this.DEFAULT_RETURN_TYPE} `;

        return trampoline + "\n" + bodyDef + funcBody;
    }

    printFunctionDeclaration(node, identation) {
        if (ts.isArrowFunction(node)) {
            const parameters = node.parameters.map(param => this.printParameter(param)).join(", ");
            const body = this.printNode(node.body);
            return `(${parameters}) => ${body}`;
        }
        const isAsync = this.isAsyncFunction(node);
        let functionDef = this.printFunctionDefinition(node, identation);
        const funcBody = this.printFunctionBody(node, identation, isAsync);

        if (!isAsync) {
            functionDef += funcBody;
            return this.printNodeCommentsIfAny(node, identation, functionDef);
        }

        // module-scope `async function` has no receiver: the body is a package-level
        // sibling function with the same trampoline contract
        const goName = this.transformMethodNameIfNeeded(node.name.escapedText);
        const bodyName = this.getAsyncBodyName(node, goName);
        const trampoline = functionDef + this.printAsyncTrampolineBlock(node, identation, bodyName);
        const bodyDef = `${this.getIden(identation)}func ${bodyName}(${this.printAsyncBodyParameters(node)}) ${this.DEFAULT_RETURN_TYPE} `;

        return this.printNodeCommentsIfAny(node, identation, trampoline) + "\n" + bodyDef + funcBody;
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
            if (parent && ts.isClassDeclaration(parent)) {
                parent.members.forEach((member: any) => remember(member?.name?.escapedText));
            } else if (parent && ts.isSourceFile(parent)) {
                parent.statements.forEach((statement: any) => {
                    if (ts.isFunctionDeclaration(statement)) {
                        remember(statement?.name?.escapedText);
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
     *     func (this *Exchange) FetchTicker(symbol any) <- chan any {
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
     *   - the result stays UNNAMED (`<- chan any`): `return ch` is the trampoline's only
     *     statement and it always runs, because the recover (`defer ReturnPanicError(ch)`)
     *     lives on the body, not here.
     */
    printAsyncTrampolineBlock(node, identation, callee: string): string {
        const args = this.printAsyncTrampolineArgs(node);
        const argList = args ? `, ${args}` : "";
        return [
            "{",
            `${this.getIden(identation + 1)}ch := make(chan ${this.DEFAULT_RETURN_TYPE}, 1)`,
            `${this.getIden(identation + 1)}go ${callee}(ch${argList})`,
            `${this.getIden(identation + 1)}return ch`,
            `${this.getIden(identation)}}`,
        ].join("\n");
    }

    printMethodDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.transformMethodNameIfNeeded(name);

        let returnType = this.printFunctionType(node);

        const parsedArgs = this.printMethodParameters(node);

        returnType = returnType ? returnType + " " : returnType;

        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
        // const methodDef = this.getIden(identation) + returnType + methodToken + name
        //     + "(" + parsedArgs + ")";
        const structReceiver = `(${this.THIS_TOKEN} *${this.className})`;
        const methodDef = this.getIden(identation) + methodToken + " " + structReceiver + " " + name + "(" + parsedArgs + ") " + returnType;

        return this.printNodeCommentsIfAny(node, identation, methodDef);
    }


    printFunctionDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.transformMethodNameIfNeeded(name);

        let returnType = this.printFunctionType(node);

        const parsedArgs = this.printMethodParameters(node);

        returnType = returnType ? returnType + " " : returnType;

        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
        // const methodDef = this.getIden(identation) + returnType + methodToken + name
        //     + "(" + parsedArgs + ")";
        const methodDef = this.getIden(identation) + methodToken + name + "(" + parsedArgs + ") " + returnType;

        return this.printNodeCommentsIfAny(node, identation, methodDef);
    }

    printMethodParameters(node) {
        const params = node.parameters.map(param => this.printParameter(param));
        const hasOptionalParameter = params.some(p => p === 'optional');
        if (!hasOptionalParameter) {
            return params.join(", ");
        }
        const paramsWithOptional = params.filter(param => param !== 'optional');
        paramsWithOptional.push('optionalArgs ...any');
        return paramsWithOptional.join(", ");
    }

    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        const initializer = node.initializer;

        const type = this.printParameterType(node);

        if (defaultValue) {
            if (initializer) {
                return 'optional'; // will be handled later
            }
            // not supported we have to find an alternative for go like defining multiple methods with different parameters
            // if (initializer) {
            //     const customDefaultValue = this.printCustomDefaultValueIfNeeded(initializer);
            //     const defaultValue = customDefaultValue ? customDefaultValue : this.printNode(initializer, 0);
            //     return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + defaultValue;
            // }
            return name + ' ' + type;
        }
        return name + ' ' + type;
    }

    printParameterType(node) {
        const typeText = this.getType(node);
        // // if (typeText === this.BOOLEAN_KEYWORD) {
        // //     return typeText;
        // // }

        //tmp default to interface
        return 'any';

        if (typeText === this.STRING_KEYWORD) {
            return 'string';
        }
        if (typeText === this.NUMBER_KEYWORD) {
            return 'float64';
        }

        if (typeText === this.BOOLEAN_KEYWORD) {
            return 'bool';
        }

        return this.DEFAULT_PARAMETER_TYPE;

        if (typeText === undefined || typeText === this.STRING_KEYWORD) {
            // throw new FunctionReturnTypeError("Parameter type is not supported or undefined");
            this.warn(node, node.getText(), "Parameter type not found, will default to: " + this.DEFAULT_PARAMETER_TYPE);
            return this.DEFAULT_PARAMETER_TYPE;
        }
        return typeText;

    }

    printFunctionType(node){
        const typeText = this.getFunctionType(node);
        if (typeText === 'void') {
            // // If the function is async (returns a Promise in TS) but declared void, emit a typed channel
            // if (this.isAsyncFunction(node)) {
            //     // Ensure element type is present; some edge cases yield '<- chan' only
            //     const elementType = this.DEFAULT_RETURN_TYPE || 'any';
            //     return `<- chan ${elementType}`;
            // }
            return "";
        }
        if (typeText === undefined || (typeText !== this.VOID_KEYWORD && typeText !== this.PROMISE_TYPE_KEYWORD)) {
            // throw new FunctionReturnTypeError("Function return type is not supported");
            let res = "";
            if (this.isAsyncFunction(node)) {
                res = `<- chan ${this.DEFAULT_RETURN_TYPE}`;
            } else {
                res = this.DEFAULT_RETURN_TYPE;
            }
            this.warn(node, node.name.getText(), "Function return type not found, will default to: " + res);
            return res;
        }
        if (typeText === this.PROMISE_TYPE_KEYWORD) {
            return `<- chan any`;
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
    // printer cannot name it (this.SafeString, GetValue, Ternary, Add, ... return any)
    goTypeOfInitializer(initializer, printedValue: string): string | undefined {
        switch (initializer?.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
            return 'bool';
        case ts.SyntaxKind.ObjectLiteralExpression:
            return 'map[string]any';
        case ts.SyntaxKind.ArrayLiteralExpression:
            return '[]any';
        case ts.SyntaxKind.PrefixUnaryExpression:
            // `!x` prints `!IsTrue(x)`
            return (initializer.operator === ts.SyntaxKind.ExclamationToken) ? 'bool' : undefined;
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.goTypeOfInitializer(initializer.expression, printedValue);
        case ts.SyntaxKind.BinaryExpression: {
            // `a || b` prints `IsTrue(a) || IsTrue(b)`, a Go bool
            const op = initializer.operatorToken.kind;
            if ((op === ts.SyntaxKind.BarBarToken) || (op === ts.SyntaxKind.AmpersandAmpersandToken)) {
                return 'bool';
            }
            // `a === b` prints either `IsEqual(a, b)` or an inlined `(a == b)`;
            // both are Go bools
            if ((op === ts.SyntaxKind.EqualsEqualsToken) || (op === ts.SyntaxKind.EqualsEqualsEqualsToken)
                || (op === ts.SyntaxKind.ExclamationEqualsToken) || (op === ts.SyntaxKind.ExclamationEqualsEqualsToken)) {
                return 'bool';
            }
            break;
        }
        }
        let value = printedValue.trim();
        // `const x = (a === b)` prints the wrapping parentheses of the source
        while (value.startsWith('(') && this.isWholePrintedCall(value, 0)) {
            value = value.substring(1, value.length - 1).trim();
        }
        const open = value.indexOf('(');
        if (open <= 0 || !this.isWholePrintedCall(value, open)) {
            return undefined;
        }
        const callee = value.substring(0, open);
        if (!/^[A-Za-z_][\w.]*$/.test(callee)) {
            return undefined;
        }
        return GO_HELPER_RETURN_TYPES[callee];
    }

    goEnclosingFunction(node) {
        let current = node?.parent;
        while (current) {
            switch (current.kind) {
            case ts.SyntaxKind.MethodDeclaration:
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.FunctionExpression:
            case ts.SyntaxKind.ArrowFunction:
            case ts.SyntaxKind.Constructor:
            case ts.SyntaxKind.SourceFile:
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
        let shadowed = false;
        const visit = (n) => {
            if (shadowed) { return; }
            const isBinding = (n.kind === ts.SyntaxKind.Parameter) || (n.kind === ts.SyntaxKind.VariableDeclaration);
            if (isBinding && (n.name?.kind === ts.SyntaxKind.Identifier)) {
                if (relevant.indexOf(n.name.escapedText as string) >= 0) { shadowed = true; return; }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return shadowed;
    }

    // reject the refinement when something downstream needs the local to stay `any`:
    // `x.push(v)` prints `AppendToArray(&x, v)` (a *T is not a *any) and a later
    // assignment of a value with another concrete type would stop compiling
    goLocalIsSafeToType(scope, declaration, varName: string, goType: string): boolean {
        if (scope === undefined) {
            return false;
        }
        let safe = true;
        const visit = (n) => {
            if (!safe) { return; }
            if ((n.kind === ts.SyntaxKind.Identifier) && (n.escapedText === varName) && (n !== declaration.name)) {
                const parent = n.parent;
                if (parent?.kind === ts.SyntaxKind.PropertyAccessExpression && parent.expression === n
                    && parent.name?.escapedText === 'push') {
                    safe = false; // AppendToArray(&x, ...)
                    return;
                }
                if (parent?.kind === ts.SyntaxKind.VariableDeclaration && parent.name === n) {
                    return; // a sibling block-scoped declaration; it gets its own type
                }
                if ((parent?.kind === ts.SyntaxKind.PostfixUnaryExpression) || (parent?.kind === ts.SyntaxKind.PrefixUnaryExpression)) {
                    const op = parent.operator;
                    if ((op === ts.SyntaxKind.PlusPlusToken) || (op === ts.SyntaxKind.MinusMinusToken)) {
                        safe = false;
                        return;
                    }
                }
                if (parent?.kind === ts.SyntaxKind.SpreadElement) {
                    safe = false; // `x...` only forwards a slice whose element type matches
                    return;
                }
                if (parent?.kind === ts.SyntaxKind.ArrayLiteralExpression
                    && parent.parent?.kind === ts.SyntaxKind.BinaryExpression
                    && parent.parent.left === parent
                    && parent.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                    safe = false; // [x, y] = f() destructures into `x = GetValue(...)`
                    return;
                }
                if (parent?.kind === ts.SyntaxKind.BinaryExpression && parent.left === n) {
                    const op = parent.operatorToken.kind;
                    if (op === ts.SyntaxKind.EqualsToken) {
                        if (this.goTypeOfInitializer(parent.right, this.printNode(parent.right, 0)) !== goType) {
                            safe = false;
                            return;
                        }
                    } else if ((op >= ts.SyntaxKind.FirstCompoundAssignment) && (op <= ts.SyntaxKind.LastCompoundAssignment)) {
                        safe = false;
                        return;
                    }
                }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return safe;
    }

    getGoLocalType(declaration, parsedValue: string): string {
        const goType = this.goTypeOfInitializer(declaration.initializer, parsedValue);
        if (goType === undefined) {
            return 'any';
        }
        // the scan matches AST identifiers, so it needs the source name, not the
        // printed one (`type` is renamed to `typeVar` on the way out)
        const sourceName = declaration.name?.escapedText;
        if (sourceName === undefined) {
            return 'any';
        }
        const scope = this.goEnclosingFunction(declaration);
        if (this.goTypeNameIsShadowed(scope, goType) || !this.goLocalIsSafeToType(scope, declaration, sourceName, goType)) {
            return 'any';
        }
        return goType;
    }

    printVariableDeclarationList(node,identation) {
        const declaration = node.declarations[0];
        // const varToken = this.VAR_TOKEN ? this.VAR_TOKEN + " ": "";
        // const name = declaration.name.escapedText;

        if (declaration?.name.kind === ts.SyntaxKind.ArrayBindingPattern) {
            const arrayBindingPattern = declaration.name;
            const arrayBindingPatternElements = arrayBindingPattern.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e.name, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement =  `${this.getIden(identation)}${syntheticName} := ${this.printNode(declaration.initializer, 0)};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                // const type = this.getType(node);
                // const parsedType = this.getTypeFromRawType(type);
                const statement = this.getIden(identation) + `${e} := GetValue(${syntheticName},${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + ";\n";
                } else {
                    // printStatement adds the last ;
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        if (declaration?.initializer?.kind=== ts.SyntaxKind.AwaitExpression) {
            const parsedName = this.printNode(declaration.name, 0);
            const parsedInitializer = this.printNode(declaration.initializer, 0);
            return `
${this.getIden(identation)}${parsedName}:= ${parsedInitializer}
${this.getIden(identation)}PanicOnError(${parsedName})`;

        }

        const isNew = declaration.initializer && (declaration.initializer.kind === ts.SyntaxKind.NewExpression);

        const parsedValue = (declaration.initializer) ? this.printNode(declaration.initializer, identation) : this.NULL_TOKEN;

        if (parsedValue === this.UNDEFINED_TOKEN) {
            return this.getIden(identation) + "var " + this.printNode(declaration.name) + " any = " + parsedValue;
        }

        if (node?.parent?.kind === ts.SyntaxKind.FirstStatement) {
            if (isNew) {
                return this.getIden(identation) + this.printNode(declaration.name) + " := " + parsedValue;
            }
            const varName = this.printNode(declaration.name);
            const declaredType = this.getGoLocalType(declaration, parsedValue);
            const stm = this.getIden(identation) + "var " + varName + " " + declaredType + " = " + parsedValue;
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
    //     let objectName = node.parent?.name?.escapedText;
    //     if (objectName === undefined) {
    //         objectName = "object";
    //     }
    //     const body =  node.properties.map((p) => `${this.getIden(identation)}${objectName}["${node.properties[0].name.text}"] = ${p.initializer.text}` ).join("\n");
    //     return body;
    // }

    printConstructorDeclaration (node, identation) {
        const classNode = node.parent;
        const className = this.printNode(classNode.name, 0);
        const args = this.printMethodParameters(node);
        const constructorBody = this.printFunctionBody(node, identation);

        // find super call inside constructor and extract params
        let superCallParams = '';
        let hasSuperCall = false;
        node.body?.statements.forEach(statement => {
            if (ts.isExpressionStatement(statement)) {
                const expression = statement.expression;
                if (ts.isCallExpression(expression)) {
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
        if (elementAccess?.kind === ts.SyntaxKind.ElementAccessExpression) {
            if (elementAccess?.expression?.kind === ts.SyntaxKind.ThisKeyword) {
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
        // const isAsync = true; // setting to true for now, because there are some scenarios where we don't know
        const elementAccess = node.expression;
        if (elementAccess?.kind === ts.SyntaxKind.ElementAccessExpression) {
            const parsedArg = node.arguments?.length > 0 ? node.arguments.map(n => this.printNode(n, identation).trimStart()).join(", ") : "";
            // const target = this.printNode(elementAccess.expression, 0);
            const propName = this.printNode(elementAccess.argumentExpression, 0);
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
        const tsKind = ts.SyntaxKind;
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

    printWrappedUnknownThisProperty(node) {
        const type = this.getChecker().getResolvedSignature(node);
        if (type?.declaration === undefined) {
            let parsedArguments = node.arguments?.map((a) => this.printNode(a, 0)).join(", ");
            parsedArguments = parsedArguments ? parsedArguments : "";
            const propName = node.expression?.name.escapedText;
            // const isAsyncDecl = true;
            // const isAsyncDecl = node?.parent?.kind === ts.SyntaxKind.AwaitExpression;
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

    transformCallExpressionName(name: string) {
        return this.capitalize(name);
    }

    transformPropertyAccessExpressionName(name: string) {
        return this.capitalize(name);
    }

    printOutOfOrderCallExpressionIfAny(node, identation) {
        if (node.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
            const args = node.arguments;

            if (node.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
                const methodName = this.printNode(node.expression.name, 0);
                if (this.wrapThisCalls || (this.wrapCallMethods.includes(methodName))) {
                    let argsParsed = "";
                    if (args.length > 0) {
                        argsParsed = args.map((a) => this.printNode(a, 0)).join(", ");
                        return `<-this.callInternal("${methodName}", ${argsParsed})`;
                    }
                    return `<-this.callInternal("${methodName}")`;
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
        if (node.expression.kind === ts.SyntaxKind.ElementAccessExpression) {
            return this.printDynamicCall(node, identation);
        }


        return undefined;
    }

    handleTypeOfInsideBinaryExpression(node, identation) {
        const left = node.left;
        const right = node.right.text;
        const op = node.operatorToken.kind;
        const expression = left.expression;

        const isDifferentOperator = op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
        const notOperator = isDifferentOperator ? this.NOT_TOKEN : "";

        const target = this.printNode(expression, 0);
        switch (right) {
        case "string":
            return notOperator + `IsString(${target})`;
        case "number":
            return notOperator + `IsNumber(${target})`;
        case "boolean":
            return notOperator + `IsBool(${target})`;
        case "object":
            return notOperator + `IsObject(${target})`;
        case "function":
            return notOperator + `IsFunction(${target})`;
        }

        return undefined;

    }

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right;

        const op = node.operatorToken.kind;

        // ---------------------------------------------------------------
        // Array destructuring assignment:  [a, b] = foo()
        // Transforms into:
        // __tmpX := foo()
        // a = GetValue(__tmpX, 0)
        // b = GetValue(__tmpX, 1)
        // ---------------------------------------------------------------
        if (op === ts.SyntaxKind.EqualsToken &&
            left.kind === ts.SyntaxKind.ArrayLiteralExpression) {
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

            let arrayBindingStatement = `${syntheticName} := ${this.printNode(right, 0)};\n`;

            parsedArrayBindingElements.forEach((e, index) => {

                const statement = this.getIden(identation) + `${e} = GetValue(${syntheticName},${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + ";\n";
                } else {
                    // printStatement adds the last ;
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        // ---------------------------------------------------------------
        // Go-style setter for element-access assignments:  a[b] = v
        // ---------------------------------------------------------------
        if (op === ts.SyntaxKind.EqualsToken &&
            left.kind === ts.SyntaxKind.ElementAccessExpression) {
            // Collect base container and all keys (inner-most key is last).
            const keys: any[] = [];
            let baseExpr: any = null;
            let cur: any = left;
            while (ts.isElementAccessExpression(cur)) {
                keys.unshift(cur.argumentExpression);          // prepend
                const expr = cur.expression;
                if (!ts.isElementAccessExpression(expr)) {
                    baseExpr = expr;
                    break;
                }
                cur = expr;
            }

            const containerStr = this.printNode(baseExpr, 0);
            const keyStrs      = keys.map(k => this.printNode(k, 0));

            // Build GetValue(GetValue( ... )) chain for all but the last key.
            let acc = containerStr;
            for (let i = 0; i < keyStrs.length - 1; i++) {
                acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
            }

            const lastKey = keyStrs[keyStrs.length - 1];
            const rhs     = this.printNode(right, 0);

            return `AddElementToObject(${acc}, ${lastKey}, ${rhs})`;
        }

        // ---------------------------------------------------------------
        // Go-style setter for element-access compound assignments:  a[b] += v
        // ---------------------------------------------------------------
        if (op === ts.SyntaxKind.PlusEqualsToken &&
            left.kind === ts.SyntaxKind.ElementAccessExpression) {
            // Collect base container and all keys (inner-most key is last).
            const keys: any[] = [];
            let baseExpr: any = null;
            let cur: any = left;
            while (ts.isElementAccessExpression(cur)) {
                keys.unshift(cur.argumentExpression);          // prepend
                const expr = cur.expression;
                if (!ts.isElementAccessExpression(expr)) {
                    baseExpr = expr;
                    break;
                }
                cur = expr;
            }

            const containerStr = this.printNode(baseExpr, 0);
            const keyStrs      = keys.map(k => this.printNode(k, 0));

            // Build GetValue(GetValue( ... )) chain for all but the last key.
            let acc = containerStr;
            for (let i = 0; i < keyStrs.length - 1; i++) {
                acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
            }

            const lastKey = keyStrs[keyStrs.length - 1];
            const rhs     = this.printNode(right, 0);

            // For +=, we need to get the current value, add to it, then set it back
            const currentValue = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${lastKey}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
            const result = `AddElementToObject(${acc}, ${lastKey}, Add(${currentValue}, ${rhs}))`;
            return result;
        }

        if (left.kind === ts.SyntaxKind.TypeOfExpression) {
            const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
            if (typeOfExpression) {
                return typeOfExpression;
            }
        }

        if (op === ts.SyntaxKind.InKeyword) {
            return `InOp(${this.printNode(right, 0)}, ${this.printNode(left, 0)})`;
        }

        // only print the operands when this op is actually handled here; otherwise
        // the base printBinaryExpression prints them, and doing it eagerly means
        // every unhandled binary expression gets its subtrees printed twice
        if (op === ts.SyntaxKind.PlusEqualsToken || op === ts.SyntaxKind.MinusEqualsToken || op in this.binaryExpressionsWrappers) {
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);

            if (op === ts.SyntaxKind.PlusEqualsToken) {
                return `${leftText} = Add(${leftText}, ${rightText})`;
            }

            if (op === ts.SyntaxKind.MinusEqualsToken) {
                return `${leftText} = Subtract(${leftText}, ${rightText})`;
            }

            const isEquality = (op === ts.SyntaxKind.EqualsEqualsToken) || (op === ts.SyntaxKind.EqualsEqualsEqualsToken);
            const isDifference = (op === ts.SyntaxKind.ExclamationEqualsToken) || (op === ts.SyntaxKind.ExclamationEqualsEqualsToken);
            if (isEquality || isDifference) {
                const inlined = this.printInlineEquality(left, right, leftText, rightText, isEquality);
                if (inlined !== undefined) {
                    return inlined;
                }
            }

            const wrapper = this.binaryExpressionsWrappers[op];
            const open = wrapper[0];
            const close = wrapper[1];
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

    // the scalar family the TypeScript type of an operand belongs to: 'string',
    // 'int', 'float', 'bool', 'nil' for the undefined/null literals, or undefined
    // when the type is any/unknown/a union of several families
    goScalarFamily(node): string | undefined {
        let type;
        try {
            type = this.getChecker().getTypeAtLocation(node);
        } catch (e) {
            return undefined;
        }
        return this.goScalarFamilyOfType(type);
    }

    goScalarFamilyOfType(type): string | undefined {
        if (type === undefined) {
            return undefined;
        }
        // Str/Int/Num/Bool are nullable aliases of `string | undefined` & friends;
        // their Go representation is still `any`, so they never inline
        const alias = type.aliasSymbol?.escapedName;
        switch (alias) {
        case 'Str':
        case 'Int':
        case 'Num':
        case 'Bool':
            return undefined;
        }
        const flags = type.flags;
        if (flags & ts.TypeFlags.Union) {
            const families = new Set<string>();
            for (const member of type.types) {
                const family = this.goScalarFamilyOfType(member);
                if (family === undefined) {
                    return undefined;
                }
                // `string | undefined` is `any` in Go, never a bare Go string:
                // one nullable member disqualifies the whole union
                if (family === 'nil') {
                    return undefined;
                }
                families.add(family);
            }
            if (families.size !== 1) {
                return undefined; // `boolean` is `true | false`, so size === 1
            }
            return families.values().next().value;
        }
        if (flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
            return 'string';
        }
        if (flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {
            return 'number';
        }
        if (flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
            return 'bool';
        }
        if (flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) {
            return 'nil';
        }
        return undefined;
    }

    // true when this identifier's Go type is a pointer we can deref (*string / *int64 / …)
    // Parameters stay `any` today — `*x` would not compile, so they are never pointers here.
    goIsPointerIdentifier(node): boolean {
        if (node?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        let symbol;
        try {
            symbol = this.getChecker().getSymbolAtLocation(node);
        } catch (e) {
            return false;
        }
        const decl = symbol?.valueDeclaration;
        if (decl === undefined || decl.kind !== ts.SyntaxKind.VariableDeclaration) {
            return false;
        }
        if (decl.initializer === undefined) {
            return false;
        }
        const goType = this.goTypeOfInitializer(decl.initializer, this.printNode(decl.initializer, 0));
        return (typeof goType === 'string') && goType.startsWith('*');
    }

    // === / !== inlined to plain Go operators when both sides are concrete Go
    // values or real pointers. Everything else — in particular anything that is
    // still `any` in Go — falls through to the existing IsEqual helper.
    // `(a == b || *a == *b)` is rejected: a nil *T panics on the second clause.
    printInlineEquality(left, right, leftText: string, rightText: string, isEq: boolean): string | undefined {
        const lPtr = this.goIsPointerIdentifier(left);
        const rPtr = this.goIsPointerIdentifier(right);
        const lFam = this.goScalarFamily(left);
        const rFam = this.goScalarFamily(right);
        if (lFam === 'nil' && rPtr) {
            return isEq ? `(${rightText} == nil)` : `(${rightText} != nil)`;
        }
        if (rFam === 'nil' && lPtr) {
            return isEq ? `(${leftText} == nil)` : `(${leftText} != nil)`;
        }
        if (lPtr && rPtr) {
            if (isEq) {
                return `(${leftText} == ${rightText} || (${leftText} != nil && ${rightText} != nil && *${leftText} == *${rightText}))`;
            }
            return `(${leftText} != ${rightText} && (${leftText} == nil || ${rightText} == nil || *${leftText} != *${rightText}))`;
        }
        if (lPtr && rFam !== undefined && rFam !== 'nil') {
            return isEq
                ? `(${leftText} != nil && *${leftText} == ${rightText})`
                : `(${leftText} == nil || *${leftText} != ${rightText})`;
        }
        if (rPtr && lFam !== undefined && lFam !== 'nil') {
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

    transformPropertyAcessExpressionIfNeeded(node) {
        const expression = node.expression;
        const leftSide = this.printNode(expression, 0);
        const rightSide = node.name.escapedText;

        let rawExpression = undefined;

        switch(rightSide) {
        case 'length':
                const type = (this.getChecker() as TypeChecker).getTypeAtLocation(expression); // eslint-disable-line
            // this.warnIfAnyType(node, type.flags, leftSide, "length");
            // rawExpression = this.isStringType(type.flags) ? `(string${leftSide}).Length` : `(${leftSide}.Cast<object>().ToList()).Count`;
            rawExpression = this.isStringType(type.flags) ? `GetLength(${leftSide})` : `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`; // `(${leftSide}.Cast<object>()).ToList().Count`
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
        return undefined;
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
                    initParams.push(`${paramName} := GetArg(optionalArgs, ${index}, ${this.printNode(initializer, 0)})`);
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
            if (!wrapInChannel) {
                functionBody = blockOpen + firstStatement + remainingString + blockClose;
            } else {
                functionBody = firstStatement + remainingString;
            }
        } else {
            if (!wrapInChannel) {
                functionBody = super.printFunctionBody(node, identation);
            } else {
                functionBody = node.body.statements.map(statement => {
                    // if (statement.kind === ts.SyntaxKind.ReturnStatement) {
                    //     if (statement?.expression) {
                    //         return this.getIden(identation) + "ch <-" + this.printNode(statement.expression) + '\n' + this.getIden(identation) + "return " + this.printNode(statement.expression);
                    //     }
                    // }
                    return this.printNode(statement, identation);
                }).join("\n");

            }
        }
        if (wrapInChannel) {
            // return statement might be inside ifs or other complex statements so we still have to replace them manually :(
            // functionBody = functionBody.replace(/(\s*)return\s+([^\n]+\n?)/g, '$1ch <- $2$1');
            const functionBodySplit = functionBody.split("\n");
            const bodyWithIndentationExtraAndNoReturn = functionBodySplit.map((line) => {
                return this.getIden(identation+1) + line;
            }).join("\n");
            let shouldAddLastReturn = true;

            // const bodySplit = bodyWithIndentationExtraAndNoReturn.split("\n");
            const bodySplit = functionBodySplit;
            const lastLine = bodySplit[bodySplit.length - 1];
            if (lastLine.trim().startsWith("return") || lastLine.trim().startsWith("panic")) {
                shouldAddLastReturn = false;
            }

            // Check if the function body ends with a conditional that has returns in all branches
            if (node.body && this.blockEndsWithConditionalReturn(node.body.statements)) {
                shouldAddLastReturn = false;
            }

            const lastReturn = shouldAddLastReturn ? this.getIden(identation+1) + "return nil" : "";

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
                bodyWithIndentationExtraAndNoReturn,
            ];
            if (lastReturn) {
                lines.push(lastReturn);
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

    getRandomNameSuffix() {
        return Math.floor(Math.random() * 1000000).toString();
    }

    getLineBasedSuffix(node): string {
        const { line, character } = this.getSrc().getLineAndCharacterOfPosition(node.getStart());
        return `${line}${character}`;
    }

    printExpressionStatement(node, identation) {

        if (node?.expression?.kind === ts.SyntaxKind.AsExpression) {
            node = node.expression;
        }
        if (node.expression.kind !== ts.SyntaxKind.AwaitExpression) {
            return super.printExpressionStatement(node, identation);
        }

        const exprStm = this.printNode(node.expression, identation);

        // const { line, character } = this.getSrc().getLineAndCharacterOfPosition(node.getStart());
        // console.log(`line: ${line}, character: ${character}`);
        const returnRandName = "retRes" + this.getLineBasedSuffix(node);

        // const expStatement =this.getIden(identation) + exprStm + this.LINE_TERMINATOR;

        const expStatement = `
${this.getIden(identation)}${returnRandName} := ${exprStm}
${this.getIden(identation)}PanicOnError(${returnRandName})`;
        return this.printNodeCommentsIfAny(node, identation, expStatement);
    }

    isInsideAsyncFunction(returnStatementNode) {
        let currentNode = returnStatementNode;

        while (currentNode) {
            // Check if the current node is a function or method
            if (ts.isFunctionDeclaration(currentNode) ||
              ts.isFunctionExpression(currentNode) ||
              ts.isArrowFunction(currentNode) ||
              ts.isMethodDeclaration(currentNode)) {
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
        // if (node?.expression?.kind !== ts.SyntaxKind.AwaitExpression) {
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

        if (node?.expression?.kind === ts.SyntaxKind.AsExpression) {
            node = node.expression;
        }

        if (node?.expression?.kind === ts.SyntaxKind.AwaitExpression) {
            // const returnRandName = "retRes" + this.getRandomNameSuffix();
            const returnRandName = "retRes" + this.getLineBasedSuffix(node.expression);
            rightPart = rightPart ? ' ' + rightPart + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
            // return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + rightPart + trailingComment;
            return `
    ${this.getIden(identation)}${returnRandName} := ${rightPart}
    ${this.getIden(identation)}PanicOnError(${returnRandName})
    ${this.getIden(identation)}${leadingComment}ch <- ${returnRandName}${trailingComment}
    ${this.getIden(identation)}${returnStatement}`;
            // ${this.getIden(identation)}return ${returnRandName}`;
        }

        if (rightPart.length === 0) {
            return `\n${this.getIden(identation)}${returnStatement}`;
        }

        return `
${this.getIden(identation)}${leadingComment}ch <- ${rightPart}${trailingComment}
${this.getIden(identation)}${returnStatement}`;
        // ${this.getIden(identation)}return ${rightPart}`;
        // ${this.getIden(identation)}return ${rightPart}`;
    }


    printAsExpression(node, identation) {
        const type = node.type;

        if (type.kind === ts.SyntaxKind.AnyKeyword) {
            // return `(()${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === ts.SyntaxKind.StringKeyword) {
            // return `((string)${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === ts.SyntaxKind.ArrayType) {
            // if (type.elementType.kind === ts.SyntaxKind.AnyKeyword) {
            //     return `(IList<object>)(${this.printNode(node.expression, identation)})`;
            // }
            // if (type.elementType.kind === ts.SyntaxKind.StringKeyword) {
            //     return `(IList<string>)(${this.printNode(node.expression, identation)})`;
            // }
        }

        return this.printNode(node.expression, identation);
    }

    printArrayLiteralExpression(node) {

        let arrayOpen = this.ARRAY_OPENING_TOKEN;
        const elems = node.elements;

        const elements = node.elements.map((e) => this.printNode(e)).join(", ");

        // take into consideration list of promises
        if (elems.length > 0) {
            const first = elems[0];
            if (first.kind === ts.SyntaxKind.CallExpression) {
                // const type = this.getChecker().getTypeAtLocation(first);
                const type = this.getFunctionType(first);
                // const parsedType = this.getTypeFromRawType(type);
                // parsedType === "Task" ||
                // to do check this later
                if (type === undefined || elements.indexOf(this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN) > -1) {
                    // if (type === undefined) {
                    arrayOpen = "[]any{";
                    // }
                    //  else {
                    //     arrayOpen = "new List<Task<object>> {";
                    // }
                } else {
                    // type = 'object';
                    // check this out later
                    // if (type === 'Task<List<object>>') {
                    //     type = 'Task<object>';
                    // }
                    // if (type === 'string'){
                    //     type = 'object';
                    // }
                    // type =
                    arrayOpen = `[]any{`;
                }
            }
        }

        return arrayOpen + elements + this.ARRAY_CLOSING_TOKEN;
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
        return `IsArray(${parsedArg})`;
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        return `ObjectKeys(${parsedArg})`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        return `ObjectValues(${parsedArg})`;
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

    printArrayPushCall(node: CallExpression, identation: number, name: string | undefined = undefined, parsedArg: string | undefined = undefined) {
        let returnValue = '';
        let returnRandName = name;
        if (name?.startsWith('GetValue')) {
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
        return `Contains(${name},${parsedArg})`;
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `StartsWith(${name}, ${parsedArg})`;
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `EndsWith(${name}, ${parsedArg})`;
    }

    printTrimCall(node, identation, name = undefined) {
        return `Trim(${name})`;
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Join(${name}, ${parsedArg})`;
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Split(${name}, ${parsedArg})`;
    }

    printToFixedCall(node, identation, name = undefined, parsedArg = undefined) {
        return `toFixed(${name}, ${parsedArg})`;
    }

    printToStringCall(node, identation, name = undefined) {
        return `ToString(${name})`;
    }

    printConcatCall(node, identation, name = undefined, parsedArg = undefined) {
        return `Concat(${name}, ${parsedArg})`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        return `ToUpper(${name})`;
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        return `ToLower(${name})`;
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

    printSliceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        if (parsedArg2 === undefined){
            // return `((string)${name}).Substring((int)${parsedArg})`;
            parsedArg2 = 'nil';
        }
        // return `((string)${name})[((int)${parsedArg})..((int)${parsedArg2})]`;
        return `Slice(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `Replace(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `Replace(${name}, ${parsedArg}, ${parsedArg2})`;
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
        // const type = (this.getChecker() as TypeChecker).getTypeAtLocation(node.expression); // eslint-disable-line
        // this.warnIfAnyType(node, type.flags, leftSide, "length");
        return `GetLength(${leftSide})`;
    }

    // printPostFixUnaryExpression(node, identation) {
    //     const {operand, operator} = node;
    //     if (operand.kind === ts.SyntaxKind.NumericLiteral) {
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
    //     if (operand.kind === ts.SyntaxKind.NumericLiteral) {
    //         return super.printPrefixUnaryExpression(node, identation);
    //     }
    //     if (operator === ts.SyntaxKind.ExclamationToken) {
    //         // not branch check falsy/turthy values if needed;
    //         return  this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
    //     }
    //     const leftSide = this.printNode(operand, 0);
    //     if (operator === ts.SyntaxKind.PlusToken) {
    //         return `prefixUnaryPlus(ref ${leftSide})`;
    //     } else {
    //         return `prefixUnaryNeg(ref ${leftSide})`;
    //     }
    // }

    printConditionalExpression(node, identation) {
        const condition = this.printCondition(node.condition, 0);
        const whenTrue = this.printNode(node.whenTrue, 0);
        const whenFalse = this.printNode(node.whenFalse, 0);

        return `Ternary(${condition}, ${whenTrue}, ${whenFalse})`;
    }

    printDeleteExpression(node, identation) {
        const object = this.printNode (node.expression.expression, 0);
        const key = this.printNode (node.expression.argumentExpression, 0);
        return `Remove(${object}, ${key})`;
    }

    printThrowStatement(node, identation) {
        // const expression = this.printNode(node.expression, 0);
        // return this.getIden(node) + this.THROW_TOKEN + " " + expression + this.LINE_TERMINATOR;
        if (node.expression.kind === ts.SyntaxKind.Identifier) {
            return this.getIden(identation) + 'panic(' + this.printNode(node.expression, 0) + ')' + this.LINE_TERMINATOR;
        }
        if (node.expression.kind === ts.SyntaxKind.NewExpression) {
            const expression = node.expression;
            // handle throw new Error (Message)
            // and throw new x[a] (message)
            const argumentsExp = expression?.arguments ?? [];
            const parsedArg = argumentsExp.map(n => this.printNode(n, 0)).join(",") ?? '';
            const newExpression =  this.printNode(expression.expression, 0);
            if (expression.expression.kind === ts.SyntaxKind.Identifier) {
                // handle throw new X
                const id = expression.expression;
                const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
                if (symbol) {
                    const declarations = this.getChecker().getDeclaredTypeOfSymbol(symbol).symbol?.declarations ?? [];
                    const isClassDeclaration = declarations.find(l => l.kind === ts.SyntaxKind.InterfaceDeclaration ||  l.kind === ts.SyntaxKind.ClassDeclaration);
                    if (isClassDeclaration){
                        // return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${id.escapedText} ((string)${parsedArg}) ${this.LINE_TERMINATOR}`;
                    } else {
                        return this.getIden(identation) + `throwDynamicException(${id.escapedText}, ${parsedArg});return nil;`;
                    }
                }
                return this.getIden(identation) + `panic(${id.escapedText}(${parsedArg}))${this.LINE_TERMINATOR}`;
            } else if (expression.expression.kind === ts.SyntaxKind.ElementAccessExpression) {
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

    printBinaryExpression(node, identation) {

        const {left, right, operatorToken} = node;

        const customBinaryExp = this.printCustomBinaryExpressionIfAny(node, identation);
        if (customBinaryExp) {
            return customBinaryExp;
        }

        if (operatorToken.kind == ts.SyntaxKind.InstanceOfKeyword) {
            return this.printInstanceOfExpression(node, identation);
        }

        if (operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            // handle test['a'] = 1;
            const elementAccess = left;
            const rightSide = this.printNode(right, 0);
            if (left.kind === ts.SyntaxKind.ElementAccessExpression) {
                const leftSide = this.printNode(elementAccess.expression, 0);
                const propName = this.printNode(elementAccess.argumentExpression, 0);
                return `AddElementToObject(${leftSide}, ${propName}, ${rightSide})`;
            }

            if (right?.kind === ts.SyntaxKind.AwaitExpression || rightSide.startsWith('<-this.callInternal')) {
                const leftParsed = this.printNode(left, 0);
                return `
    ${leftParsed} = ${rightSide}
    ${this.getIden(identation)}PanicOnError(${leftParsed})`;
            }
        }

        const op = operatorToken.kind;
        // handle: [x,d] = this.method()
        if (op === ts.SyntaxKind.EqualsToken && left.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            const arrayBindingPatternElements = left.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement = `${syntheticName} := ${this.printNode(right, 0)};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                // const type = this.getType(node);
                // const parsedType = this.getTypeFromRawType(type);
                const leftElement = arrayBindingPatternElements[index];
                const leftType = this.getChecker().getTypeAtLocation(leftElement);
                const parsedType = this.getTypeFromRawType(leftType);

                const castExp = parsedType ? `(${parsedType})` : "";

                // const statement = this.getIden(identation) + `${e} = (${castExp}((List<object>)${syntheticName}))[${index}]`;
                const statement = this.getIden(identation) + `${e} = GetValue(${syntheticName}),${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + ";\n";
                } else {
                    // printStatement adds the last ;
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        let operator = this.SupportedKindNames[operatorToken.kind];


        let leftVar = undefined;
        let rightVar = undefined;

        // c# wrapper
        if (operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken || operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
            if (this.COMPARISON_WRAPPER_OPEN) {
                leftVar = this.printNode(left, 0);
                rightVar = this.printNode(right, identation);
                return `${this.COMPARISON_WRAPPER_OPEN}${leftVar}, ${rightVar}${this.COMPARISON_WRAPPER_CLOSE}`;
            }
        }

        // check if boolean operators || and && because of the falsy values
        if (operatorToken.kind === ts.SyntaxKind.BarBarToken || operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
            leftVar = this.printCondition(left, 0);
            rightVar = this.printCondition(right, identation);
        }  else {
            leftVar = this.printNode(left, 0);
            rightVar = this.printNode(right, identation);
        }

        const customOperator = this.getCustomOperatorIfAny(left, right, operatorToken);

        operator = customOperator ? customOperator : operator;

        return leftVar +" "+ operator + " " + rightVar.trim();
    }

    printTryStatement(node, identation: number) {
        // const tryBody = this.printNode(node.tryBlock, 0);

        let tryBody = node.tryBlock.statements.map((s) => {
            return this.printNode(s, identation + 1);
        }).join("\n");
        tryBody = tryBody.replaceAll(/(\s*)break\s*$/gm, "$1panic(\"break\")"); // to do do thing regex-based

        // const catchBody = this.printNode(node.catchClause.block, 0);
        const catchBody = node.catchClause.block.statements.map((s) => this.printNode(s, identation + 1)).join("\n");

        const catchLines = catchBody.split("\n").map(l => l.trim()).filter(Boolean);
        const catchLastLine = catchLines.length ? catchLines[catchLines.length - 1] : "";
        const catchBodyEndsWithReturn = catchLastLine.startsWith("return")
            || catchLastLine.startsWith("panic")
            || catchLastLine.startsWith("throw new")
            || this.blockEndsWithConditionalReturn(node.catchClause.block.statements);

        const tryLines = tryBody.split("\n").map(l => l.trim()).filter(Boolean);
        const tryLastLine = tryLines.length ? tryLines[tryLines.length - 1] : "";
        const tryBodyEndsWithReturn = tryLastLine.startsWith("return")
            || tryLastLine.startsWith("panic")
            || tryLastLine.startsWith("throw new")
            || this.blockEndsWithConditionalReturn(node.tryBlock.statements);

        const returNil = "return nil";
        const isVoid   = this.isInsideVoidFunction(node);

        const nodeEndsWithReturn = tryBodyEndsWithReturn && catchBodyEndsWithReturn && !isVoid;
        const errorName = node.catchClause.variableDeclaration.name.escapedText;
        const classPrefix = this.className !== 'undefined' ? `(this *${this.className})` : "()";
        const thisWord = this.className !== 'undefined' ? "this" : "";
        const catchBlock =`
    {
        ${nodeEndsWithReturn ? 'ret__ :=' : ''} func${classPrefix} (ret_ any) {
		    defer func() {
                if ${errorName} := recover(); ${errorName} != nil {
                    if ${errorName} == "break" {
                        return
                    }
                    ret_ = func${classPrefix} any {
                        // catch block:
                        ${catchBody}
                        ${catchBodyEndsWithReturn ? "" : returNil}
                    }(${thisWord})
                }
            }()
		    // try block:
            ${tryBody}
		    ${tryBodyEndsWithReturn ? "" : returNil}
	    }(${thisWord})
    ${nodeEndsWithReturn
        ? `
            if ret__ != nil {
                return ret__
            }
            return nil`
        : ''}
        }`;
        // add identation
        const indentedBlock = catchBlock.split("\n").map((line) => this.getIden(identation) + line).join("\n");
        // const catchCondOpen = this.CONDITION_OPENING ? this.CONDITION_OPENING : " ";

        return indentedBlock;
    }

    printPrefixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        if (operator === ts.SyntaxKind.ExclamationToken) {
            // not branch check falsy/turthy values if needed;
            return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
        }
        if (operator === ts.SyntaxKind.MinusToken) {
            return this.getIden(identation) + `OpNeg(${this.printNode(node.operand, 0)})`;
        }
        return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printNode(operand, 0);
    }

    printNewExpression(node, identation) {
        let expression = node.expression?.escapedText;
        expression = expression ? expression : this.printNode(node.expression); // new Exception or new exact[string] check this out
        if (node.arguments.length === 0) {
            return `New${this.capitalize(expression)}()`;
        }
        const args = node.arguments.map(n => this.printNode(n, identation)).join(", ");
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
    printElementAccessExpression(node, identation) {
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
        while (ts.isElementAccessExpression(current)) {
            keys.unshift(current.argumentExpression); // prepend
            const expr = current.expression;
            if (!ts.isElementAccessExpression(expr)) {
                // Reached the base container.
                baseExpr = expr;
                break;
            }
            current = expr;
        }

        const containerStr = this.printNode(baseExpr, 0);
        const keyStrs = keys.map(k => this.printNode(k, 0));

        // Now build nested helpers.
        let acc = containerStr;
        keyStrs.forEach(k => {
            acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${k}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
        });

        return acc;
    }

    isInsideVoidFunction(node: ts.Node): boolean {
        for (let cur = node.parent; cur; cur = cur.parent) {
            if (ts.isFunctionLike(cur)) {
                return cur.type === undefined || cur.type.kind === ts.SyntaxKind.VoidKeyword;
            }
        }
        return true;          // default-to-void if uncertain
    }

    /**
     * Check if a block or statement contains a return statement or throws an error
     */
    hasReturnInBlock(statement: ts.Statement): boolean {
        if (ts.isBlock(statement)) {
            // A sequence of statements returns on all control paths if the last statement returns on all control paths
            if (statement.statements.length === 0) {
                return false;
            }
            return this.hasReturnInBlock(statement.statements[statement.statements.length - 1]);
        } else if (ts.isReturnStatement(statement)) {
            return true;
        } else if (ts.isThrowStatement(statement)) {
            return true;
        } else if (ts.isIfStatement(statement)) {
            // An if statement returns on all control paths if both the "if" and "else" branches return on all control paths
            const ifHasReturn = this.hasReturnInBlock(statement.thenStatement);
            if (statement.elseStatement) {
                const elseHasReturn = this.hasReturnInBlock(statement.elseStatement);
                return ifHasReturn && elseHasReturn;
            }
            return false; // No else statement, so execution can continue
        } else if (ts.isTryStatement(statement)) {
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
    blockEndsWithConditionalReturn(statements: ts.NodeArray<ts.Statement>): boolean {
        if (statements.length === 0) {
            return false;
        }

        const lastStatement = statements[statements.length - 1];
        if (ts.isIfStatement(lastStatement)) {
            // Check if this if statement has returns in all branches (only if it has an else)
            const ifHasReturn = this.hasReturnInBlock(lastStatement.thenStatement);
            if (lastStatement.elseStatement) {
                const elseHasReturn = this.hasReturnInBlock(lastStatement.elseStatement);
                return ifHasReturn && elseHasReturn;
            }
        }
        if (ts.isTryStatement(lastStatement)) {
            // Check if this try statement has returns in both try and catch blocks
            const tryHasReturn = this.hasReturnInBlock(lastStatement.tryBlock);
            const catchHasReturn = this.hasReturnInBlock(lastStatement.catchClause.block);
            return tryHasReturn && catchHasReturn;
        }
        return false;
    }


}


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

