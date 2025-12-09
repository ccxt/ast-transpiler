import { BaseTranspiler } from "./baseTranspiler.js";
import ts, { TypeChecker } from "typescript";

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

export class JavaTranspiler extends BaseTranspiler {
    binaryExpressionsWrappers;

    varListFromObjectLiterals = {};

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


    getCustomClassName(node) {
        return this.capitalize(node.name.escapedText);
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
        if (Number(nodeText) > javaMax && Number.isInteger(Number(nodeText))) {
            return `${nodeText}L`;
        }
        return node.text;
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

    getExpressionStatementPrefixesIfAny(node, identation) {
        // return undefined;
        const finalVars = [];
        if (node.expression?.kind === ts.SyntaxKind.CallExpression) {
            const objectLiterals = this.getObjectLiteralFromCallExpressionArguments(node.expression);
            for (let i = 0; i < objectLiterals.length; i++) {
                const objLiteral = objectLiterals[i];
                const objVariables = this.getVarListFromObjectLiteralAndUpdateInPlace(objLiteral);
                if (objVariables.length > 0) {
                    finalVars.push(...objVariables);
                }
            }

            if (finalVars.length > 0) {
                return finalVars.map( (v, i) => `${this.getIden( i > 0 ? identation : 0)}final Object ${this.getFinalVarName(v)} = ${this.getOriginalVarName(v)};`).join('\n') + "\n" + this.getIden(identation);

            }
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
                    return `Helpers.mathAbs(Double.parseDouble(Helpers.toString(${parsedArg})))`;
                }
            } else if (args.length === 2) {
                const parsedArg1 = this.printNode(args[0], 0);
                const parsedArg2 = this.printNode(args[1], 0);
                switch (expressionText) {
                case "Math.min":
                    return `Helpers.mathMin(${parsedArg1}, ${parsedArg2})`;
                case "Math.max":
                    return `Helpers.mathMax(${parsedArg1}, ${parsedArg2})`;
                case "Math.pow":
                    return `Helpers.mathPow(Double.parseDouble(Helpers.toString(${parsedArg1})), Double.parseDouble(Helpers.toString(${parsedArg2})))`;
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

    getVarMethodIfAny(node) {
        // should return the name of the method this node belongs to, if any
        let current = node?.parent;
        while (current) {
            if (ts.isMethodDeclaration(current) || ts.isFunctionDeclaration(current)) {
                return this.printNode(current.name, 0);
            }
            current = current.parent;
        }
        return 'outsideAnyMethod';
    }

    getVarClassIfAny(node) {
        // should return the name of the class this node belongs to, if any
        let current = node?.parent;
        while (current) {
            if (ts.isClassDeclaration(current)) {
                return this.printNode(current.name, 0);
            }
            current = current.parent;
        }
        return '';
    }

    getVarKey(node) {

        const varName = node?.escapedText ?? node?.name?.escapedText;
        if (!varName) {
            return '';
        }
        return `${this.getVarClassIfAny(node)}-${this.getVarMethodIfAny(node)}-${varName}`;
    }

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right;
        const op = node.operatorToken.kind;

        if (left.kind === ts.SyntaxKind.Identifier) {
            this.ReassignedVars[this.getVarKey(left)] = true;
        }

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
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => {
                this.ReassignedVars[this.getVarKey(e)] = true;
                return this.printNode(e, 0);
            });
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

        // ---------------------------------------------------------------
        // setter for element-access assignments:  a[b] = v
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

            let prefixes = this.getBinaryExpressionPrefixes(node, identation);
            prefixes = prefixes ? prefixes : "";


            const lastKey = keyStrs[keyStrs.length - 1];
            const rhs     = this.printNode(right, 0);



            return `${prefixes}Helpers.addElementToObject(${acc}, ${lastKey}, ${rhs})`;
        }

        if (op === ts.SyntaxKind.InKeyword) {
            return `Helpers.inOp(${this.printNode(right, 0)}, ${this.printNode(left, 0)})`;
        }

        const leftText = this.printNode(left, 0);
        const rightText = this.printNode(right, 0);

        if (op === ts.SyntaxKind.PlusEqualsToken) {
            return `${leftText} = Helpers.add(${leftText}, ${rightText})`;
        }

        if (op === ts.SyntaxKind.MinusEqualsToken) {
            return `${leftText} = Helpers.subtract(${leftText}, ${rightText})`;
        }

        if (op in this.binaryExpressionsWrappers) {
            const wrapper = this.binaryExpressionsWrappers[op];
            const open = wrapper[0];
            const close = wrapper[1];
            return `${open}${leftText}, ${rightText}${close}`;
        }

        return undefined;
    }


