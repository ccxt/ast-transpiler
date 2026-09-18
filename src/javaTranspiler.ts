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

// every assignment operator (`=`, `+=`, `??=`, ...) but no comparison (`===`, `!==`, `<=`, `>=`):
// an element access on the left of one of these is a write site and keeps the base emission
const JAVA_ASSIGNMENT_OPERATOR_KINDS: Set<number> = (() => {
    const kinds: any = ts.SyntaxKind;
    const names = Object.keys(kinds).filter((name) => name.endsWith('EqualsToken')
        && !/^Equals|^Exclamation|^LessThan|^GreaterThan/.test(name));
    return new Set<number>(([ 'EqualsToken' ].concat(names)).map((name) => kinds[name]).filter((kind) => kind !== undefined));
})();

// ===== falsy-wrapper removal: `Helpers.isTrue(<X>)` -> native when <X> is already a Java boolean
//
// The falsy wrapper wraps every condition the printer cannot prove boolean. `isTrue` itself
// does `null -> false`; `Boolean -> value`; `Long/Integer/Double -> != 0`; everything else
// `!= false`. So the wrapper is redundant when the Java value is a primitive `boolean`, and
// becomes `Boolean.TRUE.equals(x)` when it is a `Boolean` box (or null), which is exactly the
// same answer for a box the wrapper would test and cannot throw where the helper did not.

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

// hand-written base methods declared `public boolean` (BaseExchange.java): a call prints a
// primitive Java boolean, so a local fed by one holds a Boolean box or null.
const JAVA_BOOLEAN_BASE_CALLS = new Set([
    'valueIsDefined',
    'inArray',
    'isEmpty',
    'isJsonEncodedObject',
    'isBinaryMessage',
]);

