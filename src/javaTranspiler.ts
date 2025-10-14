import { BaseTranspiler } from "./baseTranspiler.js";
import ts, { TypeChecker } from "typescript";

const parserConfig = {
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

export class JavaTranspiler extends BaseTranspiler {
    binaryExpressionsWrappers;

    constructor(config = {}) {
        config["parser"] = Object.assign({}, parserConfig, config["parser"] ?? {});
        super(config);

        this.requiresParameterType = true;
        this.requiresReturnType = true;
        this.asyncTranspiling = true;
        this.supportsFalsyOrTruthyValues = false;
        this.requiresCallExpressionCast = true;
        this.id = "Java";

        this.initConfig();
        this.applyUserOverrides(config);
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
            // Add ad-hoc function call rewrites here if you need them
        };

        this.ReservedKeywordsReplacements = {
            string: "str",
            object: "obj",
            params: "parameters",
            base: "bs",
            internal: "intern",
            event: "eventVar",
            fixed: "fixedVar",
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

        this.ArgTypeReplacements = {
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

        this.binaryExpressionsWrappers = {
            [ts.SyntaxKind.EqualsEqualsToken]: [
                this.EQUALS_EQUALS_WRAPPER_OPEN,
                this.EQUALS_EQUALS_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.EqualsEqualsEqualsToken]: [
                this.EQUALS_EQUALS_WRAPPER_OPEN,
                this.EQUALS_EQUALS_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.ExclamationEqualsToken]: [
                this.DIFFERENT_WRAPPER_OPEN,
                this.DIFFERENT_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.ExclamationEqualsEqualsToken]: [
                this.DIFFERENT_WRAPPER_OPEN,
                this.DIFFERENT_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.GreaterThanToken]: [
                this.GREATER_THAN_WRAPPER_OPEN,
                this.GREATER_THAN_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.GreaterThanEqualsToken]: [
                this.GREATER_THAN_EQUALS_WRAPPER_OPEN,
                this.GREATER_THAN_EQUALS_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.LessThanToken]: [
                this.LESS_THAN_WRAPPER_OPEN,
                this.LESS_THAN_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.LessThanEqualsToken]: [
                this.LESS_THAN_EQUALS_WRAPPER_OPEN,
                this.LESS_THAN_EQUALS_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.PlusToken]: [
                this.PLUS_WRAPPER_OPEN,
                this.PLUS_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.MinusToken]: [
                this.MINUS_WRAPPER_OPEN,
                this.MINUS_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.AsteriskToken]: [
                this.MULTIPLY_WRAPPER_OPEN,
                this.MULTIPLY_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.PercentToken]: [
                this.MOD_WRAPPER_OPEN,
                this.MOD_WRAPPER_CLOSE,
            ],
            [ts.SyntaxKind.SlashToken]: [
                this.DIVIDE_WRAPPER_OPEN,
                this.DIVIDE_WRAPPER_CLOSE,
            ],
        };
    }

    getBlockOpen(identation) {
        return "\n" + this.getIden(identation) + this.BLOCK_OPENING_TOKEN + "\n";
    }

    printSuperCallInsideConstructor(_node, _identation) {
        // Java allows "super(...)" as the first line; we already inject it when needed.
        return "";
    }

    printIdentifier(node) {
        let idValue = node.text ?? node.escapedText;

        if (this.ReservedKeywordsReplacements[idValue]) {
            idValue = this.ReservedKeywordsReplacements[idValue];
        }

        if (idValue === "undefined") {
            return this.UNDEFINED_TOKEN;
        }

        // keep the same class-reference typeof-guarding logic as your original file
        const type = (global as any).checker.getTypeAtLocation(node);
        const symbol = type?.symbol;
        if (symbol !== undefined) {
            const decl = symbol?.declarations ?? [];
            let isBuiltIn = undefined;
            if (decl.length > 0) {
                isBuiltIn =
                    decl[0].getSourceFile().fileName.indexOf("typescript") > -1;
            }

            if (isBuiltIn !== undefined && !isBuiltIn) {
                const isInsideNewExpression =
                    node?.parent?.kind === ts.SyntaxKind.NewExpression;
                const isInsideCatch =
                    node?.parent?.kind === ts.SyntaxKind.ThrowStatement;
                const isLeftSide =
                    node?.parent?.name === node || node?.parent?.left === node;
                const isCallOrPropertyAccess =
                    node?.parent?.kind === ts.SyntaxKind.PropertyAccessExpression ||
                    node?.parent?.kind === ts.SyntaxKind.ElementAccessExpression;
                if (!isLeftSide && !isCallOrPropertyAccess && !isInsideCatch && !isInsideNewExpression) {
                    const symbol = (global as any).checker.getSymbolAtLocation(node);
                    let isClassDeclaration = false;
                    if (symbol) {
                        const first = symbol.declarations[0];
                        if (first.kind === ts.SyntaxKind.ClassDeclaration) {
                            isClassDeclaration = true;
                        }
                        if (first.kind === ts.SyntaxKind.ImportSpecifier) {
                            const importedSymbol = (global as any).checker.getAliasedSymbol(symbol);
                            if (
                                importedSymbol?.declarations[0]?.kind ===
                                ts.SyntaxKind.ClassDeclaration
                            ) {
                                isClassDeclaration = true;
                            }
                        }
                    }
                    if (isClassDeclaration) {
                        // No direct typeof(class) in Java. Keep original text (no wrapping).
                        return `${idValue}`;
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

        // find super call inside constructor and extract params
        let superCallParams = "";
        let hasSuperCall = false;
        node.body?.statements.forEach((statement) => {
            if (ts.isExpressionStatement(statement)) {
                const expression = statement.expression;
                if (ts.isCallExpression(expression)) {
                    const expressionText = expression.expression.getText().trim();
                    if (expressionText === "super") {
                        hasSuperCall = true;
                        superCallParams = expression.arguments
                            .map((a) => {
                                return this.printNode(a, identation).trim();
                            })
                            .join(", ");
                    }
                }
            }
        });

        const header =
            this.getIden(identation) + className + "(" + args + ")";
        if (!hasSuperCall) {
            return header + constructorBody;
        }
        // In Java, super(...) must be the first statement inside the body.
        const injected = this.injectLeadingInBody(constructorBody, `super(${superCallParams});`);
        return header + injected;
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
        if (elementAccess?.kind === ts.SyntaxKind.ElementAccessExpression) {
            const parsedArg =
                node.arguments?.length > 0
                    ? node.arguments
                        .map((n) => this.printNode(n, identation).trimStart())
                        .join(", ")
                    : "";
            const target = this.printNode(elementAccess.expression, 0);
            const propName = this.printNode(elementAccess.argumentExpression, 0);
            const argsArray = `new Object[] { ${parsedArg} }`;
            const open = this.DYNAMIC_CALL_OPEN;
            return `${open}${target}, ${propName}, ${argsArray})`;
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
        const type = (global as any).checker.getResolvedSignature(node);
        if (type?.declaration === undefined) {
            let parsedArguments = node.arguments
                ?.map((a) => this.printNode(a, 0))
                .join(", ");
            parsedArguments = parsedArguments ? parsedArguments : "";
            const propName = node.expression?.name.escapedText;
            const isAsyncDecl = node?.parent?.kind === ts.SyntaxKind.AwaitExpression;
            const argsArray = `new Object[] { ${parsedArguments} }`;
            const open = this.DYNAMIC_CALL_OPEN;
            const statement = `${open}this, "${propName}", ${argsArray})`;
            // If your Java runtime returns CompletableFuture, you can await it where appropriate.
            return statement;
        }
        return undefined;
    }

    printOutOfOrderCallExpressionIfAny(node, identation) {
        if (node.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
            const expressionText = node.expression.getText().trim();
            const args = node.arguments;
            if (args.length === 1) {
                const parsedArg = this.printNode(args[0], 0);
                switch (expressionText) {
                case "Math.abs":
                    return `Math.abs(Double.parseDouble((${parsedArg}).toString()))`;
                }
            } else if (args.length === 2) {
                const parsedArg1 = this.printNode(args[0], 0);
                const parsedArg2 = this.printNode(args[1], 0);
                switch (expressionText) {
                case "Math.min":
                    return `mathMin(${parsedArg1}, ${parsedArg2})`;
                case "Math.max":
                    return `mathMax(${parsedArg1}, ${parsedArg2})`;
                case "Math.pow":
                    return `Math.pow(Double.parseDouble(${parsedArg1}.toString()), Double.parseDouble(${parsedArg2}.toString()))`;
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
        if (node.expression.kind === ts.SyntaxKind.ElementAccessExpression) {
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
            op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
            op === ts.SyntaxKind.ExclamationEqualsToken;
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

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right;
        const op = node.operatorToken.kind;

        if (left.kind === ts.SyntaxKind.TypeOfExpression) {
            const typeOfExpression = this.handleTypeOfInsideBinaryExpression(
                node,
                identation
            );
            if (typeOfExpression) return typeOfExpression;
        }

        // destructuring: [a,b] = this.method()
        if (
            op === ts.SyntaxKind.EqualsToken &&
            left.kind === ts.SyntaxKind.ArrayLiteralExpression
        ) {
            const arrayBindingPatternElements = left.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) =>
                this.printNode(e, 0)
            );
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement =
                `var ${syntheticName} = ${this.printNode(right, 0)};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                const statement =
                    this.getIden(identation) +
                    `${e} = ((java.util.List<Object>) ${syntheticName}).get(${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + ";\n";
                } else {
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        if (op === ts.SyntaxKind.InKeyword) {
            return `inOp(${this.printNode(right, 0)}, ${this.printNode(left, 0)})`;
        }

        const leftText = this.printNode(left, 0);
        const rightText = this.printNode(right, 0);

        if (op === ts.SyntaxKind.PlusEqualsToken) {
            return `${leftText} = add(${leftText}, ${rightText})`;
        }

        if (op === ts.SyntaxKind.MinusEqualsToken) {
            return `${leftText} = subtract(${leftText}, ${rightText})`;
        }

        if (op in this.binaryExpressionsWrappers) {
            const wrapper = this.binaryExpressionsWrappers[op];
            const open = wrapper[0];
            const close = wrapper[1];
            return `${open}${leftText}, ${rightText}${close}`;
        }

        return undefined;
    }

    printVariableDeclarationList(node, identation) {
        const declaration = node.declarations[0];

        if (
            this.removeVariableDeclarationForFunctionExpression &&
            declaration?.initializer &&
            ts.isFunctionExpression(declaration.initializer)
        ) {
            return this.printNode(declaration.initializer, identation).trimEnd();
        }

        // array destructuring in variable declaration
        if (declaration?.name.kind === ts.SyntaxKind.ArrayBindingPattern) {
            const arrayBindingPattern = declaration.name;
            const arrayBindingPatternElements = arrayBindingPattern.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) =>
                this.printNode(e.name, 0)
            );
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement =
                `${this.getIden(identation)}var ${syntheticName} = ${this.printNode(
                    declaration.initializer,
                    0
                )};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                const statement =
                    this.getIden(identation) +
                    `var ${e} = ((java.util.List<Object>) ${syntheticName}).get(${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + ";\n";
                } else {
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        const isNew =
            declaration?.initializer &&
            declaration.initializer.kind === ts.SyntaxKind.NewExpression;
        const varToken = isNew ? "var " : this.VAR_TOKEN + " ";

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
                const variableType = (global as any).checker.typeToString(
                    (global as any).checker.getTypeAtLocation(declaration)
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
        return (
            this.getIden(identation) +
            varToken +
            this.printNode(declaration.name) +
            " = " +
            parsedValue
        );
    }

    transformPropertyAcessExpressionIfNeeded(node) {
        const expression = node.expression;
        const leftSide = this.printNode(expression, 0);
        const rightSide = node.name.escapedText;

        let rawExpression = undefined;

        switch (rightSide) {
        case "length": {
            const type = (global.checker as TypeChecker).getTypeAtLocation(
                expression
            );
            this.warnIfAnyType(node, (type as any).flags, leftSide, "length");
            rawExpression = this.isStringType((type as any).flags)
                ? `((String)${leftSide}).length()`
                : `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`;
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
            ts.isArrayLiteralExpression(node) ||
            ts.isObjectLiteralExpression(node) ||
            ts.isStringLiteral(node) ||
            (ts as any).isBooleanLiteral(node)
        ) {
            return this.UNDEFINED_TOKEN;
        }

        if (ts.isNumericLiteral(node)) {
            return this.UNDEFINED_TOKEN;
        }

        if (
            node?.escapedText === "undefined" &&
            (global as any).checker.getTypeAtLocation(node?.parent)?.flags ===
            ts.TypeFlags.Number
        ) {
            return this.UNDEFINED_TOKEN;
        }

        return undefined;
    }

    printFunctionBody(node, identation) {
        // keep your existing default param initializer logic, but swap C# types for Java
        const funcParams = node.parameters;
        const initParams = [];
        if (funcParams.length > 0) {
            const body = node.body.statements;
            const first = body.length > 0 ? body[0] : [];
            const remaining = body.length > 0 ? body.slice(1) : [];
            let firstStatement = this.printNode(first, identation + 1);

            const remainingString = remaining
                .map((statement) => this.printNode(statement, identation + 1))
                .join("\n");
            let offSetIndex = 0;
            funcParams.forEach((param, i) => {
                const initializer = param.initializer;
                if (initializer) {
                    const index = i + offSetIndex;
                    // index = index < 0 ? 0 : i - 1;
                    const paramName = this.printNode(param.name, 0);
                    initParams.push(`Object ${paramName} = Helpers.getArg(optionalArgs, ${index}, ${this.printNode(initializer, 0)});`);
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
            return blockOpen + firstStatement + remainingString + blockClose;
        }

        return super.printFunctionBody(node, identation);
    }

    printInstanceOfExpression(node, identation) {
        const left = node.left.escapedText;
        const right = node.right.escapedText;
        return this.getIden(identation) + `${left} instanceof ${right}`;
    }

    printAsExpression(node, identation) {
        const type = node.type;

        if (type.kind === ts.SyntaxKind.AnyKeyword) {
            return `((${this.VariableTypeReplacements['object']})${this.printNode(
                node.expression,
                identation
            )})`;
        }

        if (type.kind === ts.SyntaxKind.StringKeyword) {
            return `((String)${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === ts.SyntaxKind.ArrayType) {
            if (type.elementType.kind === ts.SyntaxKind.AnyKeyword) {
                return `(java.util.List<Object>)(${this.printNode(
                    node.expression,
                    identation
                )})`;
            }
            if (type.elementType.kind === ts.SyntaxKind.StringKeyword) {
                return `(java.util.List<String>)(${this.printNode(
                    node.expression,
                    identation
                )})`;
            }
        }

        return this.printNode(node.expression, identation);
    }

    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        const initializer = node.initializer;

        let type = this.printParameterType(node) || "";

        if (defaultValue) {
            if (initializer) {
                const customDefaultValue =
                    this.printCustomDefaultValueIfNeeded(initializer);
                const def = customDefaultValue
                    ? customDefaultValue
                    : this.printNode(initializer, 0);
                type = def === "null" && type !== "Object" ? type + " " : type + " ";
                return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + def;
            }
            return type + " " + name;
        }
        return name;
    }

    printMethodParameters(node) {
        const params = node.parameters.map(param => this.printParameter(param));
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

    printMethodDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.transformMethodNameIfNeeded(name);

        let returnType = this.printFunctionType(node);

        let modifiers = this.printModifiers(node);
        const defaultAccess = this.METHOD_DEFAULT_ACCESS ? this.METHOD_DEFAULT_ACCESS + " " : "";
        modifiers = modifiers ? modifiers + " " : defaultAccess;
        modifiers =
            modifiers.indexOf("public") === -1 &&
                modifiers.indexOf("private") === -1 &&
                modifiers.indexOf("protected") === -1
                ? defaultAccess + modifiers
                : modifiers;

        let parsedArgs = undefined;

        const methodOverride = (this.getMethodOverride(node) as any);
        const isOverride = methodOverride !== undefined;
        modifiers = isOverride ? modifiers + "override " : modifiers; // harmless in Java output; strip if you prefer

        if (isOverride && (returnType === "Object" || returnType === "java.util.concurrent.CompletableFuture<Object>")) {
            returnType = this.printFunctionType(methodOverride);
        }

        if (isOverride && node.parameters.length > 0) {
            const first = node.parameters[0];
            const firstType = this.getType(first);

            if (firstType === undefined) {
                const currentArgs = node.parameters;
                const parentArgs = methodOverride.parameters;
                parsedArgs = "";
                parentArgs.forEach((param, index) => {
                    const originalName = this.printNode(currentArgs[index].name, 0);
                    const parsedArg = this.printParameteCustomName(param, originalName);
                    parsedArgs += parsedArg;
                    if (index < parentArgs.length - 1) {
                        parsedArgs += ", ";
                    }
                });
            }
        }

        parsedArgs = parsedArgs ? parsedArgs : this.printMethodParameters(node);

        returnType = returnType ? returnType + " " : returnType;

        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
        const signature =
            this.getIden(identation) +
            modifiers +
            returnType +
            methodToken +
            name +
            "(" +
            parsedArgs +
            ")";

        return this.printNodeCommentsIfAny(node, identation, signature);
    }

    printArrayIsArrayCall(_node, _identation, parsedArg = undefined) {
        return `((${parsedArg} instanceof java.util.List) || (${parsedArg}.getClass().isArray()))`;
    }

    printObjectKeysCall(_node, _identation, parsedArg = undefined) {
        return `new java.util.ArrayList<Object>(((java.util.Map<String, Object>)${parsedArg}).keySet())`;
    }

    printObjectValuesCall(_node, _identation, parsedArg = undefined) {
        return `new java.util.ArrayList<Object>(((java.util.Map<String, Object>)${parsedArg}).values())`;
    }

    printJsonParseCall(_node, _identation, parsedArg = undefined) {
        return `Helpers.parseJson(${parsedArg})`;
    }

    printJsonStringifyCall(_node, _identation, parsedArg = undefined) {
        return `Helpers.json(${parsedArg})`;
    }

    printPromiseAllCall(_node, _identation, parsedArg = undefined) {
        return `Helpers.promiseAll(${parsedArg})`;
    }

    printMathFloorCall(_node, _identation, parsedArg = undefined) {
        return `(Math.floor(Double.parseDouble((${parsedArg}).toString())))`;
    }

    printMathRoundCall(_node, _identation, parsedArg = undefined) {
        return `Math.round(Double.parseDouble(${parsedArg}.toString()))`;
    }

    printMathCeilCall(_node, _identation, parsedArg = undefined) {
        return `Math.ceil(Double.parseDouble(${parsedArg}.toString()))`;
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

    printIndexOfCall(_node, _identation, name = undefined, parsedArg = undefined) {
        return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
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

    printSplitCall(_node, _identation, name = undefined, parsedArg = undefined) {
        return `new java.util.ArrayList<Object>(java.util.Arrays.asList(((String)${name}).split((String)${parsedArg})))`;
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
        return `assert ${parsedArgs}`;
    }

    printSliceCall(_node, _identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        if (parsedArg2 === undefined) {
            parsedArg2 = "null";
        }
        return `Helpers.slice(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printReplaceCall(_node, _identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `Helpers.replace((String)${name}, (String)${parsedArg}, (String)${parsedArg2})`;
    }

    printReplaceAllCall(_node, _identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `Helpers.replaceAll((String)${name}, (String)${parsedArg}, (String)${parsedArg2})`;
    }

    printPadEndCall(_node, _identation, name, parsedArg, parsedArg2) {
        // You can point this to a runtime helper if you have one
        return `Helpers.padEnd((String)${name}, ((Number)${parsedArg}).intValue(), ((String)${parsedArg2}).charAt(0))`;
    }

    printPadStartCall(_node, _identation, name, parsedArg, parsedArg2) {
        return `Helpers.padStart((String)${name}, ((Number)${parsedArg}).intValue(), ((String)${parsedArg2}).charAt(0))`;
    }

    printDateNowCall(_node, _identation) {
        return "System.currentTimeMillis()";
    }

    printLengthProperty(node, _identation, _name = undefined) {
        const leftSide = this.printNode(node.expression, 0);
        const type = (global.checker as TypeChecker).getTypeAtLocation(node.expression);
        this.warnIfAnyType(node, (type as any).flags, leftSide, "length");
        return this.isStringType((type as any).flags)
            ? `((String)${leftSide}).length()`
            : `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`;
    }

    // For ++/--, prefer native Java operators rather than the C# ref-helpers
    printPostFixUnaryExpression(node, identation) {
        const { operand, operator } = node;
        const leftSide = this.printNode(operand, 0);
        const op = this.PostFixOperators[operator];
        if (op === "--") {
            return `${leftSide}--`;
        }
        return `${leftSide}++`;
    }

    printPrefixUnaryExpression(node, identation) {
        const { operand, operator } = node;
        if (operator === ts.SyntaxKind.ExclamationToken) {
            return this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
        }
        const leftSide = this.printNode(operand, 0);
        if (operator === ts.SyntaxKind.PlusToken) {
            return `+(${leftSide})`;
        } else if (operator === ts.SyntaxKind.MinusToken) {
            return `-(${leftSide})`;
        }
        return super.printPrefixUnaryExpression(node, identation);
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
        return `((java.util.Map<String,Object>)${object}).remove((String)${key})`;
    }

    printThrowStatement(node, identation) {
        if (node.expression.kind === ts.SyntaxKind.Identifier) {
            return (
                this.getIden(identation) +
                this.THROW_TOKEN +
                " " +
                this.printNode(node.expression, 0) +
                this.LINE_TERMINATOR
            );
        }
        if (node.expression.kind === ts.SyntaxKind.NewExpression) {
            const expression = node.expression;
            const argumentsExp = expression?.arguments ?? [];
            const parsedArg = argumentsExp.map((n) => this.printNode(n, 0)).join(",") ?? "";
            const newExpression = this.printNode(expression.expression, 0);
            if (expression.expression.kind === ts.SyntaxKind.Identifier) {
                const id = expression.expression;
                const symbol = (global as any).checker.getSymbolAtLocation(expression.expression);
                if (symbol) {
                    const declarations =
                        (global as any).checker.getDeclaredTypeOfSymbol(symbol).symbol?.declarations ?? [];
                    const isClassDeclaration = declarations.find(
                        (l) =>
                            l.kind === ts.SyntaxKind.InterfaceDeclaration ||
                            l.kind === ts.SyntaxKind.ClassDeclaration
                    );
                    if (isClassDeclaration) {
                        return (
                            this.getIden(identation) +
                            `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${id.escapedText}(${parsedArg}) ${this.LINE_TERMINATOR}`
                        );
                    } else {
                        return (
                            this.getIden(identation) +
                            `throwDynamicException(${id.escapedText}, ${parsedArg});return null;`
                        );
                    }
                }
                return (
                    this.getIden(identation) +
                    `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${newExpression}(${parsedArg}) ${this.LINE_TERMINATOR}`
                );
            } else if (expression.expression.kind === ts.SyntaxKind.ElementAccessExpression) {
                return this.getIden(identation) + `throwDynamicException(${newExpression}, ${parsedArg});`;
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
                if (node.type.kind === ts.SyntaxKind.AnyKeyword) {
                    typeText = this.OBJECT_KEYWORD + " ";
                }
            }
        }
        return modifiers + " " + typeText + " ";
    }

    printObjectLiteralBody(node, identation) {
        const body =  node.properties.map((p) => this.printNode(p, identation+1)).join("\n");
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
}