    getObjectLiteralFromCallExpressionArguments(node) {
        const res = [];
        if (!node?.arguments) {
            return res;
        }
        const args = node.arguments;

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg.kind === ts.SyntaxKind.ObjectLiteralExpression) {
                res.push(arg);
            } else if (arg.kind === ts.SyntaxKind.CallExpression) {
                const innerCallExp = arg;
                const innerObjLiterals = this.getObjectLiteralFromCallExpressionArguments(innerCallExp);
                res.push(...innerObjLiterals);
            }
        }
        return res;
    }

    getBinaryExpressionPrefixes(node, identation) {
        let right = node?.right;
        if (right?.kind === ts.SyntaxKind.AwaitExpression) {
            // un pack await this.x() to this.x(), we don't care about await here
            right = right.expression;
        }
        if (!right) {
            return undefined;
        }
        if (right.kind === ts.SyntaxKind.ObjectLiteralExpression) {
            const objVariables = this.getVarListFromObjectLiteralAndUpdateInPlace(right);
            if (objVariables.length > 0) {
                return objVariables.map( (v, i) => `${this.getIden( i > 0 ? identation : 0)}final Object ${this.getFinalVarName(v)} = ${this.getOriginalVarName(v)};`).join('\n') + "\n" + this.getIden(identation);
            }
        } else if (right.kind === ts.SyntaxKind.CallExpression) {
            // search arguments recursively for object literals
            // eg: a[x] = this.extend(this.extend(this.extend({'a':b}, c)))
            const objectLiterals = this.getObjectLiteralFromCallExpressionArguments(right);
            if (objectLiterals.length > 0) {
                let finalVars = '';
                for (let i = 0; i < objectLiterals.length; i++) {
                    const objLiteral = objectLiterals[i];
                    const objVariables = this.getVarListFromObjectLiteralAndUpdateInPlace(objLiteral);
                    if (objVariables.length > 0) {
                        finalVars += objVariables.map( (v, j) => `${this.getIden( j > 0 || i > 0 ? identation : 0)}final Object ${this.getFinalVarName(v)} = ${this.getOriginalVarName(v)};`).join('\n');
                    }
                }
                return finalVars + "\n" + this.getIden(identation);
            }
        }
        return undefined;
    }

    getFinalVarName(varName: string): string {
        if (this.ReservedKeywordsReplacements[varName]) {
            varName = this.ReservedKeywordsReplacements[varName];
        }
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

    getObjectLiteralId(node): string {
        const start = node.getStart();
        const end = node.getEnd();
        return `${start}-${end}`;
    }

    createNewNodeForFinalVar(originalName: string): ts.Identifier {
        const newNode = ts.factory.createIdentifier(this.getFinalVarName(originalName));
        newNode.getFullText = () => this.getFinalVarName(originalName);
        return newNode;
    }

    getVarListFromObjectLiteralAndUpdateInPlace(node): string[] {
        // in java if we use an anonymous object literal put, we can't refer non final variables
        // so here we collect them and then we add the wrapper final variables, eg: finalX = X;
        // and we update the node in place to use finalX instead of X
        let res = [];

        const nodeId = this.getObjectLiteralId(node);

        if (nodeId in this.varListFromObjectLiterals) {
            return this.varListFromObjectLiterals[nodeId];
        }

        node.properties.forEach( (prop) => {
            if (prop.initializer?.kind === ts.SyntaxKind.Identifier && prop.initializer.escapedText !== 'undefined' && !prop.initializer.escapedText.startsWith('null')) {
                // if (this.ReassignedVars[prop.initializer.escapedText]) {
                if (this.ReassignedVars[this.getVarKey(prop.initializer)]) {
                    res.push(prop.initializer.escapedText);
                    const finalName = this.getFinalVarName(prop.initializer.escapedText);
                    const newNode = ts.factory.createIdentifier(finalName);
                    prop.initializer = newNode;
                    // prop.initializer.escapedText = finalName;
                }
            } else if (prop.initializer?.kind === ts.SyntaxKind.CallExpression) {
                // check if any of the args is an identifier that was reassigned
                const callArgs = prop.initializer?.arguments ?? [];
                const callExp = prop.initializer;
                // transverseCallExpressionArguments(callExp);
                // callArgs.forEach( (arg,i) => {
                //     if (arg.kind === ts.SyntaxKind.Identifier) {
                //         // if (this.ReassignedVars[arg.escapedText]) {
                //         if (this.ReassignedVars[this.getVarKey(arg)]) {
                //             res.push(arg.escapedText);
                //             const newNode = this.createNewNodeForFinalVar(arg.escapedText);
                //             arg = newNode;
                //             callExp.arguments[i] = newNode;
                //         }
                //     } else if (arg.kind === ts.SyntaxKind.CallExpression) {
                //         const innerCallExp = arg;
                //         innerCallExp.arguments.forEach( (innerArg,j) => {
                //             if (innerArg.kind === ts.SyntaxKind.Identifier) {
                //                 if (this.ReassignedVars[this.getVarKey(innerArg)]) {
                //                     res.push(innerArg.escapedText);
                //                     const newNode = this.createNewNodeForFinalVar(innerArg.escapedText);
                //                     innerArg = newNode;
                //                     innerCallExp.arguments[j] = newNode;
                //                 }
                //             }
                //         });
                //     }
                // });

                const transverseCallExpressionArguments = (callExpression) => {
                    callExpression.arguments.forEach( (arg, i) => {
                        if (arg.kind === ts.SyntaxKind.Identifier) {
                            if (this.ReassignedVars[this.getVarKey(arg)]) {
                                res.push(arg.escapedText);
                                const newNode = this.createNewNodeForFinalVar(arg.escapedText);
                                arg = newNode;
                                callExpression.arguments[i] = newNode;
                            }
                        } else if (arg.kind === ts.SyntaxKind.CallExpression) {
                            const innerCallExp = arg;
                            transverseCallExpressionArguments(innerCallExp);
                        }
                    });
                };

                transverseCallExpressionArguments(callExp);

                // handle side.toUpperCase() scenarios
                if (callExp.expression?.kind === ts.SyntaxKind.PropertyAccessExpression) {
                    const propAccess = callExp.expression;
                    const leftSide = propAccess.expression;
                    if (leftSide.kind === ts.SyntaxKind.Identifier) {
                        if (this.ReassignedVars[this.getVarKey(leftSide)]) {
                            res.push(leftSide.escapedText);
                            const newNode = this.createNewNodeForFinalVar(leftSide.escapedText);
                            leftSide.escapedText = newNode.escapedText;
                            propAccess.expression = newNode;
                        }
                    }
                }
            } else if (prop.initializer?.kind === ts.SyntaxKind.BinaryExpression) {
                // handle scenarios like : 'a': b + b +x
                const binExp = prop.initializer;
                const checkNode = (n) => {
                    if (!n) {
                        return n;
                    }
                    if (n.kind === ts.SyntaxKind.Identifier) {
                        if (this.ReassignedVars[this.getVarKey(n)]) {
                            res.push(n.escapedText);
                            const newNode = this.createNewNodeForFinalVar(n.escapedText);
                            return newNode;
                        }
                    }
                    return n;
                };
                const traverseBinaryExpression = (be) => {
                    be.left = checkNode(be.left);
                    be.right = checkNode(be.right);
                    if (be?.left?.kind === ts.SyntaxKind.BinaryExpression) {
                        traverseBinaryExpression(be.left);
                    }
                    if (be?.right?.kind === ts.SyntaxKind.BinaryExpression) {
                        traverseBinaryExpression(be.right);
                    }
                };
                traverseBinaryExpression(binExp);

            } else if (prop.initializer?.kind === ts.SyntaxKind.ElementAccessExpression) {
                let left = prop.initializer.expression;
                const right = prop.initializer.argumentExpression;
                if (left.kind === ts.SyntaxKind.ElementAccessExpression) {
                    // handle x[a][b][c]... recursively
                    // let currentLeft = left;
                    while (left.kind === ts.SyntaxKind.ElementAccessExpression) {
                        // const innerLeft = currentLeft.expression;
                        left = left.expression;
                    }

                }
                if (this.ReassignedVars[this.getVarKey(left)]) {
                    const leftName = left.escapedText;
                    const newLeftName = this.getFinalVarName(leftName);
                    // const newLeftNode = ts.factory.createIdentifier(newLeftName);
                    left.escapedText = newLeftName;
                    // finalVars = finalVars + `final Object ${newLeftName} = ${leftName};\n`;
                    res.push(leftName);

                }
                if (right.kind === ts.SyntaxKind.Identifier) {
                    if (this.ReassignedVars[this.getVarKey(right)]) {
                        const rightName = right.escapedText;
                        const newRightName = this.getFinalVarName(rightName);
                        right.escapedText = newRightName;
                        res.push(rightName);
                    }
                }
            }
            else if (prop.initializer?.kind === ts.SyntaxKind.ObjectLiteralExpression) {
                const innerVars = this.getVarListFromObjectLiteralAndUpdateInPlace(prop.initializer);
                res = res.concat(innerVars);
            }
        });
        this.varListFromObjectLiterals[nodeId] =  [...new Set(res)];
        return [...new Set(res)];
    }

    printVariableDeclarationList(node, identation) {
        const declaration = node.declarations[0];

        let finalVars = '';
        if (declaration.initializer?.kind === ts.SyntaxKind.ObjectLiteralExpression) {
            // iterator over object and collect variables
            const varsList = this.getVarListFromObjectLiteralAndUpdateInPlace(declaration.initializer);
            finalVars = varsList.map( v=> `final Object ${this.getFinalVarName(v)} = ${this.getOriginalVarName(v)};`).join('\n' + this.getIden(identation));
            // console.log('Collected vars:', varsList);
        } else if (declaration.initializer?.kind === ts.SyntaxKind.CallExpression) {
            const callExp = declaration.initializer;
            const args = callExp.arguments ?? [];
            let varObj = [];
            args.forEach( (arg) => {
                if (arg.kind === ts.SyntaxKind.ObjectLiteralExpression) {
                    const objVariables = this.getVarListFromObjectLiteralAndUpdateInPlace(arg);
                    varObj = varObj.concat(objVariables);
                }
            });
            if (varObj.length > 0) {
                finalVars = varObj.map( v=> `final Object ${this.getFinalVarName(v)} = ${this.getOriginalVarName(v)};`).join('\n' + this.getIden(identation));
            }
        }

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
        finalVars = finalVars.length > 0 ?  this.getIden(identation) + finalVars + "\n" : finalVars;
        return (
            finalVars +
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
            if (current.kind === ts.SyntaxKind.PropertyAssignment) {
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
        const funcParams = node.parameters ?? [];
        const isAsync = this.isAsyncFunction(node);
        const initParams = [];
        // if (funcParams.length > 0) {
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

        if (isAsync) {
            const finalWrapperVars = this.printFinalOutsideMethodVariableWrappersIfAny(node, identation) + "\n";
            const insideWrappers = this.printInsideMethodVariableWrappersIfAny(node, identation + 1) + "\n";
            const body = (firstStatement + remainingString).split("\n").map(line => this.getIden(identation) + line).join("\n");
            const asyncBody = this.getIden(identation + 1) + "return java.util.concurrent.CompletableFuture.supplyAsync(() -> {\n" +
                    insideWrappers +
                    body + "\n" +
                    this.getIden(identation + 1) + "});\n";
            return blockOpen + finalWrapperVars + asyncBody + blockClose;

        }
        return blockOpen + firstStatement + remainingString + blockClose;
        // }

        return super.printFunctionBody(node, identation);
    }

    printInstanceOfExpression(node, identation) {
        const left = node.left.escapedText;
        const right = node.right.escapedText;
        return this.getIden(identation) + `${left} instanceof ${right}`;
    }

    printAwaitExpression(node, identation) {
        const expression = this.printNode(node.expression, identation);
        return `(${expression}).join()`;
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
        const isAsyncMethod = this.isAsyncFunction(node);
        const params = node.parameters.map(param => {
            const isReassignedVar = this.ReassignedVars[this.getVarKey(param)];
            let printedParam = this.printParameter(param);
            if (isAsyncMethod && isReassignedVar) {
                const paramName = param.name.escapedText;
                printedParam = printedParam.replace(paramName, `${paramName}2`);
                // we have to rename the param, to then create the final wrapper nad finally inside method body bind the original name
            }
            return printedParam;
        });
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
        const parameters = node?.parameters;
        const finalVarWrappers = [];

        if (parameters) {
            const isAsyncMethod = this.isAsyncFunction(node);
            parameters.forEach(param => {
                const isOptionalParam = param.initializer !== undefined || param.questionToken !== undefined;
                if (!isOptionalParam) {
                    const isReassignedVar = this.ReassignedVars[this.getVarKey(param)];
                    if (isAsyncMethod && isReassignedVar) {
                        const paramName = param.name.escapedText;
                        finalVarWrappers.push(this.getIden(identation + 1) + `final Object ${paramName}3 = ${paramName}2;`);
                    }
                }

            });
        }
        return finalVarWrappers.join("\n");
    }

    printInsideMethodVariableWrappersIfAny(node, identation) {
        const parameters = node?.parameters;
        const finalVarWrappers = [];

        if (parameters) {
            const isAsyncMethod = this.isAsyncFunction(node);
            parameters.forEach(param => {
                const isOptionalParam = param.initializer !== undefined || param.questionToken !== undefined;
                if (!isOptionalParam) {
                    const isReassignedVar = this.ReassignedVars[this.getVarKey(param)];
                    if (isAsyncMethod && isReassignedVar) {
                        const paramName = param.name.escapedText;
                        finalVarWrappers.push(this.getIden(identation + 1) + `Object ${paramName} = ${paramName}3;`);
                    }
                }

            });
        }
        return finalVarWrappers.join("\n");
    }

    printMethodDeclaration(node, identation) {


        const funcBody = this.printFunctionBody(node, identation); // print body first to get var reassignments filled

        let methodDef = this.printMethodDefinition(node, identation);

        methodDef += funcBody;

        return methodDef;
    }

    printMethodDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.transformMethodNameIfNeeded(name);

        let returnType = this.printFunctionType(node);

        // let modifiers = this.printModifiers(node);
        const defaultAccess = this.METHOD_DEFAULT_ACCESS ? this.METHOD_DEFAULT_ACCESS + " " : "";
        const modifiers = defaultAccess;
        // modifiers = modifiers ? modifiers + " " : defaultAccess;
        // modifiers =
        //     modifiers.indexOf("public") === -1 &&
        //         modifiers.indexOf("private") === -1 &&
        //         modifiers.indexOf("protected") === -1
        //         ? defaultAccess + modifiers
        //         : modifiers;

        let parsedArgs = undefined;

        // const methodOverride = (this.getMethodOverride(node) as any);
        // const isOverride = methodOverride !== undefined;

        // if (isOverride && (returnType === "Object" || returnType === "java.util.concurrent.CompletableFuture<Object>")) {
        //     returnType = this.printFunctionType(methodOverride);
        // }

        // if (isOverride && node.parameters.length > 0) {
        //     const first = node.parameters[0];
        //     const firstType = this.getType(first);

        //     if (firstType === undefined) {
        //         const currentArgs = node.parameters;
        //         const parentArgs = methodOverride.parameters;
        //         parsedArgs = "";
        //         parentArgs.forEach((param, index) => {
        //             const originalName = this.printNode(currentArgs[index].name, 0);
        //             const parsedArg = this.printParameteCustomName(param, originalName);
        //             parsedArgs += parsedArg;
        //             if (index < parentArgs.length - 1) {
        //                 parsedArgs += ", ";
        //             }
        //         });
        //     }
        // }

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
        return `(Math.floor(Double.parseDouble(Helpers.toString(${parsedArg}))))`;
    }

    printMathRoundCall(_node, _identation, parsedArg = undefined) {
        return `Math.round(Double.parseDouble(Helpers.toString(${parsedArg})))`;
    }

    printMathCeilCall(_node, _identation, parsedArg = undefined) {
        return `Math.ceil(Double.parseDouble(Helpers.toString(${parsedArg})))`;
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
            return `Helpers.opNeg(${leftSide})`;
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
                            `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${id.escapedText}((String)${parsedArg}) ${this.LINE_TERMINATOR}`
                        );
                    } else {
                        return (
                            this.getIden(identation) +
                            `Helpers.throwDynamicException(${id.escapedText}, ${parsedArg});return null;`
                        );
                    }
                }
                return (
                    this.getIden(identation) +
                    `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${newExpression}(${parsedArg}) ${this.LINE_TERMINATOR}`
                );
            } else if (expression.expression.kind === ts.SyntaxKind.ElementAccessExpression) {
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
                if (node.type.kind === ts.SyntaxKind.AnyKeyword) {
                    typeText = this.OBJECT_KEYWORD + " ";
                }
            }
        }
        return modifiers + " " + typeText + " ";
    }


    printObjectLiteralExpression(node, identation) {
        const objectBody = this.printObjectLiteralBody(node, identation);
        const formattedObjectBody = objectBody ? "\n" + objectBody + "\n" + this.getIden(identation) : objectBody;
        return  this.OBJECT_OPENING + formattedObjectBody + this.OBJECT_CLOSING;
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
        if (exp && exp.kind === ts.SyntaxKind.AsExpression && (exp.expression.kind === ts.SyntaxKind.ObjectLiteralExpression || ts.SyntaxKind.CallExpression)) {
            exp = exp.expression; // go over something like return {} as SomeType
        }
        let finalVars = '';
        if (exp && exp?.kind === ts.SyntaxKind.ObjectLiteralExpression) {
            const varsList = this.getVarListFromObjectLiteralAndUpdateInPlace(exp);
            finalVars = varsList.map( v=> `final Object ${this.getFinalVarName(v)} = ${this.getOriginalVarName(v)};`).join('\n' + this.getIden(identation));
        } else if (exp && exp?.kind === ts.SyntaxKind.CallExpression) {
            // const callExpr = exp;
            // const callExprArgs = exp.arguments;
            // if (callExprArgs && callExprArgs.length > 0) {
            //     callExprArgs.forEach( (arg, i) => {
            //         if (arg.kind === ts.SyntaxKind.ObjectLiteralExpression) {
            //             const varsList = this.getVarListFromObjectLiteralAndUpdateInPlace(arg);
            //             finalVars = finalVars + varsList.map( v=> `final Object ${this.getFinalVarName(v)} = ${this.getOriginalVarName(v)};`).join('\n' + this.getIden(identation));
            //         }
            //     });
            // }
            const objectsFromCall = this.getObjectLiteralFromCallExpressionArguments(exp);
            for (const objLiteral of objectsFromCall) {
                const varsList = this.getVarListFromObjectLiteralAndUpdateInPlace(objLiteral);
                if (varsList.length > 0) {
                    finalVars = finalVars + varsList.map( v=> `final Object ${this.getFinalVarName(v)} = ${this.getOriginalVarName(v)};`).join('\n' + this.getIden(identation));
                }
            }
        } else if (exp && exp?.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            const elements = exp?.elements ?? [];
            for (const element of elements) {
                if (element.kind === ts.SyntaxKind.CallExpression) {
                    const objectsFromCall = this.getObjectLiteralFromCallExpressionArguments(element);
                    for (const objLiteral of objectsFromCall) {
                        const varsList = this.getVarListFromObjectLiteralAndUpdateInPlace(objLiteral);
                        if (varsList.length > 0) {
                            finalVars = finalVars + varsList.map( v=> `final Object ${this.getFinalVarName(v)} = ${this.getOriginalVarName(v)};`).join('\n' + this.getIden(identation));
                        }
                    }
                }
            }
        }
        let rightPart = exp ? (' ' + this.printNode(exp, identation)) : '';
        rightPart = rightPart.trim();
        rightPart = rightPart ? ' ' + rightPart + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
        finalVars = finalVars.length > 0 ?  this.getIden(identation) + finalVars + "\n" : finalVars;
        return leadingComment + finalVars + this.getIden(identation) + this.RETURN_TOKEN + rightPart + trailingComment;
    }
}