// operators whose printed Java form is a primitive boolean on every path: the logical ones and
// every comparison / `in` / `instanceof`-style test the printer lowers to Helpers.isEqual /
// isGreaterThan / inOp (all declared `public static boolean`) or to a native Java boolean
const JAVA_BOOLEAN_OPERATOR_KINDS: Set<number> = (() => {
    const k: any = ts.SyntaxKind;
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

// the TypeScript side of the box proof: `boolean` (or a boolean literal type) and nothing else -
// an `any`, an `undefined`/`null` union, a type parameter or the nullable aliases (Bool/...) can
// hold a non-boolean box at runtime, which the wrapper absorbs and `Boolean.TRUE.equals` must not
const JAVA_BOOLEAN_EXCLUDED_TYPE_FLAGS: number =
    ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Undefined | ts.TypeFlags.Null
    | ts.TypeFlags.Void | ts.TypeFlags.Never | ts.TypeFlags.TypeParameter | ts.TypeFlags.Conditional
    | ts.TypeFlags.Enum | ts.TypeFlags.EnumLiteral;


// the relational `Precise.string*` statics are declared `public static boolean` in the
// hand-written java/lib/src/main/java/io/github/ccxt/base/Precise.java, so their printed call is
// already a Java primitive boolean (the String-returning statics are NOT listed here)
const JAVA_PRECISE_BOOLEAN_STATICS: Set<string> = new Set([
    'stringEq', 'stringEquals', 'stringGt', 'stringGe', 'stringLt', 'stringLe',
]);

// ===== `this.<name>(...)` calls whose Java return is a boolean =====
//
// The printer erases every TS return annotation to `Object` (DEFAULT_RETURN_TYPE), so a
// condition wrapping one of these calls in Helpers.isTrue re-tests a value the port's
// hand-written Java base already returns as a boolean. The Java declaration is the proof:
// these methods are hand-written in java/lib/src/main/java/io/github/ccxt/BaseExchange.java,
// above the "METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT" delimiter, with exactly
// these returns -- and a Java override must be covariant, so no generated venue method can
// widen them (census: no ts/src/exchanges, pro or prediction file declares any of them).
const JAVA_THIS_BOOLEAN_METHODS = new Set<string>([
    'inArray',              // public boolean inArray (Object elem, Object list2)
    'isArray',              // public boolean isArray (Object a)
    'isEmpty',              // public boolean isEmpty (Object a)
    'valueIsDefined',       // public boolean valueIsDefined (Object value)
    'isJsonEncodedObject',  // public boolean isJsonEncodedObject (Object str)
    'isBinaryMessage',      // public boolean isBinaryMessage (Object message)
]);

// The boolean accessors that are GENERATED below the delimiter (`Object safeBool (...)`) hand
// the caller's own `defaultValue` back untouched whenever the found value is not a Boolean,
// so the box is Boolean-or-null only when the call's default argument is absent or a boolean
// literal (same proof as build/java-local-types.js HANDLE_ELEMENT_TYPES.defaultArg).
// Value = the index of that default argument in the printed call.
const JAVA_THIS_BOOLEAN_BOX_METHODS: { [name: string]: number } = {
    'safeBool': 2,
    'safeBool2': 3,
    'safeBoolN': 2,
};

// the Java spellings a consumer declares a dict local with (import-shortened forms
// included); every other declared type keeps Helpers.GetValue
const JAVA_DECLARED_MAP_TYPES = /^(java\.util\.)?(Map|HashMap)\s*<\s*String\s*,\s*Object\s*>$/;

export class JavaTranspiler extends BaseTranspiler {

    countRequiredParameters(declaration) {
        // parameters with no default, no question token and no rest are required positionally
        const params = declaration?.parameters ?? [];
        let required = 0;
        for (const p of params) {
            if (p.initializer === undefined && p.questionToken === undefined && p.dotDotDotToken === undefined) {
                required++;
            }
        }
        return required;
    }

    printArgsForCallExpression(node, identation) {
        let args: readonly any[] = node.arguments ?? [];
        const callee = node.expression;
        const isThisCall = callee?.kind === ts.SyntaxKind.PropertyAccessExpression
            && callee.expression?.kind === ts.SyntaxKind.ThisKeyword;
        if (isThisCall && args.length > 0) {
            const last = args[args.length - 1];
            const isNullish = last.kind === ts.SyntaxKind.NullKeyword
                || (last.kind === ts.SyntaxKind.Identifier && last.escapedText === 'undefined');
            // the trailing nullish may only be dropped when it sits in the OPTIONAL tail
            // of the resolved signature - a required positional parameter passed as an
            // explicit undefined (e.g. dydx signDydxTx) must be kept, otherwise the
            // emitted call breaks arity, see https://github.com/ccxt/ccxt/actions/runs/31321542066
            let inOptionalTail = false;
            if (isNullish) {
                const signature = this.getChecker().getResolvedSignature(node);
                const declaration = signature?.declaration;
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
        return args.map((a) => this.printNode(a, identation).trim()).join(", ");
    }

    binaryExpressionsWrappers;

    varListFromObjectLiterals = {};
    // binary operators whose printed Java is a primitive boolean: Helpers.isEqual (and the
    // negated `!Helpers.isEqual` / `<` / `>` / `<=` / `>=` family), Helpers.inOp,
    // Helpers.isInstance and the native `&&` / `||`
    javaBooleanOperators = [
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.LessThanToken,
        ts.SyntaxKind.LessThanEqualsToken,
        ts.SyntaxKind.GreaterThanToken,
        ts.SyntaxKind.GreaterThanEqualsToken,
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.InKeyword,
        ts.SyntaxKind.InstanceOfKeyword,
    ];
    // Per-function analysis results. Populated by analyzeFinalVars at the start of
    // printFunctionBody and consumed during printing of the same function body.
    usageToFinalName: WeakMap<ts.Node, string> = new WeakMap();
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
    finalVarMutations: Array<{ node: any; escapedText: any; ownGetFullText: boolean; getFullText: any }> = [];
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
        if (Number(nodeText) > javaMax && Number.isInteger(Number(nodeText)) && node.text.indexOf('e') === -1) {
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

        // keep the same class-reference typeof-guarding logic as your original file,
        // but run the syntactic (parent-position) checks first: they exclude the vast
        // majority of identifiers without paying for a type-checker lookup
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
            const type = this.getChecker().getTypeAtLocation(node);
            const typeSymbol = type?.symbol;
            if (typeSymbol !== undefined) {
                const decl = typeSymbol?.declarations ?? [];
                let isBuiltIn = undefined;
                if (decl.length > 0) {
                    isBuiltIn =
                        decl[0].getSourceFile().fileName.indexOf("typescript") > -1;
                }

                if (isBuiltIn !== undefined && !isBuiltIn) {
                    const symbol = this.getChecker().getSymbolAtLocation(node);
                    let isClassDeclaration = false;
                    if (symbol) {
                        const first = symbol.declarations[0];
                        if (first.kind === ts.SyntaxKind.ClassDeclaration) {
                            isClassDeclaration = true;
                        }
                        if (first.kind === ts.SyntaxKind.ImportSpecifier) {
                            const importedSymbol = this.getChecker().getAliasedSymbol(symbol);
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
                const decls = this.buildFinalVarDeclarations(finalVars, identation);
                if (decls) {
                    return decls + "\n" + this.getIden(identation);
                }
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
        const type = this.getChecker().getResolvedSignature(node);
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
        // should return the name of the method this node belongs to, if any;
        // the raw AST name is enough here — the result is only used as a scoping
        // key, and printNode on an identifier consults the type checker
        let current = node?.parent;
        while (current) {
            if (ts.isMethodDeclaration(current) || ts.isFunctionDeclaration(current)) {
                return String((current.name as any)?.escapedText ?? '');
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
            if (ts.isClassDeclaration(current)) {
                return String((current.name as any)?.escapedText ?? '');
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

    // Static operand family of one side of an equality, undefined when the checker proves
    // nothing usable. Null/undefined union members are folded away: Objects.equals handles
    // those exactly like the helper, so `string | undefined` still counts as string.
    equalityOperandFamily(type: any): string | undefined {
        if (type === undefined || type === null) {
            return undefined;
        }
        const flags = type.flags;
        if (flags & ts.TypeFlags.Intersection) {
            return undefined;
        }
        if (flags & ts.TypeFlags.Union) {
            // `boolean` is itself the union true|false and carries the Boolean bit
            if (flags & ts.TypeFlags.Boolean) {
                return 'boolean';
            }
            const families = new Set<string>((type.types ?? []).map((t) => this.equalityOperandFamily(t)));
            families.delete(undefined as any);
            families.delete('null');
            return families.size === 1 ? families.values().next().value : undefined;
        }
        if (flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
            return 'string';
        }
        if (flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
            return 'boolean';
        }
        if (flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
            return 'null';
        }
        return undefined;
    }

    // The null/undefined literal: its Java text is `null`, so Objects.equals(x, null)
    // is literally the identity test Helpers.isEqual performs on that operand.
    isNullishLiteral(node): boolean {
        return node?.kind === ts.SyntaxKind.NullKeyword
            || (node?.kind === ts.SyntaxKind.Identifier && node.escapedText === 'undefined');
    }

    // ==/===/!=/!== become java.util.Objects.equals once the checker proves one operand is
    // a string, a boolean or the null/undefined literal: for those Helpers.isEqual reduces
    // to Objects.equals (value compare, class-strict, no numeric promotion). Numbers stay.
    printNativeEqualityIfProvable(node, leftText: string, rightText: string): string | undefined {
        const op = node.operatorToken.kind;
        const negated = op === ts.SyntaxKind.ExclamationEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken;
        if (!negated && op !== ts.SyntaxKind.EqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsEqualsToken) {
            return undefined;
        }
        const checker = this.getChecker();
        const leftFamily = this.equalityOperandFamily(checker?.getTypeAtLocation(node.left));
        const rightFamily = this.equalityOperandFamily(checker?.getTypeAtLocation(node.right));
        const leftProved = leftFamily !== undefined && (leftFamily !== 'null' || this.isNullishLiteral(node.left));
        const rightProved = rightFamily !== undefined && (rightFamily !== 'null' || this.isNullishLiteral(node.right));
        if (!leftProved && !rightProved) {
            return undefined;
        }
        const equalCall = `java.util.Objects.equals(${leftText}, ${rightText})`;
        return negated ? `!${equalCall}` : equalCall;
    }

    // `x[k] = v` prints the runtime helper by default. Helpers.addElementToObject
    // exists for receivers the printer cannot type (Lists, arbitrary objects via
    // reflection) and for ConcurrentHashMap null-removal, so the native Map.put is
    // printed only when the checker excludes all of those.
    elementWriteTargetsMap(container, base, keys): boolean {
        const lastKey = keys[keys.length - 1];
        if (!ts.isStringLiteral(lastKey) && !this.isJavaStringType(this.getChecker().getTypeAtLocation(lastKey))) {
            return false; // Map.put takes the String key; every other key prints as Object
        }
        if (ts.isPropertyAccessExpression(base) && base.expression.kind === ts.SyntaxKind.ThisKeyword) {
            return false; // field maps are ConcurrentHashMaps (a null value must remove, not put) and other threads read them
        }
        return this.isDictionaryType(container) || this.isPlainHashMapReceiver(container, keys);
    }

    // a key proven by the checker to be a string prints as a java String: the read is
    // the same expression, only the key needs the (String) cast the typed put demands
    elementWriteKeyText(key, keyText: string): string {
        if (ts.isStringLiteral(key)) {
            return keyText;
        }
        return `(String)${keyText}`;
    }

    // Receivers that are a plain java.util.HashMap at runtime, where ".put" and the
    // helper's map branch are the same write: a local initialized with an object
    // literal or with a call whose every return is such a literal (this.account()).
    // Lists (append), class instances (reflection) and ConcurrentHashMaps stay helpers.
    isPlainHashMapReceiver(container, keys: any[]): boolean {
        if (keys.length !== 1 || container === undefined || container.kind !== ts.SyntaxKind.Identifier) {
            return false; // only a direct write on the proven local, no read in between
        }
        let symbol: any;
        try {
            symbol = this.getChecker().getSymbolAtLocation(container);
        } catch (e) {
            return false;
        }
        const declaration: any = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
        if (!declaration || declaration.kind !== ts.SyntaxKind.VariableDeclaration || !declaration.initializer) {
            return false; // parameters and receivers without an initializer stay the helper
        }
        const initializer = this.unwrapPrintTransparentExpression(declaration.initializer);
        const proven = ts.isObjectLiteralExpression(initializer)
            || (ts.isCallExpression(initializer) && this.callAlwaysReturnsPlainHashMap(initializer, 0));
        if (!proven) {
            return false;
        }
        return !this.javaLocalIsReassigned(container); // a later write can hand the local another type (D2)
    }

    unwrapPrintTransparentExpression(node): any {
        let current = node;
        while (current && (ts.isParenthesizedExpression(current)
            || ts.isAsExpression(current)
            || ts.isTypeAssertionExpression(current)
            || current.kind === ts.SyntaxKind.NonNullExpression)) {
            current = current.expression;
        }
        return current;
    }

    // Every write of the local in its enclosing function must be the element write
    // itself; an assignment could replace the HashMap with a List or a class instance.
    javaLocalIsReassigned(node): boolean {
        let scope: any = node;
        while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) {
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
            if (current.kind === ts.SyntaxKind.BinaryExpression
                && current.operatorToken.kind === ts.SyntaxKind.EqualsToken
                && current.left.kind === ts.SyntaxKind.Identifier
                && this.getChecker().getSymbolAtLocation(current.left) === symbol) {
                reassigned = true;
                return;
            }
            if ((ts.isForOfStatement(current) || ts.isForInStatement(current))
                && ts.isIdentifier(current.initializer)
                && this.getChecker().getSymbolAtLocation(current.initializer) === symbol) {
                reassigned = true;
                return;
            }
            ts.forEachChild(current, walk);
        };
        walk(scope);
        return reassigned;
    }

    // A call whose callee body returns object literals only, so the value it hands
    // back is always a freshly built HashMap on the Java side as well.
    callAlwaysReturnsPlainHashMap(node, depth: number): boolean {
        if (depth > 3) {
            return false;
        }
        const checker: any = this.getChecker();
        let callee: any = this.unwrapPrintTransparentExpression(node.expression);
        if (callee !== undefined && ts.isPropertyAccessExpression(callee)) {
            if (callee.expression.kind !== ts.SyntaxKind.ThisKeyword) {
                return false; // this.<method>() only: another receiver's body is not in this class
            }
            callee = callee.name;
        }
        if (callee === undefined || callee.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        let symbol: any;
        try {
            symbol = checker.getSymbolAtLocation(callee);
        } catch (e) {
            return false;
        }
        const declaration: any = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
        if (!declaration || (declaration.kind !== ts.SyntaxKind.MethodDeclaration && declaration.kind !== ts.SyntaxKind.FunctionDeclaration)) {
            return false;
        }
        if (!this.returnTypePrintsAsHashMap(declaration)) {
            return false;
        }
        const body = declaration.body;
        if (!body || !ts.isBlock(body)) {
            return false;
        }
        let plain = true;
        let returns = 0;
        const walk = (current) => {
            if (!plain || current === undefined) {
                return;
            }
            if (ts.isFunctionLike(current) && current !== declaration) {
                return; // a nested closure returns into its own call
            }
            if (ts.isReturnStatement(current)) {
                returns += 1;
                const expression = current.expression;
                if (expression === undefined) {
                    plain = false;
                    return;
                }
                const value = this.unwrapPrintTransparentExpression(expression);
                if (ts.isObjectLiteralExpression(value)) {
                    return;
                }
                if (ts.isCallExpression(value) && this.callAlwaysReturnsPlainHashMap(value, depth + 1)) {
                    return;
                }
                plain = false;
                return;
            }
            ts.forEachChild(current, walk);
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
            const signature: any = checker.getSignatureFromDeclaration(declaration);
            const type: any = signature?.getReturnType();
            if (!type || (type.flags & ts.TypeFlags.Object) === 0) {
                return false;
            }
            if (checker.isArrayType(type) || checker.isTupleType(type)) {
                return false;
            }
            const declarations = type.getSymbol()?.declarations ?? [];
            if (declarations.some((d) => d.kind === ts.SyntaxKind.ClassDeclaration)) {
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
            const type: any = checker.getTypeAtLocation(node);
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
        if (flags & ts.TypeFlags.Union) {
            const parts: any[] = type.types ?? [];
            return parts.length > 0 && parts.every((t) => this.isDictionaryTsType(t, checker, depth + 1));
        }
        if (!(flags & ts.TypeFlags.Object)) {
            return false;
        }
        try {
            if (checker.isArrayType(type) || checker.isTupleType(type)) {
                return false;
            }
            return checker.getIndexTypeOfType(type, ts.IndexKind.String) !== undefined;
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
        if (!node || !ts.isNumericLiteral(node)) {
            return undefined;
        }
        const text = node.text;
        if (text.indexOf('.') !== -1 || text.indexOf('e') !== -1 || text.indexOf('E') !== -1) {
            return undefined;
        }
        return Number(text) > 2147483647 ? 'long' : 'int';
    }

    // A rest parameter is a Java varargs array, not a List, so a List cast on it
    // would throw ClassCastException; simple identifier aliases are followed too.
    isVarargsArrayReference(node, depth = 0) {
        if (!node || depth > 4 || node.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        const symbol = this.getChecker().getSymbolAtLocation(node);
        const declaration: any = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
        if (!declaration) {
            return false;
        }
        if (declaration.dotDotDotToken !== undefined) {
            return true;
        }
        const initializer = declaration.initializer;
        if (initializer && ts.isIdentifier(initializer)) {
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
        return type.target?.symbol?.escapedName === 'ReadonlyArray';
    }

    // `.length` is a Java int for exactly these two receivers; every other
    // receiver keeps Helpers.getArrayLength, whose result type is not proven
    javaLengthKind(expression) {
        const type = this.getChecker().getTypeAtLocation(expression);
        if (this.isStringType(type.flags)) {
            return 'String';
        }
        if (this.isJavaListType(type) && !this.isVarargsArrayReference(expression)) {
            return 'List';
        }
        return undefined;
    }

    // shared by printLengthProperty and transformPropertyAcessExpressionIfNeeded
    printJavaLength(expression, leftSide) {
        const kind = this.javaLengthKind(expression);
        if (kind === 'String') {
            return `((String)${leftSide}).length()`;
        }
        if (kind === 'List') {
            return `((java.util.List<?>)${leftSide}).size()`;
        }
        return `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`;
    }

    // `for (var i = <int literal>; ...; i++)`: printForStatement rewrites the
    // Object initializer into `var`, so javac infers a primitive counter there,
    // and only ++/-- writes keep it primitive
    isJavaPrimitiveForCounter(node) {
        if (node.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        const comparison = node.parent;
        if (!comparison || comparison.kind !== ts.SyntaxKind.BinaryExpression) {
            return false;
        }
        const forStatement = comparison.parent;
        if (!forStatement || forStatement.kind !== ts.SyntaxKind.ForStatement || forStatement.condition !== comparison) {
            return false;
        }
        const initializer = forStatement.initializer;
        if (!initializer || initializer.kind !== ts.SyntaxKind.VariableDeclarationList) {
            return false;
        }
        const declarations = initializer.declarations ?? [];
        if (declarations.length !== 1) {
            return false;
        }
        const declaration = declarations[0];
        if (!ts.isIdentifier(declaration.name) || declaration.name.escapedText !== node.escapedText) {
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
        if (!incrementor || incrementor.operand?.kind !== ts.SyntaxKind.Identifier || incrementor.operand.escapedText !== node.escapedText) {
            return false;
        }
        return incrementor.kind === ts.SyntaxKind.PostfixUnaryExpression || incrementor.kind === ts.SyntaxKind.PrefixUnaryExpression;
    }

    // Java primitive kind of a comparison operand; undefined keeps the helper
    javaPrimitiveOperandKind(node) {
        const literalKind = this.javaIntegerLiteralKind(node);
        if (literalKind !== undefined) {
            return literalKind;
        }
        if (this.isJavaPrimitiveForCounter(node)) {
            return 'int';
        }
        if (node.kind === ts.SyntaxKind.PropertyAccessExpression && node.name.escapedText === 'length') {
            return this.javaLengthKind(node.expression) !== undefined ? 'int' : undefined;
        }
        return undefined;
    }

    // checker proof that the value is printed as a java.util.HashMap: TS object
    // shapes (interfaces, object literals, aliases) become HashMaps, while class
    // instances are real Java objects and arrays/unions are not proven here
    isJavaMapType(type) {
        if (!type || (type.flags & ts.TypeFlags.Object) === 0) {
            return false;
        }
        const checker = this.getChecker();
        if (checker.isArrayType(type) || checker.isTupleType(type)) {
            return false;
        }
        if (type.getCallSignatures().length > 0) {
            return false;
        }
        const declarations = type.getSymbol()?.declarations ?? [];
        return !declarations.some((declaration) => declaration.kind === ts.SyntaxKind.ClassDeclaration
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
        if ((type.flags & ts.TypeFlags.Union) === 0) {
            return false;
        }
        return type.types.every((member) => this.isStringType(member.flags));
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

            // Build GetValue(GetValue( ... )) chain for all but the last key; the first
            // step reads the receiver itself, so a declared map indexes natively and only
            // the `any` steps above it keep the helper (Go: goElementWriteChain).
            let acc = containerStr;
            let firstKey = 0;
            if ((keyStrs.length > 1) && this.javaDeclaredMapReceiver(baseExpr)
                && ts.isStringLiteralLike(keys[0])) {
                acc = `${containerStr}.get(${keyStrs[0]})`;
                firstKey = 1;
            }
            for (let i = firstKey; i < keyStrs.length - 1; i++) {
                acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
            }

            let prefixes = this.getBinaryExpressionPrefixes(node, identation);
            prefixes = prefixes ? prefixes : "";


            const lastKey = keyStrs[keyStrs.length - 1];
            const rhs     = this.printNode(right, 0);
            const keyArg  = this.elementWriteKeyText(keys[keys.length - 1], lastKey);

            if (this.elementWriteTargetsMap(left.expression, baseExpr, keys)) {
                return `${prefixes}((${this.OBJECT_KEYWORD})${acc}).put(${keyArg}, ${rhs})`;
            }

            return `${prefixes}Helpers.addElementToObject(${acc}, ${lastKey}, ${rhs})`;
        }

        if (op === ts.SyntaxKind.InKeyword) {
            const objectType = this.getChecker().getTypeAtLocation(right);
            const keyType = this.getChecker().getTypeAtLocation(left);
            if (this.isJavaMapType(objectType) && this.isJavaStringType(keyType)) {
                return `((java.util.Map<?, ?>)${this.printNode(right, 0)}).containsKey(${this.printNode(left, 0)})`;
            }
            return `Helpers.inOp(${this.printNode(right, 0)}, ${this.printNode(left, 0)})`;
        }

        // native comparison for two operands that are provably Java int/long
        // values; the helper's ordering is identical for every int/long pair
        if (op === ts.SyntaxKind.LessThanToken || op === ts.SyntaxKind.GreaterThanToken ||
            op === ts.SyntaxKind.LessThanEqualsToken || op === ts.SyntaxKind.GreaterThanEqualsToken) {
            if (this.javaPrimitiveOperandKind(left) !== undefined && this.javaPrimitiveOperandKind(right) !== undefined) {
                return `${this.printNode(left, 0)} ${this.SupportedKindNames[op]} ${this.printNode(right, 0)}`;
            }
        }

        // only print the operands when this op is actually handled here; otherwise
        // the base printBinaryExpression prints them, and doing it eagerly means
        // every unhandled binary expression gets its subtrees printed twice
        if (op === ts.SyntaxKind.PlusEqualsToken || op === ts.SyntaxKind.MinusEqualsToken || op in this.binaryExpressionsWrappers) {
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);

            const inlined = this.printInlineHelperArithmetic(left, right, leftText, rightText, op);
            if (inlined !== undefined) {
                return inlined;
            }


            if (op === ts.SyntaxKind.PlusEqualsToken) {
                return `${leftText} = Helpers.add(${leftText}, ${rightText})`;
            }

            if (op === ts.SyntaxKind.MinusEqualsToken) {
                return `${leftText} = Helpers.subtract(${leftText}, ${rightText})`;
            }

            const wrapper = this.binaryExpressionsWrappers[op];
            const nativeEquality = this.printNativeEqualityIfProvable(node, leftText, rightText);
            if (nativeEquality !== undefined) {
                return nativeEquality;
            }
            const open = wrapper[0];
            const close = wrapper[1];
            return `${open}${leftText}, ${rightText}${close}`;
        }

        return undefined;
    }


    // dict-shaped values are Map<String, Object> in the Java port: raw HashMap/ConcurrentHashMap
    // or a types.TypedMap view (AbstractMap<String, Object> over the raw payload). Proven by the
    // checker (string index signature, or an interface/alias declared in the base types file).
    isJavaMapStructureType(type) {
        if (type === undefined) {
            return false;
        }
        const excludedFlags = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Union
            | ts.TypeFlags.Intersection | ts.TypeFlags.Undefined | ts.TypeFlags.Null
            | ts.TypeFlags.TypeParameter | ts.TypeFlags.Conditional | ts.TypeFlags.Never;
        if ((type.flags & excludedFlags) !== 0) {
            return false;
        }
        const checker = this.getChecker();
        if (checker.isArrayType(type) || checker.isTupleType(type)) {
            return false;
        }
        if (type.getStringIndexType() !== undefined) {
            return true;
        }
        const symbol = (type as any).aliasSymbol ?? type.symbol;
        const declaration = symbol?.declarations?.[0];
        const fileName = declaration?.getSourceFile?.()?.fileName;
        return fileName !== undefined && /(^|\/)ts\/src\/base\/types\.ts$/.test(fileName);
    }

    // tuples are List<Object> in the Java port (types.TypedList). Only an index inside the
    // tuple's required elements goes native: .get(i) throws out of range where the helper
    // returns null, so non-tuple array reads (any[], string[], ...) keep the helper.
    isJavaListStructureType(type) {
        if (type === undefined) {
            return false;
        }
        const excludedFlags = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Union
            | ts.TypeFlags.Intersection | ts.TypeFlags.Undefined | ts.TypeFlags.Null
            | ts.TypeFlags.TypeParameter | ts.TypeFlags.Conditional | ts.TypeFlags.Never;
        if ((type.flags & excludedFlags) !== 0) {
            return false;
        }
        return this.getChecker().isTupleType(type);
    }

    tupleRequiredElementCount(type) {
        const flags = (type as any)?.target?.elementFlags ?? (type as any)?.elementFlags ?? [];
        let required = 0;
        for (const flag of flags) {
            if (flag !== ts.ElementFlags.Optional && flag !== ts.ElementFlags.Rest) {
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
        if (type === undefined) {
            return false;
        }
        const excludedFlags = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Union
            | ts.TypeFlags.Intersection | ts.TypeFlags.Undefined | ts.TypeFlags.Null
            | ts.TypeFlags.TypeParameter | ts.TypeFlags.Conditional | ts.TypeFlags.Never;
        if ((type.flags & excludedFlags) !== 0) {
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
        case ts.SyntaxKind.Identifier:
        case ts.SyntaxKind.ThisKeyword:
            return true;
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.javaSideEffectFreeReference(node.expression);
        case ts.SyntaxKind.PropertyAccessExpression:
            return this.javaSideEffectFreeReference(node.expression);
        default:
            return false;
        }
    }

    // receivers whose printed elements the ccxt post-pass types as String FROM the helper call
    // (`x.split(sep)` and string-literal array producers): those locals narrow to String only
    // while the read prints `Helpers.GetValue(`, so their reads keep the helper.
    javaStringElementsReceiver(node) {
        if (!ts.isIdentifier(node)) {
            return false;
        }
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
        if (declaration === undefined || !ts.isVariableDeclaration(declaration)) {
            return false;
        }
        const initializer = declaration.initializer;
        if (initializer === undefined) {
            return false;
        }
        if (ts.isCallExpression(initializer) && ts.isPropertyAccessExpression(initializer.expression)) {
            return initializer.expression.name?.escapedText === 'split';
        }
        if (ts.isArrayLiteralExpression(initializer)) {
            return initializer.elements.length > 0 && initializer.elements.every((element) =>
                element.kind === ts.SyntaxKind.StringLiteral
                || element.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral);
        }
        return false;
    }

    isLeftSideOfAssignment(node) {
        const parent = node.parent;
        if (parent?.kind !== ts.SyntaxKind.BinaryExpression || parent.left !== node) {
            return false;
        }
        return JAVA_ASSIGNMENT_OPERATOR_KINDS.has(parent.operatorToken.kind);
    }

    // The declared Java type of a local is known to the pass that rewrites the declaration
    // text (build/java-local-types.js): it records every local it typed here. Reads consult
    // it; with no consumer installed the table is empty and every read keeps the helper.
    javaDeclaredLocalTypeResolver: ((declaration: ts.Node) => string | undefined) | undefined;

    // the declaration node behind an identifier, when the checker resolves one
    javaDeclarationOfIdentifier(expression) {
        if (expression === undefined || !ts.isIdentifier(expression)) {
            return undefined;
        }
        let symbol;
        try {
            symbol = this.getChecker().getSymbolAtLocation(expression);
        } catch (e) {
            return undefined;
        }
        const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
        if (declaration === undefined) {
            return undefined;
        }
        const kind = declaration.kind;
        if (kind !== ts.SyntaxKind.VariableDeclaration && kind !== ts.SyntaxKind.Parameter) {
            return undefined;
        }
        return declaration;
    }

    // `x["lit"]` where the consumer declares x as a Java map: the native read returns the
    // element or null, exactly what the helper's Map branch returns, and the declaration
    // already carries the type, so no cast is needed.
    javaDeclaredMapReceiver(expression) {
        const resolver = this.javaDeclaredLocalTypeResolver;
        if (resolver === undefined) {
            return false;
        }
        const declaration = this.javaDeclarationOfIdentifier(expression);
        if (declaration === undefined) {
            return false;
        }
        if (expression.escapedText !== declaration.name?.escapedText) {
            return false; // a capture rename prints `final Object finalX = x` (Object)
        }
        let type;
        try {
            type = resolver(declaration);
        } catch (e) {
            return false;
        }
        if (typeof type !== 'string') {
            return false;
        }
        return JAVA_DECLARED_MAP_TYPES.test(type.trim());
    }

    // `x[k]` reads: emit the native container accessor when the checker proves the Java
    // representation of `x`, otherwise return undefined so the base prints Helpers.GetValue.
    printCheckerTypedElementAccessRead(node) {
        const key = node.argumentExpression;
        const isStringKey = ts.isStringLiteralLike(key);
        const isNumberKey = ts.isNumericLiteral(key);
        if (!isStringKey && !isNumberKey) {
            return undefined;
        }
        if (this.printElementAccessExpressionExceptionIfAny(node) !== undefined) {
            return undefined; // an exchange-specific override wins, the base prints it
        }
        if (this.isLeftSideOfAssignment(node)) {
            return undefined;
        }
        const type = this.getChecker().getTypeAtLocation(node.expression);
        if (isStringKey) {
            if (!this.isJavaMapStructureType(type)) {
                if (!this.javaDeclaredMapReceiver(node.expression)) {
                    return undefined;
                }
                // the declared local is already a map: the accessor binds with no cast
                return `${this.printNode(node.expression, 0)}.get(${this.printNode(key, 0)})`;
            }
            const target = this.printNode(node.expression, 0);
            return `((java.util.Map<String, Object>)${target}).get(${this.printNode(key, 0)})`;
        }
        const index = Number(key.text);
        if (!Number.isInteger(index) || index < 0) {
            return undefined;
        }
        if (this.isJavaListStructureType(type)) {
            if (index >= this.tupleRequiredElementCount(type)) {
                return undefined;
            }
            const target = this.printNode(node.expression, 0);
            return `((java.util.List<Object>)${target}).get(${this.printNode(key, 0)})`;
        }
        if (!this.isJavaArrayStructureType(type)) {
            return undefined;
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
        const native = this.printCheckerTypedElementAccessRead(node);
        if (native !== undefined) {
            return native;
        }
        return super.printElementAccessExpression(node, identation);
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
        let type;
        try {
            type = this.getChecker().getTypeAtLocation(node);
        } catch (e) {
            return undefined;
        }
        if (type === undefined || type.aliasSymbol !== undefined) {
            return undefined;
        }
        const flags = type.flags;
        if (flags === ts.TypeFlags.String || flags === ts.TypeFlags.StringLiteral) {
            return 'string';
        }
        if (flags === ts.TypeFlags.Number || flags === ts.TypeFlags.NumberLiteral) {
            return 'number';
        }
        return undefined;
    }

    // true when the printed Java for this operand is statically a String: a string
    // literal, or a nested `+` this rule prints as a native concat (so every native
    // concat is anchored by a literal and Java concatenates the other side).
    javaProvableString(node): boolean {
        if (node === undefined) {
            return false;
        }
        switch (node.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return true;
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.javaProvableString(node.expression);
        case ts.SyntaxKind.BinaryExpression:
            return this.javaNativeConcat(node);
        }
        return false;
    }

    // does this `+` node print as a native concat (both sides plain string, one side a
    // provable String)? Mirrors printInlineHelperArithmetic so callers can reason about
    // the printed text of a nested concat.
    javaNativeConcat(node): boolean {
        if (node?.operatorToken?.kind !== ts.SyntaxKind.PlusToken) {
            return false;
        }
        if (this.javaScalarFamily(node.left) !== 'string' || this.javaScalarFamily(node.right) !== 'string') {
            return false;
        }
        return this.javaProvableString(node.left) || this.javaProvableString(node.right);
    }

    // the Java kind a numeric operand provably prints with: decimal integer literal ->
    // 'long', fractional literal -> 'double', a nested `+ - * /` this rule prints
    // natively -> that node's kind. Anything else (hex/binary literals, negative
    // literals printed as Helpers.opNeg, calls, identifiers) stays undefined.
    javaProvableNumericKind(node): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        if (node.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return this.javaProvableNumericKind(node.expression);
        }
        if (ts.isNumericLiteral(node)) {
            const text = node.text;
            if (/^0[xXbBoO]/.test(text)) {
                return undefined;
            }
            return /[.eE]/.test(text) ? 'double' : 'long';
        }
        if (node.kind === ts.SyntaxKind.BinaryExpression) {
            return this.javaNativeArithmeticKind(node);
        }
        return undefined;
    }

    // the kind of the native arithmetic this rule prints for `+ - * /`, or undefined when
    // the node keeps the helper. Mirrors printInlineHelperArithmetic operand-for-operand
    // so callers can reason about the printed text of a nested arithmetic operand.
    javaNativeArithmeticKind(node): string | undefined {
        const op = node?.operatorToken?.kind;
        const isPlus = op === ts.SyntaxKind.PlusToken;
        const isMinus = op === ts.SyntaxKind.MinusToken;
        const isMultiply = op === ts.SyntaxKind.AsteriskToken;
        const isDivide = op === ts.SyntaxKind.SlashToken;
        if (!isPlus && !isMinus && !isMultiply && !isDivide) {
            return undefined;
        }
        if (this.javaScalarFamily(node.left) !== 'number' || this.javaScalarFamily(node.right) !== 'number') {
            return undefined;
        }
        const leftKind = this.javaProvableNumericKind(node.left);
        const rightKind = this.javaProvableNumericKind(node.right);
        if (leftKind === undefined || leftKind !== rightKind) {
            return undefined;
        }
        if (isDivide) {
            return 'double';
        }
        if (isMultiply && leftKind === 'double') {
            return undefined;
        }
        return leftKind;
    }

    // integer literals print as Java `int`; the helpers normalize Integer to Long before
    // the arithmetic, so native integer arithmetic is emitted in long to keep the boxed
    // result identical
    javaPrintOperandAsLong(node, text) {
        if (!ts.isNumericLiteral(node) || /[.eE]/.test(node.text)) {
            return text;
        }
        return /L$/.test(text) ? text : text + 'L';
    }

    // the native form of a helper-family binary operator, or undefined to keep the helper
    printInlineHelperArithmetic(left, right, leftText, rightText, op) {
        const isPlus = op === ts.SyntaxKind.PlusToken || op === ts.SyntaxKind.PlusEqualsToken;
        const isMinus = op === ts.SyntaxKind.MinusToken || op === ts.SyntaxKind.MinusEqualsToken;
        const isMultiply = op === ts.SyntaxKind.AsteriskToken;
        const isDivide = op === ts.SyntaxKind.SlashToken;
        if (!isPlus && !isMinus && !isMultiply && !isDivide) {
            return undefined;
        }
        const leftFamily = this.javaScalarFamily(left);
        const rightFamily = this.javaScalarFamily(right);
        if (isPlus && leftFamily === 'string' && rightFamily === 'string') {
            if (!(this.javaProvableString(left) || this.javaProvableString(right))) {
                return undefined;
            }
            const concat = `(${leftText} + ${rightText})`;
            return op === ts.SyntaxKind.PlusEqualsToken ? `${leftText} = ${concat}` : concat;
        }
        // compound assignments keep the helper: the left side is a local the printer
        // declares Object, so the native operator would not compile
        if (op === ts.SyntaxKind.PlusEqualsToken || op === ts.SyntaxKind.MinusEqualsToken) {
            return undefined;
        }
        if (leftFamily !== 'number' || rightFamily !== 'number') {
            return undefined;
        }
        const leftKind = this.javaProvableNumericKind(left);
        const rightKind = this.javaProvableNumericKind(right);
        if (leftKind === undefined || leftKind !== rightKind) {
            return undefined;
        }
        if (isDivide) {
            // TS `/` is always float division and Helpers.divide never returns a long
            return `(((double) ${leftText}) / ((double) ${rightText}))`;
        }
        if (isMultiply && leftKind === 'double') {
            // Helpers.multiply re-boxes an integral double product as Long, so a native
            // double product would change the boxed kind
            return undefined;
        }
        const operator = isPlus ? '+' : (isMinus ? '-' : '*');
        return `(${this.javaPrintOperandAsLong(left, leftText)} ${operator} ${this.javaPrintOperandAsLong(right, rightText)})`;
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

    // Finds every ObjectLiteralExpression nested anywhere inside an RHS/initializer
    // expression that would produce an anonymous-inner-class capture in Java
    // (HashMap double-brace init). Stops descending at each ObjectLiteralExpression
    // because nested literals are walked recursively inside
    // getVarListFromObjectLiteralAndUpdateInPlace. Skips function/arrow bodies so
    // we don't capture literals that evaluate in a different scope.
    //
    // Unifies the previously-narrow matching in printVariableDeclarationList and
    // getBinaryExpressionPrefixes which only handled ObjectLiteralExpression or
    // CallExpression directly — missing wrappers like AwaitExpression,
    // ParenthesizedExpression, NewExpression, and ConditionalExpression.
    collectCapturingObjectLiterals(node): any[] {
        const found = [];
        const walk = (n) => {
            if (!n) return;
            if (n.kind === ts.SyntaxKind.ObjectLiteralExpression) {
                found.push(n);
                return;
            }
            if (n.kind === ts.SyntaxKind.FunctionExpression ||
                n.kind === ts.SyntaxKind.ArrowFunction ||
                n.kind === ts.SyntaxKind.MethodDeclaration ||
                n.kind === ts.SyntaxKind.FunctionDeclaration) {
                return;
            }
            ts.forEachChild(n, walk);
        };
        walk(node);
        return found;
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
                const decls = this.buildFinalVarDeclarations(objVariables, identation);
                if (decls) {
                    return decls + "\n" + this.getIden(identation);
                }
            }
        } else if (right.kind === ts.SyntaxKind.CallExpression) {
            // search arguments recursively for object literals
            // eg: a[x] = this.extend(this.extend(this.extend({'a':b}, c)))
            const objectLiterals = this.getObjectLiteralFromCallExpressionArguments(right);
            if (objectLiterals.length > 0) {
                const allVars = [];
                for (let i = 0; i < objectLiterals.length; i++) {
                    const objLiteral = objectLiterals[i];
                    const objVariables = this.getVarListFromObjectLiteralAndUpdateInPlace(objLiteral);
                    allVars.push(...objVariables);
                }
                if (allVars.length > 0) {
                    const decls = this.buildFinalVarDeclarations(allVars, identation);
                    if (decls) {
                        return decls + "\n" + this.getIden(identation);
                    }
                }
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

    private isAssignmentOperator(op: ts.SyntaxKind): boolean {
        return op === ts.SyntaxKind.EqualsToken ||
            op === ts.SyntaxKind.PlusEqualsToken ||
            op === ts.SyntaxKind.MinusEqualsToken ||
            op === ts.SyntaxKind.AsteriskEqualsToken ||
            op === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
            op === ts.SyntaxKind.SlashEqualsToken ||
            op === ts.SyntaxKind.PercentEqualsToken ||
            op === ts.SyntaxKind.LessThanLessThanEqualsToken ||
            op === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
            op === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
            op === ts.SyntaxKind.AmpersandEqualsToken ||
            op === ts.SyntaxKind.BarEqualsToken ||
            op === ts.SyntaxKind.CaretEqualsToken ||
            op === ts.SyntaxKind.BarBarEqualsToken ||
            op === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
            op === ts.SyntaxKind.QuestionQuestionEqualsToken;
    }

    private isIncDecOperator(op: ts.SyntaxKind): boolean {
        return op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken;
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
    analyzeFinalVars(fnBody: ts.Node): void {
        this.usageToFinalName = new WeakMap();
        if (!fnBody) return;

        // Symbol identity: two identifiers are the same lexical variable iff they
        // resolve to the same declaration. This differentiates e.g. `i` in two
        // sibling for-loops (separate `let i` declarations = separate symbols).
        const symbolIdOf = (n: any): string => {
            try {
                const checker = this.getChecker();
                const sym = checker?.getSymbolAtLocation?.(n);
                const decl = sym?.declarations?.[0] ?? sym?.valueDeclaration;
                if (decl) return `s:${decl.pos}:${decl.end}`;
            } catch {
                // checker may be unavailable in some contexts — fall through to name-based id
            }
            return `n:${n.escapedText}`;
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
            if (node.kind === ts.SyntaxKind.BinaryExpression) {
                if (node.left?.kind === ts.SyntaxKind.Identifier) {
                    // Mirror printCustomBinaryExpressionIfAny: any BinaryExpression
                    // with an Identifier left flags it, regardless of operator.
                    reassignedSyms.add(symbolIdOf(node.left));
                } else if (
                    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                    node.left?.kind === ts.SyntaxKind.ArrayLiteralExpression
                ) {
                    // Tuple destructuring assignment: `[a, b] = expr`. The printer's
                    // ArrayLiteralExpression branch in printCustomBinaryExpressionIfAny
                    // flags each Identifier element in ReassignedVars, so mirror it
                    // here for version-bump coverage.
                    for (const elem of node.left.elements ?? []) {
                        if (elem?.kind === ts.SyntaxKind.Identifier) {
                            reassignedSyms.add(symbolIdOf(elem));
                        }
                    }
                }
            }
            if ((node.kind === ts.SyntaxKind.PrefixUnaryExpression ||
                 node.kind === ts.SyntaxKind.PostfixUnaryExpression) &&
                this.isIncDecOperator(node.operator) &&
                node.operand?.kind === ts.SyntaxKind.Identifier) {
                reassignedSyms.add(symbolIdOf(node.operand));
            }
            // Cross-call / cross-method state leak: ReassignedVars accumulates
            // across transpile calls and earlier-printed methods in the same
            // class+method context, so a var declared `const` in this function
            // body may still be flagged from a prior context. The printer's
            // substitution path consults ReassignedVars as a fallback; if the
            // analyzer disagrees, version-bump can't apply and sibling if/else
            // branches end up with the same base name.
            if (node.kind === ts.SyntaxKind.Identifier) {
                const name = node.escapedText as string | undefined;
                if (name && name !== 'undefined' && !name.startsWith?.('null')) {
                    if (this.ReassignedVars[this.getVarKey(node)]) {
                        reassignedSyms.add(symbolIdOf(node));
                    }
                }
                return;
            }
            ts.forEachChild(node, discoverPotentialReassignments);
        };
        discoverPotentialReassignments(fnBody);

        if (reassignedSyms.size === 0) return;

        // Pass 2 — walk in source order, producing a stream of reassignment and usage
        // events keyed by symbol. Usages are identifiers that (a) sit inside an
        // object literal property initializer expression, (b) refer to a reassigned symbol.
        type Event =
            | { kind: 'reassign'; sym: string }
            | { kind: 'use'; sym: string; name: string; node: ts.Node };
        const events: Event[] = [];

        const visitExprInObjLit = (n: any) => {
            if (!n) return;
            if (n.kind === ts.SyntaxKind.Identifier) {
                const name = n.escapedText as string;
                if (name && name !== 'undefined' && !name.startsWith?.('null')) {
                    const sym = symbolIdOf(n);
                    if (reassignedSyms.has(sym)) {
                        events.push({ kind: 'use', sym, name, node: n });
                    }
                }
                return;
            }
            if (n.kind === ts.SyntaxKind.BinaryExpression) {
                visitExprInObjLit(n.left);
                visitExprInObjLit(n.right);
                return;
            }
            if (n.kind === ts.SyntaxKind.ParenthesizedExpression) {
                visitExprInObjLit(n.expression);
                return;
            }
            if (n.kind === ts.SyntaxKind.ConditionalExpression) {
                visitExprInObjLit(n.condition);
                visitExprInObjLit(n.whenTrue);
                visitExprInObjLit(n.whenFalse);
                return;
            }
            if (n.kind === ts.SyntaxKind.CallExpression) {
                n.arguments?.forEach(visitExprInObjLit);
                if (n.expression?.kind === ts.SyntaxKind.PropertyAccessExpression) {
                    visitExprInObjLit(n.expression.expression);
                }
                return;
            }
            if (n.kind === ts.SyntaxKind.PrefixUnaryExpression) {
                visitExprInObjLit(n.operand);
                return;
            }
            if (n.kind === ts.SyntaxKind.ElementAccessExpression) {
                let left = n.expression;
                while (left?.kind === ts.SyntaxKind.ElementAccessExpression) {
                    left = left.expression;
                }
                visitExprInObjLit(left);
                visitExprInObjLit(n.argumentExpression);
                return;
            }
            if (n.kind === ts.SyntaxKind.ObjectLiteralExpression) {
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
            ts.forEachChild(n, visitExprInObjLit);
        };

        const walk = (node: any) => {
            if (!node) return;

            if (node.kind === ts.SyntaxKind.BinaryExpression &&
                this.isAssignmentOperator(node.operatorToken.kind)) {
                walk(node.right);
                if (node.left?.kind === ts.SyntaxKind.Identifier) {
                    const sym = symbolIdOf(node.left);
                    if (reassignedSyms.has(sym)) {
                        events.push({ kind: 'reassign', sym });
                    }
                } else {
                    walk(node.left);
                }
                return;
            }

            if ((node.kind === ts.SyntaxKind.PrefixUnaryExpression ||
                 node.kind === ts.SyntaxKind.PostfixUnaryExpression) &&
                this.isIncDecOperator(node.operator) &&
                node.operand?.kind === ts.SyntaxKind.Identifier) {
                const sym = symbolIdOf(node.operand);
                if (reassignedSyms.has(sym)) {
                    events.push({ kind: 'reassign', sym });
                }
                return;
            }

            if (node.kind === ts.SyntaxKind.ObjectLiteralExpression) {
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
            const walkBlockAndBump = (subNode: ts.Node | undefined): Set<string> => {
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

            if (node.kind === ts.SyntaxKind.IfStatement) {
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
            if (node.kind === ts.SyntaxKind.TryStatement) {
                walkBlockAndBump(node.tryBlock);
                walkBlockAndBump(node.catchClause?.block);
                walkBlockAndBump(node.finallyBlock);
                return;
            }

            ts.forEachChild(node, walk);
        };

        walk(fnBody);

        // Post-process: compute per-symbol versions and assign final names. The
        // final name is derived from the identifier's text, not the symbol — so
        // two distinct symbols named `i` both get `finalI` (each lives in its own
        // lexical scope, so scope-stack dedup allows both to be emitted).
        const counters = new Map<string, number>();
        const perSym = new Map<string, { name: string; byVer: Map<number, ts.Node[]> }>();
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
            if (versions.length === 1) {
                for (const n of byVer.get(versions[0])!) {
                    this.usageToFinalName.set(n, baseName);
                }
            } else {
                versions.forEach((v, idx) => {
                    const finalName = idx === 0 ? baseName : `${baseName}_${idx + 1}`;
                    for (const n of byVer.get(v)!) {
                        this.usageToFinalName.set(n, finalName);
                    }
                });
            }
        }
    }

    private finalNameInAncestorScope(finalName: string): boolean {
        for (const scope of this.finalVarScopeStack) {
            if (scope.has(finalName)) return true;
        }
        return false;
    }

    buildFinalVarDeclarations(pairs: Array<{ orig: string; final: string }>, identation: number): string {
        if (pairs.length === 0) return '';
        const current = this.finalVarScopeStack.length > 0
            ? this.finalVarScopeStack[this.finalVarScopeStack.length - 1]
            : null;
        const lines: string[] = [];
        const seenHere = new Set<string>();
        for (const p of pairs) {
            if (seenHere.has(p.final)) continue;
            if (this.finalNameInAncestorScope(p.final)) continue;
            seenHere.add(p.final);
            if (current) current.add(p.final);
            const indent = lines.length === 0 ? 0 : identation;
            // The RHS must use the remapped Java name (e.g. `params` → `parameters`,
            // `internal` → `intern`) since the original TS identifier doesn't exist
            // in the generated Java code.
            lines.push(`${this.getIden(indent)}final Object ${p.final} = ${this.getOriginalVarName(p.orig)};`);
        }
        return lines.join('\n');
    }

    getObjectLiteralId(node): string {
        const start = node.getStart();
        const end = node.getEnd();
        // Qualify with the file: the offsets alone collide between two files whose
        // object literals happen to sit at the same character range.
        const fileName = node.getSourceFile?.()?.fileName ?? '';
        return `${fileName}:${start}-${end}`;
    }

    // Remember an identifier's pre-rewrite state so restoreFinalVarMutations can put
    // the shared AST back exactly as it was parsed.
    recordFinalVarMutation(node: any): void {
        this.finalVarMutations.push({
            node,
            escapedText: node.escapedText,
            ownGetFullText: Object.prototype.hasOwnProperty.call(node, 'getFullText'),
            getFullText: node.getFullText,
        });
    }

    // Undo every in-place identifier rewrite made during the current emit, newest
    // first so repeated rewrites of one node unwind to the original value.
    restoreFinalVarMutations(): void {
        for (let i = this.finalVarMutations.length - 1; i >= 0; i--) {
            const mutation = this.finalVarMutations[i];
            mutation.node.escapedText = mutation.escapedText;
            if (mutation.ownGetFullText) {
                mutation.node.getFullText = mutation.getFullText;
            } else {
                delete mutation.node.getFullText;
            }
        }
        this.finalVarMutations = [];
    }

    printNode(node, identation = 0): string {
        if (node && node.kind === ts.SyntaxKind.SourceFile) {
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

    createNewNodeForFinalVar(originalName: string): ts.Identifier {
        const newNode = ts.factory.createIdentifier(this.getFinalVarName(originalName));
        newNode.getFullText = () => this.getFinalVarName(originalName);
        return newNode;
    }

    getVarListFromObjectLiteralAndUpdateInPlace(node): Array<{ orig: string; final: string }> {
        // in java if we use an anonymous object literal put, we can't refer non final variables
        // so here we collect them and then we add the wrapper final variables, eg: finalX = X;
        // and we update the node in place to use finalX instead of X.
        // The final name comes from analyzeFinalVars (pre-walk), which assigns
        // version-aware names so reassignment-between-usages produces distinct finals.
        let res: Array<{ orig: string; final: string }> = [];

        const nodeId = this.getObjectLiteralId(node);

        if (nodeId in this.varListFromObjectLiterals) {
            return this.varListFromObjectLiterals[nodeId];
        }

        const finalNameFor = (n: any, origName: string): string => {
            return this.usageToFinalName.get(n) ?? this.getFinalVarName(origName);
        };

        // Walks any expression, rewriting reassigned-var Identifiers to their
        // finalXxx names in place. We rely on ts.forEachChild for traversal so
        // every node kind (PrefixUnary, PostfixUnary, ElementAccess,
        // PropertyAccess, BinaryExpression, ConditionalExpression, CallExpression,
        // ParenthesizedExpression, etc.) is covered uniformly. ObjectLiteral is
        // delegated back to the parent function so per-objectLiteral nodeId
        // dedup applies to nested literals too.
        const traverseAndReplace = (n) => {
            if (!n) return;
            if (n.kind === ts.SyntaxKind.Identifier) {
                const name = n.escapedText as string | undefined;
                if (name && name !== 'undefined' && !name.startsWith('null')) {
                    // Prefer analyzeFinalVars' pre-walk result (usageToFinalName):
                    // it knows about reassignments anywhere in the function body,
                    // including ones that happen AFTER this object literal in
                    // source order. ReassignedVars is populated as BinaryExpressions
                    // are printed, so for a forward reference it is still false at
                    // this point and would miss the shadow.
                    const isReassignedAhead = this.usageToFinalName.has(n);
                    if (isReassignedAhead || this.ReassignedVars[this.getVarKey(n)]) {
                        const finalName = finalNameFor(n, name);
                        res.push({ orig: name, final: finalName });
                        this.recordFinalVarMutation(n);
                        n.escapedText = finalName;
                        // Some downstream print paths read from getFullText (which
                        // reflects the source text, not escapedText) — shim it so
                        // they see the rewritten name.
                        (n as any).getFullText = () => finalName;
                    }
                }
                return;
            }
            if (n.kind === ts.SyntaxKind.ObjectLiteralExpression) {
                const innerVars = this.getVarListFromObjectLiteralAndUpdateInPlace(n);
                res = res.concat(innerVars);
                return;
            }
            ts.forEachChild(n, traverseAndReplace);
        };

        node.properties.forEach( (prop) => {
            if (!prop.initializer) return;
            traverseAndReplace(prop.initializer);
        });

        // dedup on (orig|final) pair
        const seen = new Set<string>();
        const dedup: Array<{ orig: string; final: string }> = [];
        for (const p of res) {
            const key = `${p.orig}|${p.final}`;
            if (seen.has(key)) continue;
            seen.add(key);
            dedup.push(p);
        }
        this.varListFromObjectLiterals[nodeId] = dedup;
        return dedup;
    }

    printVariableDeclarationList(node, identation) {
        const declaration = node.declarations[0];

        let finalVars = '';
        if (declaration.initializer) {
            // Walk the whole initializer tree — handles AwaitExpression,
            // ParenthesizedExpression, NewExpression, ConditionalExpression,
            // nested CallExpressions, etc. uniformly.
            const objLiterals = this.collectCapturingObjectLiterals(declaration.initializer);
            let varObj = [];
            for (const lit of objLiterals) {
                const vars = this.getVarListFromObjectLiteralAndUpdateInPlace(lit);
                varObj = varObj.concat(vars);
            }
            if (varObj.length > 0) {
                finalVars = this.buildFinalVarDeclarations(varObj, identation);
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
            const type = (this.getChecker() as TypeChecker).getTypeAtLocation(
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
            this.getChecker().getTypeAtLocation(node?.parent)?.flags ===
            ts.TypeFlags.Number
        ) {
            return this.UNDEFINED_TOKEN;
        }

        return undefined;
    }

    // Unpacks one optional parameter. Native array access replaces Helpers.getArg
    // when the initializer is a pure literal; the null check keeps the helper's
    // contract that a null varargs array reads like an empty one.
    printOptionalArgInit(paramName, index, initializer) {
        const defaultValue = this.printNode(initializer, 0);
        if (!this.isPureInitializer(initializer)) {
            return `Object ${paramName} = Helpers.getArg(optionalArgs, ${index}, ${defaultValue});`;
        }
        return `Object ${paramName} = optionalArgs != null && optionalArgs.length > ${index} ? optionalArgs[${index}] : ${defaultValue};`;
    }

    // Pure = evaluating the initializer has no effect and cannot throw, so
    // skipping it when the argument was supplied cannot change behavior.
    isPureInitializer(node) {
        switch (node?.kind) {
        case ts.SyntaxKind.NullKeyword:
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        case ts.SyntaxKind.NumericLiteral:
            return true;
        case ts.SyntaxKind.Identifier:
            // `= undefined` prints as null; any other name could be a call result
            return node.escapedText === 'undefined';
        case ts.SyntaxKind.ArrayLiteralExpression:
            return node.elements.every((element) => this.isPureInitializer(element));
        case ts.SyntaxKind.ObjectLiteralExpression:
            return node.properties.every((property) => ts.isPropertyAssignment(property) && this.isPureInitializer(property.initializer));
        case ts.SyntaxKind.ParenthesizedExpression:
        case ts.SyntaxKind.AsExpression:
        case ts.SyntaxKind.TypeAssertionExpression:
        case ts.SyntaxKind.NonNullExpression:
            return this.isPureInitializer(node.expression);
        default:
            return false;
        }
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
        const initParams = [];
        const processedParts = [];
        try {
            for (let i = 0; i < bodyStatements.length; i++) {
                processedParts.push(this.printNode(bodyStatements[i], identation + 1));
            }
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

        if (isAsync) {
            const finalWrapperVars = this.printFinalOutsideMethodVariableWrappersIfAny(node, identation) + "\n";
            const insideWrappers = this.printInsideMethodVariableWrappersIfAny(node, identation + 1) + "\n";
            const body = (firstStatement + remainingString).split("\n").map(line => this.getIden(identation) + line).join("\n");
            // Check if last statement is a return — if not, add return null for supplyAsync lambda
            const lastStatement = bodyStatements.length > 1 ? bodyStatements[bodyStatements.length - 1] : (bodyStatements.length > 0 ? bodyStatements[0] : undefined);
            const lastStmtIsReturn = lastStatement && (ts.isReturnStatement(lastStatement) || this.allBranchesTerminate(lastStatement));
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

    printBlock(node, identation, chainBlock = false) {
        // Track per-block scope for final var dedup: same final name must not be
        // declared twice in a single block (Java would error), but may shadow
        // across nested blocks. We push an empty scope on entry and pop on exit.
        const managed = this.finalVarScopeStack.length > 0;
        if (managed) this.finalVarScopeStack.push(new Set<string>());
        try {
            return super.printBlock(node, identation, chainBlock);
        } finally {
            if (managed) this.finalVarScopeStack.pop();
        }
    }

    printInstanceOfExpression(node, identation) {
        // const left = node.left.escapedText;
        const right = node.right.escapedText;
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
                const { localName, sigName } = this.getAsyncParamWrapperNames(paramName);
                // Replace the printed Java name (post keyword-remap) with sigName so
                // the original name is freed for the lambda body to bind.
                printedParam = printedParam.replace(localName, sigName);
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
                        const { sigName, snapName } = this.getAsyncParamWrapperNames(paramName);
                        finalVarWrappers.push(this.getIden(identation + 1) + `final Object ${snapName} = ${sigName};`);
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
                        const { localName, snapName } = this.getAsyncParamWrapperNames(paramName);
                        finalVarWrappers.push(this.getIden(identation + 1) + `Object ${localName} = ${snapName};`);
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

        // quick fix
        if (returnType === 'java.util.concurrent.CompletableFuture') {
            returnType = 'java.util.concurrent.CompletableFuture<Object>';
        }

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

    // Route through Helpers so consumers control semantics (thread-safety,
    // null-handling, type coercion) in one place — same pattern as
    // Helpers.add / Helpers.isEqual / Helpers.GetValue / Helpers.json. The
    // previous inline emits (`x instanceof java.util.List`, `((Map)x).keySet()`)
    // forced any downstream that needed different semantics (e.g. synchronized
    // map access in concurrent code) to post-process the generated Java with
    // regex — which only catches the bare-identifier argument shape and misses
    // property-access (`this.x`) and element-access (`obj[k]`) arguments.
    printArrayIsArrayCall(_node, _identation, parsedArg = undefined) {
        return `Helpers.isArray(${parsedArg})`;
    }

    printObjectKeysCall(_node, _identation, parsedArg = undefined) {
        return `Helpers.objectKeys(${parsedArg})`;
    }

    printObjectValuesCall(_node, _identation, parsedArg = undefined) {
        return `Helpers.objectValues(${parsedArg})`;
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
        // return `new java.util.ArrayList<Object>(java.util.Arrays.asList(((String)${name}).split((String)${parsedArg})))`;
        return `Helpers.split(${name}, ${parsedArg})`;
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

    printSliceCall(_node, _identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        if (parsedArg2 === undefined) {
            parsedArg2 = "null";
        }
        return `Helpers.slice(${name}, ${parsedArg}, ${parsedArg2})`;
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
        return `Helpers.replaceAll((String)${name}, (String)${parsedArg}, (String)${parsedArg2})`;
    }

    // Printed form of a non-empty string-literal argument with no escapes, or undefined when the
    // argument is not a literal, prints with an escape sequence, or is the empty pattern.
    stringLiteralArgument(argument) {
        if (argument === undefined || !ts.isStringLiteral(argument)) {
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
        if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
            return this.sideEffectFreeReceiver(expression.expression);
        }
        if (ts.isIdentifier(expression) || expression.kind === ts.SyntaxKind.ThisKeyword) {
            return true;
        }
        if (ts.isPropertyAccessExpression(expression)) {
            return this.sideEffectFreeReceiver(expression.expression);
        }
        return false;
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
        const type = (this.getChecker() as TypeChecker).getTypeAtLocation(node.expression);
        this.warnIfAnyType(node, (type as any).flags, leftSide, "length");
        return this.printJavaLength(node.expression, leftSide);
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

    javaBooleanCondition(node) {
        if (node.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return this.javaBooleanCondition(node.expression);
        }
        if (node.kind === ts.SyntaxKind.PrefixUnaryExpression) {
            return node.operator === ts.SyntaxKind.ExclamationToken && this.javaBooleanCondition(node.operand);
        }
        if (node.kind !== ts.SyntaxKind.BinaryExpression) {
            return false;
        }
        return this.javaBooleanOperators.includes(node.operatorToken.kind);
    }

    // `Precise.<relational>(a, b)` where the callee resolves to a static of the base `Precise`
    // class: the hand-written Precise.java declares those statics `public static boolean`, so the
    // printed call is a Java primitive boolean; the printed receiver name alone is no proof (a
    // shadowing local or another class prints the same text), so the resolution is checked too
    javaPreciseBooleanCall(node) {
        if (node.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return this.javaPreciseBooleanCall(node.expression);
        }
        // `!<relational call>` is a boolean too (the negation of a proven boolean)
        if (node.kind === ts.SyntaxKind.PrefixUnaryExpression) {
            return node.operator === ts.SyntaxKind.ExclamationToken && this.javaPreciseBooleanCall(node.operand);
        }
        if (node.kind !== ts.SyntaxKind.CallExpression
            || node.expression.kind !== ts.SyntaxKind.PropertyAccessExpression
            || node.expression.expression.kind !== ts.SyntaxKind.Identifier
            || node.expression.expression.escapedText !== 'Precise'
            || !JAVA_PRECISE_BOOLEAN_STATICS.has(node.expression.name.escapedText)) {
            return false;
        }
        const declaration: any = this.getChecker().getResolvedSignature(node)?.declaration;
        if (declaration === undefined
            || declaration.kind !== ts.SyntaxKind.MethodDeclaration
            || declaration.parent?.kind !== ts.SyntaxKind.ClassDeclaration
            || declaration.parent.name?.escapedText !== 'Precise'
            || !declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword)) {
            return false;
        }
        // the relational statics answer a plain boolean (never null), which is what
        // Helpers.isTrue(Boolean) returns unchanged; a union (boolean | undefined) keeps the helper
        return (this.getChecker().getTypeAtLocation(node).flags & ts.TypeFlags.Boolean) !== 0;
    }

    // the checker's view of the value a condition holds: BooleanLike is the plain `boolean`
    // (`boolean` itself carries the Boolean bit; the `boolean | undefined` of an accessor with
    // a default is a union of BooleanLiteral + Undefined and does not), while a union whose
    // every member is boolean/nullish is the nullable box
    javaBooleanValueKind(node): 'boolean' | 'nullableBoolean' | undefined {
        const type = this.getChecker().getTypeAtLocation(node);
        const flags = type?.flags ?? 0;
        if (flags & ts.TypeFlags.BooleanLike) {
            return 'boolean';
        }
        if ((flags & ts.TypeFlags.Union) === 0) {
            return undefined;
        }
        const members = (type as any).types ?? [];
        const booleanishMembers = ts.TypeFlags.BooleanLike | ts.TypeFlags.Null
            | ts.TypeFlags.Undefined | ts.TypeFlags.Void;
        const allBooleanish = members.length > 0
            && members.every((member) => (((member as any).flags ?? 0) & booleanishMembers) !== 0);
        return allBooleanish ? 'nullableBoolean' : undefined;
    }

    // mirrors printWrappedUnknownThisProperty: a `this.<name>(...)` call the checker cannot
    // resolve prints `Helpers.callDynamically(this, "<name>", ...)`, whose Java return is Object
    javaCalleeResolves(node): boolean {
        let signature;
        try {
            signature = this.getChecker().getResolvedSignature(node);
        } catch (e) {
            return false;
        }
        return signature?.declaration !== undefined;
    }

    // the boolean the printed Java of a `this.<name>(...)` call already carries, from the
    // hand-written base declarations in JAVA_THIS_BOOLEAN_METHODS / the box proof in
    // JAVA_THIS_BOOLEAN_BOX_METHODS. undefined: not a direct boolean call, keep the wrapper.
    javaCallBooleanKind(node): 'boolean' | 'nullableBoolean' | undefined {
        if (node?.kind !== ts.SyntaxKind.CallExpression) {
            return undefined;
        }
        const callee = node.expression;
        if (callee?.kind !== ts.SyntaxKind.PropertyAccessExpression
            || callee.expression?.kind !== ts.SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const kind = this.javaBooleanValueKind(node);
        if (kind === undefined || !this.javaCalleeResolves(node)) {
            return undefined;
        }
        const name = callee.name?.escapedText as string;
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
            || defaultArgument.kind === ts.SyntaxKind.NullKeyword
            || (defaultArgument.kind === ts.SyntaxKind.Identifier && defaultArgument.escapedText === 'undefined');
        const defaultIsBoolean = defaultIsNullish
            || defaultArgument?.kind === ts.SyntaxKind.TrueKeyword
            || defaultArgument?.kind === ts.SyntaxKind.FalseKeyword;
        return defaultIsBoolean ? 'nullableBoolean' : undefined;
    }

    // the printer already emits these conditions as Java `boolean` (the comparison helpers,
    // `in`/`instanceof` and the logical operators all return/print primitive boolean), so
    // Helpers.isTrue would only re-test a value the checker proves is boolean
    javaConditionPrintsBoolean(node) {
        if (this.javaBooleanCondition(node)) {
            // TS models `boolean` as the true|false union: the Boolean bit is set on plain
            // boolean and cleared on `boolean | undefined`-style unions, which keep the helper
            return (this.getChecker().getTypeAtLocation(node).flags & ts.TypeFlags.Boolean) !== 0;
        }
        return this.javaPreciseBooleanCall(node);
    }

    // the checker proves this expression's TypeScript type is exactly `boolean` (or a boolean
    // literal type): no `any`, no `undefined`/`null` union, no nullable alias
    javaBooleanBoxType(type: any): boolean {
        if (type === undefined) {
            return false;
        }
        if (type.aliasSymbol !== undefined) {
            return false;
        }
        const flags = type.flags ?? 0;
        if ((flags & JAVA_BOOLEAN_EXCLUDED_TYPE_FLAGS) !== 0) {
            return false;
        }
        return (flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) !== 0;
    }

    javaTypeOfNode(node): any {
        try {
            return this.getChecker().getTypeAtLocation(node);
        } catch (e) {
            return undefined;
        }
    }

    // the DECLARED type of a declaration, not the narrowed type at a use site: TypeScript
    // narrows a `const ok: boolean = true` to the literal `true` and can even reach `never`
    // after a guarding `if (ok) return;`, which says nothing about the box the local holds
    javaTypeOfDeclaration(decl): any {
        if (decl === undefined) {
            return undefined;
        }
        try {
            return this.getChecker().getTypeAtLocation(decl);
        } catch (e) {
            return undefined;
        }
    }

    // the printed Java of this expression is a primitive `boolean` (or a Boolean box): boolean
    // literals, `!`, the logical / comparison / `in` operators, `Array.isArray(x)` (printed
    // Helpers.isArray, declared `public static boolean`) and the hand-written `public boolean`
    // base methods. `seen` breaks the identifier cycle of `a = b; b = a;` style writes.
    javaPrintsBooleanValue(node, seen: Set<any>): boolean {
        if (node === undefined) {
            return false;
        }
        switch (node.kind) {
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
            return true;
        case ts.SyntaxKind.ParenthesizedExpression:
        case ts.SyntaxKind.AsExpression:
        case ts.SyntaxKind.NonNullExpression:
            return this.javaPrintsBooleanValue(node.expression, seen);
        case ts.SyntaxKind.PrefixUnaryExpression:
            return node.operator === ts.SyntaxKind.ExclamationToken && this.javaPrintsBooleanValue(node.operand, seen);
        case ts.SyntaxKind.BinaryExpression:
            // the comparison and logical operators all print a Java primitive boolean (the
            // helpers they lower to are declared `public static boolean`), whatever the operands
            return JAVA_BOOLEAN_OPERATOR_KINDS.has(node.operatorToken.kind);
        case ts.SyntaxKind.CallExpression:
            return this.javaPrintsBooleanCall(node);
        case ts.SyntaxKind.PropertyAccessExpression:
            return this.javaBooleanBaseField(node) !== undefined;
        case ts.SyntaxKind.Identifier:
            return this.javaBooleanBoxIdentifier(node, seen) !== undefined;
        }
        return false;
    }

    // `Array.isArray(x)` prints `Helpers.isArray(x)` (`public static boolean`) and the
    // hand-written `public boolean` base methods print a primitive boolean. Everything else -
    // including the generated boolean-returning methods, which print `public Object` - keeps the
    // wrapper, because its box is not proven boolean here.
    javaPrintsBooleanCall(node): boolean {
        const callee = node.expression;
        if (this.isArrayIsArrayCall(node)) {
            return true;
        }
        if (!ts.isPropertyAccessExpression(callee) || callee.expression.kind !== ts.SyntaxKind.ThisKeyword) {
            return false;
        }
        return JAVA_BOOLEAN_BASE_CALLS.has(String(callee.name.escapedText));
    }

    isArrayIsArrayCall(node): boolean {
        if (node === undefined || node.kind !== ts.SyntaxKind.CallExpression) {
            return false;
        }
        const callee: any = node.expression;
        return ts.isPropertyAccessExpression(callee)
            && String(callee.name.escapedText) === 'isArray'
            && callee.expression.kind === ts.SyntaxKind.Identifier
            && String((callee.expression as any).escapedText) === 'Array'
            && (node.arguments?.length ?? 0) === 1;
    }

    // `this.<name>` read of a hand-written base field declared `boolean`, or undefined. The
    // TsChecker guard keeps a field the hand-written base declares Object (or String) out.
    javaBooleanBaseField(node): string | undefined {
        if (!ts.isPropertyAccessExpression(node) || node.expression.kind !== ts.SyntaxKind.ThisKeyword) {
            return undefined;
        }
        const printed = this.printNode(node, 0);
        if (!JAVA_BOOLEAN_BASE_FIELDS.has(printed)) {
            return undefined;
        }
        let declaration;
        try {
            declaration = this.getChecker().getSymbolAtLocation(node.name)?.valueDeclaration;
        } catch (e) {
            declaration = undefined;
        }
        const type = this.javaTypeOfDeclaration(declaration) ?? this.javaTypeOfNode(node);
        return this.javaBooleanBoxType(type) ? printed : undefined;
    }

    // the Java name of an identifier that provably holds a Boolean box or null, so that
    // `Helpers.isTrue(x)` IS `Boolean.TRUE.equals(x)`, or undefined to keep the wrapper.
    // The proof is the TypeScript type (`boolean`, never `any`/`undefined`-able) plus the
    // D2 write scan: every write of the identifier in the enclosing function must print a Java
    // boolean value, so no path can leave a Long/Integer/Double/String box in it.
    javaBooleanBoxIdentifier(node, seen: Set<any>): string | undefined {
        if (node?.kind !== ts.SyntaxKind.Identifier || seen.has(node)) {
            return undefined;
        }
        let symbol;
        try {
            symbol = this.getChecker().getSymbolAtLocation(node);
        } catch (e) {
            return undefined;
        }
        const decl = symbol?.valueDeclaration;
        if (decl === undefined) {
            return undefined;
        }
        // only a local with its own initializer: a parameter (and the `optionalArgs[n]` prologue
        // the printer prints for an optional one) is an `Object` box its CALLERS fill, so the box
        // is not proven boolean here; a binding element (`for (const b of ...)`, destructuring) is
        // fed by the container instead of a typed value
        if (decl.kind !== ts.SyntaxKind.VariableDeclaration) {
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
        let fn = decl.parent;
        while (fn !== undefined && !ts.isFunctionLike(fn)) {
            fn = fn.parent;
        }
        if (fn === undefined) {
            return false;
        }
        if (decl.initializer !== undefined && !this.javaPrintsBooleanValue(decl.initializer, next)) {
            return false;
        }
        let ok = true;
        const scan = (current: ts.Node) => {
            if (!ok) {
                return;
            }
            if ((ts.isForOfStatement(current) || ts.isForInStatement(current))
                && ts.isIdentifier(current.initializer)) {
                // `for (x of list)` re-fills the box from the container
                let loop;
                try {
                    loop = this.getChecker().getSymbolAtLocation(current.initializer);
                } catch (e) {
                    loop = undefined;
                }
                if (loop === symbol) {
                    ok = false;
                    return;
                }
            }
            if (ts.isBinaryExpression(current)
                && JAVA_ASSIGNMENT_OPERATOR_KINDS.has(current.operatorToken.kind)
                && ts.isIdentifier(current.left)) {
                let left;
                try {
                    left = this.getChecker().getSymbolAtLocation(current.left);
                } catch (e) {
                    left = undefined;
                }
                if (left === symbol && !this.javaPrintsBooleanValue(current.right, next)) {
                    ok = false;
                    return;
                }
            }
            ts.forEachChild(current, scan);
        };
        scan(fn);
        return ok;
    }

    // the native Java a falsy wrapper around this condition prints, or undefined to keep
    // `Helpers.isTrue(...)`: a read of a hand-written boolean field prints bare;
    // `Array.isArray(x)` prints `Helpers.isArray(x)`, whose result is exactly
    // `x instanceof java.util.List` (null -> false exactly like the helper); an identifier
    // holding a proven Boolean box prints `Boolean.TRUE.equals(x)`
    javaBooleanWrapperFreeCondition(node): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        if (node.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return this.javaBooleanWrapperFreeCondition(node.expression);
        }
        if (this.isArrayIsArrayCall(node)) {
            return `(${this.printNode(node.arguments[0], 0)} instanceof java.util.List)`;
        }
        const field = this.javaBooleanBaseField(node);
        if (field !== undefined) {
            return field;
        }
        const identifier = this.javaBooleanBoxIdentifier(node, new Set());
        if (identifier !== undefined) {
            return `Boolean.TRUE.equals(${identifier})`;
        }
        return undefined;
    }

    printCondition(node, identation) {
        if (this.javaConditionPrintsBoolean(node)) {
            return this.getIden(identation) + this.printNode(node, 0);
        }
        const wrapperFree = this.javaBooleanWrapperFreeCondition(node);
        if (wrapperFree !== undefined) {
            return this.getIden(identation) + wrapperFree;
        }
        const callKind = this.javaCallBooleanKind(node);
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
        return `((java.util.Map<String,Object>)${object}).remove((String)${key})`;
    }

    printThrowStatement(node, identation) {
        if (node.expression.kind === ts.SyntaxKind.Identifier) {
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
        if (node.expression.kind === ts.SyntaxKind.NewExpression) {
            const expression = node.expression;
            const argumentsExp = expression?.arguments ?? [];
            const parsedArg = argumentsExp.map((n) => this.printNode(n, 0)).join(",") ?? "";
            const newExpression = this.printNode(expression.expression, 0);
            if (expression.expression.kind === ts.SyntaxKind.Identifier) {
                const id = expression.expression;
                // java.lang.Error is a sibling of Exception under Throwable, so
                // `catch (Exception e)` won't catch it. Map JS/TS `Error` to
                // RuntimeException so standard catch blocks work.
                const exceptionName = id.escapedText === "Error" ? "RuntimeException" : id.escapedText;
                const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
                if (symbol) {
                    const declarations =
                        this.getChecker().getDeclaredTypeOfSymbol(symbol).symbol?.declarations ?? [];
                    const isClassDeclaration = declarations.find(
                        (l) =>
                            l.kind === ts.SyntaxKind.InterfaceDeclaration ||
                            l.kind === ts.SyntaxKind.ClassDeclaration
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

    printModifiers(node) {
        let modifiers = node.modifiers;
        if (modifiers === undefined) {
            return "";
        }
        modifiers = modifiers.filter(mod => this.FuncModifiers[mod.kind]);
        modifiers = modifiers.filter(mod => mod.kind !== ts.SyntaxKind.AsyncKeyword);
        const res = modifiers.map(modifier => this.FuncModifiers[modifier.kind]).join(" ");

        return res;
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
        // Use collectCapturingObjectLiterals to walk through every wrapper
        // (AwaitExpression, ParenthesizedExpression, CallExpression args, ArrayLiteral
        // elements, ConditionalExpression branches, NewExpression args, etc.) and
        // pick up every HashMap literal whose anonymous-inner-class body would
        // need effectively-final captures. The previous narrow switch missed
        // `return await this.watch(..., { literal capturing reassigned var }, ...)`
        // entirely — the literal ended up referencing the raw (reassigned)
        // identifier with no snapshot, which javac rejects.
        const allVarNames = [];
        if (exp) {
            const objLiterals = this.collectCapturingObjectLiterals(exp);
            for (const objLiteral of objLiterals) {
                const varsList = this.getVarListFromObjectLiteralAndUpdateInPlace(objLiteral);
                allVarNames.push(...varsList);
            }
        }
        let finalVars = allVarNames.length > 0 ? this.buildFinalVarDeclarations(allVarNames, identation) : '';
        let rightPart = exp ? (' ' + this.printNode(exp, identation)) : '';
        rightPart = rightPart.trim();
        if (!rightPart) {
            // bare return; — check if inside async method (supplyAsync lambda needs return null)
            let parent = node.parent;
            while (parent) {
                if (ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isArrowFunction(parent)) {
                    if (this.isAsyncFunction(parent)) {
                        rightPart = 'null';
                    }
                    break;
                }
                parent = parent.parent;
            }
        }
        rightPart = rightPart ? ' ' + rightPart + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
        finalVars = finalVars.length > 0 ?  this.getIden(identation) + finalVars + "\n" : finalVars;
        return leadingComment + finalVars + this.getIden(identation) + this.RETURN_TOKEN + rightPart + trailingComment;
    }

    private allBranchesTerminate(node: ts.Node): boolean {
        if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) {
            return true;
        }
        if (ts.isBlock(node)) {
            const stmts = node.statements;
            return stmts.length > 0 && this.allBranchesTerminate(stmts[stmts.length - 1]);
        }
        if (ts.isIfStatement(node)) {
            if (!node.elseStatement) {
                return false; // no else: not all paths covered
            }
            return this.allBranchesTerminate(node.thenStatement) && this.allBranchesTerminate(node.elseStatement);
        }
        return false;
    }
}
