import { BaseTranspiler } from "./baseTranspiler.js";
import ts, { TypeChecker } from 'typescript';

const parserConfig = {
    'ELSEIF_TOKEN': 'else if',
    'OBJECT_OPENING': 'new Dictionary<string, object>() {',
    'ARRAY_OPENING_TOKEN': 'new List<object>() {',
    'ARRAY_CLOSING_TOKEN': '}',
    'PROPERTY_ASSIGNMENT_TOKEN': ',',
    'VAR_TOKEN': 'object', // object
    'METHOD_TOKEN': '',
    'PROPERTY_ASSIGNMENT_OPEN': '{',
    'PROPERTY_ASSIGNMENT_CLOSE': '}',
    'SUPER_TOKEN': 'base',
    'SUPER_CALL_TOKEN': 'base',
    'FALSY_WRAPPER_OPEN': 'isTrue(',
    'FALSY_WRAPPER_CLOSE': ')',
    'COMPARISON_WRAPPER_OPEN' : "isEqual(",
    'COMPARISON_WRAPPER_CLOSE' : ")",
    'UKNOWN_PROP_WRAPPER_OPEN': 'this.call(',
    'UNKOWN_PROP_WRAPPER_CLOSE': ')',
    'UKNOWN_PROP_ASYNC_WRAPPER_OPEN': 'this.callAsync(',
    'UNKOWN_PROP_ASYNC_WRAPPER_CLOSE': ')',
    'DYNAMIC_CALL_OPEN': 'callDynamically(',
    'EQUALS_EQUALS_WRAPPER_OPEN': 'isEqual(',
    'EQUALS_EQUALS_WRAPPER_CLOSE': ')',
    'DIFFERENT_WRAPPER_OPEN': '!isEqual(',
    'DIFFERENT_WRAPPER_CLOSE': ')',
    'GREATER_THAN_WRAPPER_OPEN': 'isGreaterThan(',
    'GREATER_THAN_WRAPPER_CLOSE': ')',
    'GREATER_THAN_EQUALS_WRAPPER_OPEN': 'isGreaterThanOrEqual(',
    'GREATER_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'LESS_THAN_WRAPPER_OPEN': 'isLessThan(',
    'LESS_THAN_WRAPPER_CLOSE': ')',
    'LESS_THAN_EQUALS_WRAPPER_OPEN': 'isLessThanOrEqual(',
    'LESS_THAN_EQUALS_WRAPPER_CLOSE': ')',
    'PLUS_WRAPPER_OPEN':'add(',
    'PLUS_WRAPPER_CLOSE':')',
    'MINUS_WRAPPER_OPEN':'subtract(',
    'MINUS_WRAPPER_CLOSE':')',
    'ARRAY_LENGTH_WRAPPER_OPEN': 'getArrayLength(',
    'ARRAY_LENGTH_WRAPPER_CLOSE': ')',
    'DIVIDE_WRAPPER_OPEN': 'divide(',
    'DIVIDE_WRAPPER_CLOSE': ')',
    'MULTIPLY_WRAPPER_OPEN': 'multiply(',
    'MULTIPLY_WRAPPER_CLOSE': ')',
    'INDEXOF_WRAPPER_OPEN': 'getIndexOf(',
    'INDEXOF_WRAPPER_CLOSE': ')',
    'MOD_WRAPPER_OPEN': 'mod(',
    'MOD_WRAPPER_CLOSE': ')',
    'FUNCTION_TOKEN': '',
    'INFER_VAR_TYPE': false,
    'INFER_ARG_TYPE': false,
};

// C# static type of the value each printed helper returns. A local initialised by
// one of these already holds that concrete type inside its `object` box, so naming
// the type at the declaration site keeps the very same runtime value and only
// refines what the C# compiler knows about it.

// instance-style calls the printer rewrites unconditionally by method name
// (`x.toUpperCase()` always prints `((string)x).ToUpper()`, whatever `x` is)
const CSHARP_METHOD_RETURN_TYPES: { [name: string]: string } = {
    'toUpperCase': 'string',
    'toLowerCase': 'string',
    'toString': 'string',
    'trim': 'string',
    'join': 'string',
    'replace': 'string',
    'replaceAll': 'string',
    'split': 'List<object>',
    'startsWith': 'bool',
    'endsWith': 'bool',
    'indexOf': 'int',
    'search': 'int',
};

// `Object.keys(x)`, `Math.floor(x)`, ... — matched on the full callee text
const CSHARP_STATIC_RETURN_TYPES: { [name: string]: string } = {
    'Object.keys': 'List<object>',
    'Object.values': 'List<object>',
    'Object.entries': 'List<object>',
    'JSON.stringify': 'string',
    'Math.floor': 'double',
    'Math.ceil': 'double',
    'Math.round': 'double',
    'Array.isArray': 'bool',
    'Number.isInteger': 'bool',
};

// base-class helpers whose C# signature is already concrete
const CSHARP_THIS_RETURN_TYPES: { [name: string]: string } = {
    'extend': 'Dictionary<string, object>',
    'deepExtend': 'Dictionary<string, object>',
    'indexBy': 'Dictionary<string, object>',
    'groupBy': 'Dictionary<string, object>',
    'milliseconds': 'Int64',
    'seconds': 'Int64',
    'microseconds': 'Int64',
    'uuid': 'string',
    'hmac': 'string',
    'capitalize': 'string',
    'ymdhms': 'string',
    'yyyymmdd': 'string',
    'json': 'string',
    'inArray': 'bool',
    'valueIsDefined': 'bool',
    // the safe* accessor family: cs/ccxt/base already declares these with a concrete
    // return type (`string? safeString(...)`, `Int64? safeInteger(...)`, `bool? safeBool(...)`,
    // `IDictionary<string, object> safeDict(...)`, `List<object> safeList(...)`, ...), so a
    // local initialised by one of them already holds that type inside its `object` box
    'safeString': 'string?',
    'safeString2': 'string?',
    'safeStringN': 'string?',
    'safeStringLower': 'string?',
    'safeStringLower2': 'string?',
    'safeStringLowerN': 'string?',
    'safeStringUpper': 'string?',
    'safeStringUpper2': 'string?',
    'safeStringUpperN': 'string?',
    'safeCurrencyCode': 'string?',
    'safeInteger': 'Int64?',
    'safeInteger2': 'Int64?',
    'safeIntegerN': 'Int64?',
    'safeIntegerProduct': 'Int64?',
    'safeFloat': 'double?',
    'safeFloat2': 'double?',
    'safeFloatN': 'double?',
    'safeNumberN': 'double?',
    'safeBool': 'bool?',
    'safeBool2': 'bool?',
    'safeBoolN': 'bool?',
    'safeDict': 'IDictionary<string, object>',
    'safeDict2': 'IDictionary<string, object>',
    'safeDictN': 'IDictionary<string, object>',
    'safeList': 'List<object>',
    'safeList2': 'List<object>',
    'safeListN': 'List<object>',
};

// helpers whose C# signature is `object` (safeValue, getValue, parseInt, add,
// slice, safeTimestamp, ...) are deliberately absent above: their box holds a value the printer
// cannot name, so those locals stay `object`.

// the safe* accessor names of the table above: a local initialised by one of them gets the
// extra sink guards of csharpLocalIsSafeToType (list-only methods, hard `(string)` casts,
// the `+` LEFT operand overload rebinding)
const CSHARP_SAFE_ACCESSOR_NAMES = [
    'safeString', 'safeString2', 'safeStringN',
    'safeStringLower', 'safeStringLower2', 'safeStringLowerN',
    'safeStringUpper', 'safeStringUpper2', 'safeStringUpperN',
    'safeCurrencyCode',
    'safeInteger', 'safeInteger2', 'safeIntegerN', 'safeIntegerProduct',
    'safeFloat', 'safeFloat2', 'safeFloatN', 'safeNumberN',
    'safeBool', 'safeBool2', 'safeBoolN',
    'safeDict', 'safeDict2', 'safeDictN',
    'safeList', 'safeList2', 'safeListN',
];

// a transpiled parameter or local can literally be named `bool`, which would turn
// `bool x = ...` into a reference to that value instead of the type. `string` and
// `object` are already renamed by ReservedKeywordsReplacements.
const CSHARP_TYPE_NAMES = [ 'string', 'bool', 'int', 'long', 'Int64', 'double', 'object', 'List', 'IList', 'Dictionary', 'IDictionary', 'var' ];

// joins a receiver's printed text with a literal key in the `key in recv` guard index
const GUARD_KEY_SEPARATOR = "\u0000";

// C# kinds a comparison can be printed natively on: the runtime isLessThan family compares two
// boxes of one kind with the conversions the C# operator applies too. `double` keeps only
// `>`/`>=` — the helper reads a NaN operand as "less than", a native comparison is false.
const CSHARP_NUMERIC_KINDS = [ 'int', 'Int64', 'double' ];

const CSHARP_NATIVE_COMPARISON_TOKENS = {
    [ts.SyntaxKind.LessThanToken]: '<',
    [ts.SyntaxKind.GreaterThanToken]: '>',
    [ts.SyntaxKind.LessThanEqualsToken]: '<=',
    [ts.SyntaxKind.GreaterThanEqualsToken]: '>=',
};

// hand-written BaseExchange fields whose C# declaration already is a concrete
// dictionary/list (cs/ccxt/base/Exchange.Options.cs): a read of the field carries
// that static type, so its own members (`Count`, `ContainsKey`) replace the helper
const CSHARP_NATIVE_FIELDS: { [name: string]: string } = {
    'options': 'ConcurrentDictionary<string, object>',
    'features': 'Dictionary<string, object>',
    'httpExceptions': 'Dictionary<string, object>',
    'markets_by_id': 'IDictionary<string, object>',
    'symbols': 'List<object>',
    'codes': 'List<object>',
    'ids': 'List<object>',
};

// hand-written BaseExchange fields declared `object` that always box a dictionary
// (dict / CustomConcurrentDictionary<string, object>): the member needs the same
// `(IDictionary<string, object>)` cast the transpiled helper body itself applies
const CSHARP_OBJECT_DICT_FIELDS = [ 'urls', 'tickers', 'bidsasks', 'orderbooks', 'ohlcvs', 'trades', 'markets', 'currencies', 'currencies_by_id' ];

// C# collection types this printer can name whose members replace the helpers
const CSHARP_NATIVE_COLLECTION_TYPES = [ 'List<object>', 'IList<object>', 'Dictionary<string, object>', 'IDictionary<string, object>' ];

export class CSharpTranspiler extends BaseTranspiler {

    binaryExpressionsWrappers;
    // method node -> 'bool' | 'bool?' | undefined (see csharpBooleanReturnType)
    csharpBooleanReturnTypes = new WeakMap<ts.Node, string | undefined>();
    // variable declaration -> getCSharpLocalType result, shared by the condition checks
    csharpLocalTypes = new WeakMap<ts.Node, string>();
    // method node -> `key in recv` guards of that method, keyed by receiver text + key
    csharpGuardIndex = new WeakMap<ts.Node, Map<string, any[]>>();
    // optional proof of the concrete C# type of an expression, installed by the embedding build
    // layer for the locals it retypes itself (ccxt: build/csharp-local-types.js); it must
    // describe the same type the declaration is emitted with, or the operator will not compile
    csharpExpressionTypeResolver?: (node) => string | undefined;
    // variable declaration -> the concrete C# type this printer named for it
    // (getCSharpLocalType): 'List<object>' / 'Dictionary<string, object>' / 'string' / ...
    // Only declarations the printer typed itself are kept: the printed `<type> name = `
    // prefix is final, so every later read of the local is statically that type and its
    // members may replace inOp/getArrayLength
    csharpTypedLocals = new WeakMap<ts.Node, string>();

    constructor(config = {}) {
        config['parser'] = Object.assign ({}, parserConfig, config['parser'] ?? {});

        super(config);

        this.requiresParameterType = true;
        this.requiresReturnType = true;
        this.asyncTranspiling = true;
        this.implicitAsyncTranspiling = true;
        this.supportsFalsyOrTruthyValues = false;
        this.requiresCallExpressionCast = true;
        this.id = "C#";


        this.initConfig();

        // user overrides
        this.applyUserOverrides(config);
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
            'console.log': 'Console.WriteLine',
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
            'string': 'str',
            'object': 'obj',
            'params': 'parameters',
            'base': 'bs',
            'internal': 'intern',
            'event': 'eventVar',
            'fixed': 'fixedVar',
        };

        this.VariableTypeReplacements = {
            'string': 'string',
            'Str': 'string',
            'number': 'double',
            'Int': 'Int64',
            'Num': 'double',
            'Dict': 'Dictionary<string, object>',
            'Strings': 'List<string>',
            'List': 'List<object>',
            'boolean': 'bool',
        };

        this.ArgTypeReplacements = {
            'string': 'string',
            'Str': 'string',
            'number': 'double',
            'Int': 'Int64',
            'Num': 'double',
            'Dict': 'Dictionary<string, object>',
            'Strings': 'List<string>',
            'List': 'List<object>',
            'boolean': 'bool',
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

    getBlockOpen(identation){
        return "\n" + this.getIden(identation)  + this.BLOCK_OPENING_TOKEN + "\n";
    }

    printSuperCallInsideConstructor(node, identation) {
        return ""; // csharp does not need super call inside constructor
    }

    printIdentifier(node) {
        let idValue = node.text ?? node.escapedText;

        if (this.ReservedKeywordsReplacements[idValue]) {
            idValue = this.ReservedKeywordsReplacements[idValue];
        }

        if (idValue === "undefined") {
            return this.UNDEFINED_TOKEN;
        }

        // check if it is a class declaration that we need to wrap arounf typeof
        // example: const x = Error -> var x = typeof(Error)
        const type = this.getChecker().getTypeAtLocation(node);
        const symbol = type?.symbol;
        if (symbol !== undefined) {
            // const declarations = this.getChecker().getDeclaredTypeOfSymbol(symbol).symbol?.declarations ?? [];
            const decl = symbol?.declarations ?? [];
            let isBuiltIn = undefined;
            if (decl.length > 0) {
                isBuiltIn = decl[0].getSourceFile().fileName.indexOf('typescript') > -1; //very hacky find a better solution later
            }

            if (isBuiltIn !== undefined && !isBuiltIn) {
                // const isClassDeclaration = declarations.find(l => l.kind === ts.SyntaxKind.ClassDeclaration);
                const isInsideNewExpression =  node?.parent?.kind === ts.SyntaxKind.NewExpression;
                const isInsideCatch = node?.parent?.kind === ts.SyntaxKind.ThrowStatement;
                const isLeftSide = node?.parent?.name === node || (node?.parent?.left === node);
                const isCallOrPropertyAccess = node?.parent?.kind === ts.SyntaxKind.PropertyAccessExpression || node?.parent?.kind === ts.SyntaxKind.ElementAccessExpression;
                if (!isLeftSide && !isCallOrPropertyAccess && !isInsideCatch && !isInsideNewExpression) {
                    // return `typeof(${idValue})`; // this is not working as expected
                    // for instance
                    // const instance = new x();
                    // const b = instance;
                    // gets transpiled to
                    // var instance = typeof(x);
                    const symbol = this.getChecker().getSymbolAtLocation(node);
                    let isClassDeclaration = false;
                    if (symbol) {
                        const first = symbol.declarations[0];
                        if (first.kind === ts.SyntaxKind.ClassDeclaration) {
                            isClassDeclaration = true;
                        }
                        if (first.kind === ts.SyntaxKind.ImportSpecifier) {
                            const importedSymbol = this.getChecker().getAliasedSymbol(symbol);
                            if (importedSymbol?.declarations[0]?.kind === ts.SyntaxKind.ClassDeclaration) {
                                isClassDeclaration = true;
                            }
                        }
                    }
                    // console.log(node.getText(), 'isClass declaration', isClass);
                    if (isClassDeclaration) {
                        return `typeof(${idValue})`;
                        // this does not work then the class is imported from another file because
                        // the type is not resolved correctly and the symbol declaration is simply a importSpecifier
                        // we would need to find a way to get the type from the importSpecifier
                        // by loading the entire code upon transpiling the ts file
                    }
                }
            }
        }

        return this.transformIdentifier(node, idValue); // check this later
    }

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
        const isAsync = true; // setting to true for now, because there are some scenarios where we don't know
        const elementAccess = node.expression;
        if (elementAccess?.kind === ts.SyntaxKind.ElementAccessExpression) {
            const parsedArg = node.arguments?.length > 0 ? node.arguments.map(n => this.printNode(n, identation).trimStart()).join(", ") : "";
            const target = this.printNode(elementAccess.expression, 0);
            const propName = this.printNode(elementAccess.argumentExpression, 0);
            const argsArray = `new object[] { ${parsedArg} }`;
            const open = this.DYNAMIC_CALL_OPEN;
            let statement = `${open}${target}, ${propName}, ${argsArray})`;
            statement = isAsync ? `((Task<object>)${statement})` : statement;
            return statement;
        }
        return undefined;
    }


    printElementAccessExpressionExceptionIfAny(node) {
        // convert this[method] into this.call(method) or this.callAsync(method)
    //    if (node?.expression?.kind === ts.SyntaxKind.ThisKeyword) {
    //         const isAsyncDecl = node?.parent?.kind === ts.SyntaxKind.AwaitExpression;
    //         const open = isAsyncDecl ? this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN : this.UKNOWN_PROP_WRAPPER_OPEN;
    //         return open.replace('(', '');
    //    }
    }

    // reads print getValue(recv, key), which yields null for a missing key; a C# indexer
    // throws instead, so the native form is only emitted where the source guarantees the key
    // is there: a dominating `key in recv` guard, or a receiver local built by a literal that
    // declares the key. every other read keeps the helper.
    printElementAccessExpression(node, identation) {
        const native = this.csharpNativeElementAccess(node);
        if (native !== undefined) {
            return native;
        }
        return super.printElementAccessExpression(node, identation);
    }

    csharpNativeElementAccess(node): string | undefined {
        if (!this.ELEMENT_ACCESS_WRAPPER_OPEN || !this.ELEMENT_ACCESS_WRAPPER_CLOSE) {
            return undefined;
        }
        const exception: any = this.printElementAccessExpressionExceptionIfAny(node);
        if (exception) {
            return undefined; // the exception printing wins over the native form
        }
        const { expression, argumentExpression } = node;
        const parent = node.parent;
        const isWrite = parent?.kind === ts.SyntaxKind.BinaryExpression &&
            (parent.operatorToken.kind === ts.SyntaxKind.EqualsToken || parent.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) &&
            parent.left === node;
        if (isWrite) {
            return undefined; // writes are native already, they are printed with the cast
        }
        const isStringKey = ts.isStringLiteralLike(argumentExpression);
        const isNumberKey = ts.isNumericLiteral(argumentExpression);
        if (!isStringKey && !isNumberKey) {
            return undefined; // only literal keys can be proven present
        }
        const key = (argumentExpression as any).text;
        const builtFromLiteral = this.csharpLiteralDeclaresKey(node, expression, key, isNumberKey);
        const guarded = !builtFromLiteral && this.csharpKeyPresenceGuarded(node, expression, key);
        if (!builtFromLiteral && !guarded) {
            return undefined;
        }
        const receiver = this.printNode(expression, 0);
        const printedKey = this.printNode(argumentExpression, 0);
        if (isNumberKey) {
            return `((${this.ARRAY_KEYWORD})${receiver})[${printedKey}]`;
        }
        return `((IDictionary<string,object>)${receiver})[${printedKey}]`;
    }

    // the read sits in a branch that a `key in recv` guard admitted: same then-branch as the
    // guard, the else-branch of a negated guard, or after an early-exiting `if (!(key in recv))`
    csharpKeyPresenceGuarded(node, expression, key): boolean {
        const func = this.csharpEnclosingFunction(node);
        if (func === undefined || this.csharpEnclosingFunction(node) !== func) {
            return false;
        }
        const guards = this.csharpInGuardsOf(func).get(expression.getText() + GUARD_KEY_SEPARATOR + key);
        if (guards === undefined || !this.csharpReceiverIsDictionaryLike(expression, key)) {
            return false;
        }
        if (this.csharpReceiverIsRewritten(func, expression)) {
            return false; // a reassigned receiver is not the object the guard inspected
        }
        if (this.csharpHasKeyRemoval(func, expression, key)) {
            return false; // delete could have removed the guarded key
        }
        for (const guard of guards) {
            if (this.csharpGuardAdmitsRead(guard, node)) {
                return true;
            }
        }
        return false;
    }

    csharpGuardAdmitsRead(guard, read): boolean {
        const negated = this.csharpGuardIsNegated(guard);
        let statement: any = guard;
        while (statement !== undefined && statement.parent !== undefined) {
            const parent: any = statement.parent;
            if (ts.isIfStatement(parent) && this.csharpContains(parent.expression, guard)) {
                if (!negated && this.csharpContains(parent.thenStatement, read)) {
                    return true;
                }
                if (negated && parent.elseStatement !== undefined && this.csharpContains(parent.elseStatement, read)) {
                    return true;
                }
                // `if (!(key in recv)) { return/throw/continue; }` then the read after it
                if (negated && this.csharpAlwaysExits(parent.thenStatement) &&
                    read.getStart() >= parent.getEnd() && this.csharpContains(parent.parent, read)) {
                    return true;
                }
                return false;
            }
            if (ts.isWhileStatement(parent) && this.csharpContains(parent.expression, guard)) {
                return !negated && this.csharpContains(parent.statement, read);
            }
            statement = parent;
        }
        return false;
    }

    // `key in recv` guards in the function body, indexed by receiver text + key; nested
    // functions are skipped, their guards cannot dominate a read of the outer function
    csharpInGuardsOf(func): Map<string, any[]> {
        const cached = this.csharpGuardIndex.get(func);
        if (cached !== undefined) {
            return cached;
        }
        const index: Map<string, any[]> = new Map();
        const collect = (n: any) => {
            if (n !== func && ts.isFunctionLike(n)) {
                return;
            }
            if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.InKeyword) {
                const keyNode: any = n.left;
                if (ts.isStringLiteralLike(keyNode) || ts.isNumericLiteral(keyNode)) {
                    const id = n.right.getText() + GUARD_KEY_SEPARATOR + keyNode.text;
                    const list = index.get(id);
                    if (list === undefined) {
                        index.set(id, [ n ]);
                    } else {
                        list.push(n);
                    }
                }
            }
            ts.forEachChild(n, collect);
        };
        collect(func);
        this.csharpGuardIndex.set(func, index);
        return index;
    }

    // the read's receiver is a local whose only initializer is a literal that declares the
    // key, and the local is not reassigned or deleted from afterwards
    csharpLiteralDeclaresKey(node, expression, key, isNumberKey): boolean {
        if (!ts.isIdentifier(expression)) {
            return false;
        }
        const symbol: any = this.getChecker().getSymbolAtLocation(expression);
        const declarations: any = symbol?.declarations ?? [];
        if (declarations.length !== 1 || !ts.isVariableDeclaration(declarations[0])) {
            return false;
        }
        const declaration: any = declarations[0];
        if (declaration.initializer === undefined || declaration.getStart() >= node.getStart()) {
            return false;
        }
        const initializer = declaration.initializer;
        let declares = false;
        if (isNumberKey && ts.isArrayLiteralExpression(initializer)) {
            const spread = initializer.elements.some((element: any) => ts.isSpreadElement(element));
            declares = !spread && Number(key) < initializer.elements.length;
        } else if (!isNumberKey && ts.isObjectLiteralExpression(initializer)) {
            declares = this.csharpObjectLiteralDeclaresKey(initializer, key);
        }
        if (!declares) {
            return false;
        }
        const func = this.csharpEnclosingFunction(node);
        return func !== undefined && !this.csharpReceiverIsRewritten(func, expression);
    }

    csharpObjectLiteralDeclaresKey(literal, key): boolean {
        for (const property of literal.properties) {
            if (ts.isSpreadAssignment(property)) {
                return false; // spread keys cannot be enumerated
            }
            const name: any = (property as any).name;
            if (name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) && name.text === key) {
                return true;
            }
        }
        return false;
    }

    // the receiver must be a dictionary at runtime for the IDictionary cast to hold; `any`
    // receivers are rejected because the checker cannot tell what the read reaches
    csharpReceiverIsDictionaryLike(expression, key): boolean {
        const type: any = this.getChecker().getTypeAtLocation(expression);
        if (type.flags === ts.TypeFlags.Any || type.flags === ts.TypeFlags.Unknown) {
            return false;
        }
        const checker = this.getChecker();
        return checker.getIndexInfoOfType(type, ts.IndexKind.String) !== undefined ||
            checker.getPropertyOfType(type, key) !== undefined;
    }

    // any assignment to the receiver (or to a same-named binding) in the function makes the
    // object the read evaluates unprovable, so the read falls back to the helper
    csharpReceiverIsRewritten(func, expression): boolean {
        const text = expression.getText();
        const name = ts.isIdentifier(expression) ? text : text.split(/[.\[]/)[1];
        if (name === undefined) {
            return true;
        }
        let rewritten = false;
        const walk = (n: any) => {
            if (rewritten) {
                return;
            }
            if (ts.isIdentifier(n) && n.text === name) {
                const parent: any = n.parent;
                if (ts.isBinaryExpression(parent) && parent.left === n) {
                    rewritten = true;
                } else if ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && parent.operand === n) {
                    rewritten = true;
                } else if (ts.isDeleteExpression(parent)) {
                    rewritten = true;
                }
            }
            ts.forEachChild(n, walk);
        };
        walk(func);
        return rewritten;
    }

    csharpHasKeyRemoval(func, expression, key): boolean {
        const text = expression.getText();
        let removed = false;
        const walk = (n: any) => {
            if (removed) {
                return;
            }
            if (ts.isDeleteExpression(n) && ts.isElementAccessExpression(n.expression) &&
                n.expression.expression.getText() === text && n.expression.argumentExpression.getText().replace(/['"]/g, '') === key.replace(/['"]/g, '')) {
                removed = true;
            }
            ts.forEachChild(n, walk);
        };
        walk(func);
        return removed;
    }

    csharpGuardIsNegated(guard): boolean {
        let node: any = guard;
        while (node.parent !== undefined && ts.isParenthesizedExpression(node.parent)) {
            node = node.parent;
        }
        return node.parent !== undefined && ts.isPrefixUnaryExpression(node.parent) &&
            node.parent.operator === ts.SyntaxKind.ExclamationToken;
    }

    csharpAlwaysExits(statement): boolean {
        if (statement === undefined) {
            return false;
        }
        const exits = (n: any) => ts.isReturnStatement(n) || ts.isThrowStatement(n) || ts.isContinueStatement(n) || ts.isBreakStatement(n);
        if (exits(statement)) {
            return true;
        }
        if (ts.isBlock(statement) && statement.statements.length > 0) {
            return exits(statement.statements[statement.statements.length - 1]);
        }
        return false;
    }

    csharpContains(outer, inner): boolean {
        if (outer === undefined || inner === undefined) {
            return false;
        }
        return inner.getStart() >= outer.getStart() && inner.getEnd() <= outer.getEnd();
    }

    printWrappedUnknownThisProperty(node) {
        const type = this.getChecker().getResolvedSignature(node);
        if (type?.declaration === undefined) {
            let parsedArguments = node.arguments?.map((a) => this.printNode(a, 0)).join(", ");
            parsedArguments = parsedArguments ? parsedArguments : "";
            const propName = node.expression?.name.escapedText;
            // const isAsyncDecl = true;
            const isAsyncDecl = node?.parent?.kind === ts.SyntaxKind.AwaitExpression;
            // const open = isAsyncDecl ? this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN : this.UKNOWN_PROP_WRAPPER_OPEN;
            // const close = this.UNKOWN_PROP_WRAPPER_CLOSE;
            // return `${open}"${propName}"${parsedArguments}${close}`;
            const argsArray = `new object[] { ${parsedArguments} }`;
            const open = this.DYNAMIC_CALL_OPEN;
            let statement = `${open}this, "${propName}", ${argsArray})`;
            statement = isAsyncDecl ? `((Task<object>)${statement})` : statement;
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
                // case "JSON.parse":
                //     return `json_decode(${parsedArg}, $as_associative_array = true)`;
                case "Math.abs":
                    return `Math.Abs(Convert.ToDouble(${parsedArg}))`;
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
                    return `Math.Pow(Convert.ToDouble(${parsedArg1}), Convert.ToDouble(${parsedArg2}))`;
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
            return notOperator + `(${target} is string)`;
        case "number":
            return notOperator + `(${target} is Int64 || ${target} is int || ${target} is float || ${target} is double)`;
        case "boolean":
            return notOperator + `(${target} is bool)`;
        case "object":
            return notOperator + `(${target} is IDictionary<string, object>)`;
        case "function":
            return notOperator + `(${target} is Delegate)`;
        }

        return undefined;

    }

    // The C# type of an operand of `==` / `!=` as the printer emits it, or undefined when
    // the printer only knows `object`: an `object` operand takes the reference-comparing
    // `operator ==`, so those keep the isEqual helper.
    csharpEqualityOperandType(node): string | undefined {
        if (node === undefined) {
            return undefined;
        }
        switch (node.kind) {
        case ts.SyntaxKind.NullKeyword:
            return 'null';
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
            return 'bool';
        case ts.SyntaxKind.NumericLiteral:
            return this.csharpNumericLiteralKind(node);
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.csharpEqualityOperandType(node.expression);
        case ts.SyntaxKind.Identifier:
            // printIdentifier prints the `undefined` identifier as null
            return (node.escapedText === 'undefined') ? 'null' : this.csharpDeclaredTypeOfBinding(node);
        }
        if (ts.isStringLiteralLike(node)) {
            return 'string';
        }
        return this.csharpTypeOfInitializer(node);
    }

    // A numeric literal prints as an untyped C# constant that adapts to the operand on the
    // other side. isEqual's integer branches round-trip through Convert.ToInt64, which an
    // integer literal beyond 2^53 does not survive, so those stay on the helper.
    csharpNumericLiteralKind(node): string | undefined {
        const value = Number(node.text);
        if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
            return undefined;
        }
        return 'number';
    }

    // the C# type the declaration behind an identifier was printed with ('object' when the
    // printer named none), or undefined when the identifier is not a printed local
    csharpDeclaredTypeOfBinding(node): string | undefined {
        let symbol;
        try {
            symbol = this.getChecker().getSymbolAtLocation(node);
        } catch (e) {
            return undefined;
        }
        const declaration = symbol?.valueDeclaration;
        if (declaration === undefined) {
            return undefined;
        }
        if (declaration.kind === ts.SyntaxKind.VariableDeclaration) {
            return this.getCSharpLocalType(declaration);
        }
        if (declaration.kind === ts.SyntaxKind.BindingElement) {
            return 'var'; // `const [a, b] = ...` prints `var a = ((IList<object>)...)[0]`
        }
        return undefined; // parameters are retyped after printing by the build script
    }

    // the C# operator family an operand belongs to: `==` compares two operands of one family
    // by value, exactly like the isEqual branches those types take
    csharpValueEqualityKind(csharpType): string | undefined {
        switch (csharpType) {
        case 'string':
        case 'string?':
            return 'string';
        case 'bool':
        case 'bool?':
            return 'bool';
        case 'double':
        case 'double?':
            return 'double';
        case 'Int64':
        case 'long':
        case 'Int64?':
        case 'long?':
            return 'Int64';
        case 'int':
        case 'int?':
            return 'int';
        case 'number':
            return 'number'; // numeric literal, adapts to the numeric operand it is compared with
        }
        return undefined;
    }

    // `x == null` compiles — and matches isEqual — for reference types and nullable value
    // types, but not for a non-nullable value type (double / bool / Int64 / int). Lists,
    // dictionaries, class instances and `var` are references, and are the only types left
    // once csharpValueEqualityKind has claimed the value-typed names above.
    csharpIsNullComparableType(csharpType): boolean {
        if ((csharpType === undefined) || (csharpType === '') || (csharpType === 'null')) {
            return false;
        }
        if (csharpType.endsWith('?')) {
            return true;
        }
        if ((csharpType === 'object') || (csharpType === 'string')) {
            return true;
        }
        return (this.csharpValueEqualityKind(csharpType) === undefined);
    }

    // TypeScript numbers and booleans are C# value types in this port (double / bool /
    // Int64 / int), and the ccxt build script retypes some `object` declarations to exactly
    // those from its own tables (precisionFromString -> int, milliseconds -> Int64,
    // isEmpty -> bool). A null comparison against one of them would not compile, and the
    // printer's `object` cannot rule it out, so these always keep the helper.
    csharpOperandIsValueTyped(node): boolean {
        if (node === undefined) {
            return true;
        }
        let type;
        try {
            type = this.getChecker().getTypeAtLocation(node);
        } catch (e) {
            return true;
        }
        return this.csharpTypeHasValueScalar(type);
    }

    csharpTypeHasValueScalar(type): boolean {
        if (type === undefined) {
            return true;
        }
        const flags = type.flags;
        if (flags & ts.TypeFlags.Union) {
            const members = type.types ?? [];
            return members.some((member) => this.csharpTypeHasValueScalar(member));
        }
        return (flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral | ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) !== 0;
    }

    // `a === b` / `a !== b` between two plain reads: a local or parameter prints as a bare
    // name and both operands are read once by the printed expression
    csharpOperandsAreDeclaredReads(left, right): boolean {
        const isRead = (node) => (node?.kind === ts.SyntaxKind.Identifier) && (node.escapedText !== 'undefined');
        return isRead(left) && isRead(right);
    }

    // the C# type the embedding build layer declares for a read the printer can only call
    // `object`: that layer retypes the declaration so its recorded type IS the printed one
    csharpDeclaredReadEqualityType(node, printerType: string | undefined): string | undefined {
        if ((printerType !== undefined) && (printerType !== this.VAR_TOKEN) && (printerType !== 'var')) {
            return printerType;
        }
        const resolver = this.csharpExpressionTypeResolver;
        if (typeof resolver !== 'function') {
            return printerType;
        }
        let resolved;
        try {
            resolved = resolver(node);
        } catch (e) {
            return printerType;
        }
        return (typeof resolved === 'string') ? resolved : printerType;
    }

    // `==` / `!=` in place of the isEqual wrapper when both operands are C# values of one
    // family, or one side is null/undefined against a type `== null` compiles for. Both
    // operands are printed once, so neither is evaluated twice.
    printInlineEquality(left, right, leftText: string, rightText: string, isEquality: boolean): string | undefined {
        let leftType = this.csharpEqualityOperandType(left);
        let rightType = this.csharpEqualityOperandType(right);
        if (this.csharpOperandsAreDeclaredReads(left, right)) {
            leftType = this.csharpDeclaredReadEqualityType(left, leftType);
            rightType = this.csharpDeclaredReadEqualityType(right, rightType);
        }
        if ((leftType === undefined) || (rightType === undefined)) {
            return undefined;
        }
        if (leftType === 'null') {
            if (!this.csharpIsNullComparableType(rightType) || this.csharpOperandIsValueTyped(right)) {
                return undefined;
            }
            return this.csharpNullComparison(rightText, isEquality);
        }
        if (rightType === 'null') {
            if (!this.csharpIsNullComparableType(leftType) || this.csharpOperandIsValueTyped(left)) {
                return undefined;
            }
            return this.csharpNullComparison(leftText, isEquality);
        }
        const leftKind = this.csharpValueEqualityKind(leftType);
        const rightKind = this.csharpValueEqualityKind(rightType);
        if ((leftKind === undefined) || (rightKind === undefined)) {
            return undefined;
        }
        // mixed numeric kinds are not equal in isEqual: `int` vs `double` takes the
        // `(int)a == (int)b` branch and throws on the boxed double, so only a numeric
        // literal may meet a different numeric type
        const numericKinds = [ 'double', 'Int64', 'int' ];
        const sameKind = (leftKind === rightKind);
        const literalVsNumeric = ((leftKind === 'number') && (numericKinds.indexOf(rightKind) >= 0))
            || ((rightKind === 'number') && (numericKinds.indexOf(leftKind) >= 0));
        if (!sameKind && !literalVsNumeric) {
            return undefined;
        }
        return isEquality ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
    }

    csharpNullComparison(text: string, isEquality: boolean) {
        return isEquality ? `(${text} == null)` : `(${text} != null)`;
    }

    // the concrete C# type of an expression the printer can name, or undefined: the embedding
    // build layer's proof wins (it retypes locals the printer leaves `object`), then the
    // printer's own tables and the literals whose C# type is fixed by their text
    csharpExpressionTypeOf(node): string | undefined {
        const provided = this.csharpExpressionTypeResolver ? this.csharpExpressionTypeResolver(node) : undefined;
        if (provided !== undefined) {
            return provided;
        }
        if (ts.isNumericLiteral(node)) {
            const value = Number(node.text);
            // wider literals are typed uint/long/ulong by the C# compiler, keep the helper
            return (Number.isInteger(value) && Math.abs(value) <= 2147483647) ? 'int' : undefined;
        }
        if (ts.isPrefixUnaryExpression(node) && (node.operator === ts.SyntaxKind.MinusToken) && ts.isNumericLiteral(node.operand)) {
            const value = Number(node.operand.text);
            return (Number.isInteger(value) && (value <= 2147483647)) ? 'int' : undefined;
        }
        return this.csharpTypeOfInitializer(node);
    }

    // the TypeScript checker must see two plain numbers: `any` (could be a string box) and a
    // nullable union (the helper orders null, C# would throw) both keep the runtime helper
    csharpOperandsAreNumbers(node): boolean {
        const isNumber = (operand) => {
            let flags;
            try {
                flags = this.getChecker().getTypeAtLocation(operand)?.flags;
            } catch (e) {
                return false; // in-memory program without a checker
            }
            return (flags === ts.TypeFlags.Number) || (flags === ts.TypeFlags.NumberLiteral);
        };
        return isNumber(node.left) && isNumber(node.right);
    }

    // `<`, `>`, `<=`, `>=` on two operands of the same proven C# number kind print natively:
    // the helper compares the two boxes with the conversions the operator applies, and only
    // `double` carries a value (NaN) the two disagree on — see CSHARP_NUMERIC_KINDS
    csharpNativeNumericComparison(node, identation): string | undefined {
        const token = CSHARP_NATIVE_COMPARISON_TOKENS[node.operatorToken.kind];
        if (token === undefined) {
            return undefined;
        }
        const leftKind = this.csharpExpressionTypeOf(node.left);
        const rightKind = this.csharpExpressionTypeOf(node.right);
        if ((leftKind === undefined) || (leftKind !== rightKind) || (CSHARP_NUMERIC_KINDS.indexOf(leftKind) < 0)) {
            return undefined;
        }
        if ((leftKind === 'double') && ((token === '<') || (token === '<='))) {
            return undefined;
        }
        if (!this.csharpOperandsAreNumbers(node)) {
            return undefined;
        }
        const leftText = this.printNode(node.left, 0).trim();
        const rightText = this.printNode(node.right, 0).trim();
        return leftText + ' ' + token + ' ' + rightText;
    }

    // the printed receiver whose C# static type is a known collection: a local this
    // printer declared with a concrete type (csharpTypedLocals), or a hand-written
    // BaseExchange field. undefined keeps the runtime helper, since the printer cannot
    // name the type of the value the operand holds
    csharpNativeReceiver(node): { text: string, type: string } | undefined {
        if (node?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            const inner = this.csharpNativeReceiver(node.expression);
            return inner === undefined ? undefined : { text: `(${inner.text})`, type: inner.type };
        }
        if (ts.isIdentifier(node)) {
            const named = this.csharpTypedLocalType(node);
            return (named === undefined || CSHARP_NATIVE_COLLECTION_TYPES.indexOf(named) < 0) ? undefined : { text: this.printNode(node, 0), type: named };
        }
        if (ts.isPropertyAccessExpression(node) && node.expression?.kind === ts.SyntaxKind.ThisKeyword) {
            const name = node.name?.escapedText as string;
            if (CSHARP_OBJECT_DICT_FIELDS.indexOf(name) >= 0) {
                // the field is declared `object`; its box is always a dictionary
                return { text: `((IDictionary<string, object>)${this.printNode(node, 0)})`, type: 'IDictionary<string, object>' };
            }
            return CSHARP_NATIVE_FIELDS[name] === undefined ? undefined : { text: this.printNode(node, 0), type: CSHARP_NATIVE_FIELDS[name] };
        }
        // a call whose printed C# type this printer already names (Object.keys, this.indexBy,
        // x.split, ...) is a collection too
        const callType = this.csharpCallReturnType(node);
        if (callType !== undefined && CSHARP_NATIVE_COLLECTION_TYPES.indexOf(callType) >= 0) {
            const printed = this.printNode(node, 0);
            return { text: printed.startsWith('new ') ? `(${printed})` : printed, type: callType };
        }
        return undefined;
    }

    // the C# types this printer can name on a local whose members replace the helpers:
    // the collection types (Count/ContainsKey) and string (Length/ContainsKey keys)
    csharpTypeIsNative(csharpType: string): boolean {
        return CSHARP_NATIVE_COLLECTION_TYPES.indexOf(csharpType) >= 0 || csharpType.indexOf('string') === 0;
    }

    // the C# type this printer declared for a local read, or undefined
    csharpTypedLocalType(node): string | undefined {
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
        return declaration === undefined ? undefined : this.csharpTypedLocals.get(declaration);
    }

    // the printed key of ContainsKey must itself be a C# string: a literal, a local this
    // printer declared `string`, a call it types as string, or its own `((string)x)` cast
    csharpNativeStringKey(key): string | undefined {
        if (key?.kind === ts.SyntaxKind.ParenthesizedExpression) {
            return this.csharpNativeStringKey(key.expression);
        }
        if (ts.isStringLiteralLike(key)) {
            return this.printNode(key, 0);
        }
        if (ts.isIdentifier(key)) {
            const named = this.csharpTypedLocalType(key);
            return (named === undefined || named.indexOf('string') !== 0) ? undefined : this.printNode(key, 0);
        }
        if (this.csharpCallReturnType(key) === 'string') {
            return this.printNode(key, 0);
        }
        const printed = this.printNode(key, 0);
        return printed.startsWith('((string)') ? printed : undefined;
    }

    // the checker's view of an `in` / `.length` operand: a dictionary carries a string
    // index signature, an array is the Array reference type. `any` proves nothing
    csharpIsDictionaryType(type): boolean {
        if (type === undefined || this.isAnyType(type.flags)) {
            return false;
        }
        return this.getChecker().getIndexTypeOfType(type, ts.IndexKind.String) !== undefined;
    }

    csharpIsArrayType(type): boolean {
        if (type === undefined || this.isAnyType(type.flags)) {
            return false;
        }
        return type?.symbol?.escapedName === 'Array';
    }

    // `key in obj` -> `obj.ContainsKey(key)`, only when the checker proves obj is a
    // dictionary and both the printed key and the printed operand are already C#
    // dictionary/string values. Every other shape keeps the inOp helper
    csharpNativeInExpression(key, obj): string | undefined {
        const checker = this.getChecker();
        if (!this.isStringType(checker.getTypeAtLocation(key).flags)) {
            return undefined;
        }
        if (!this.csharpIsDictionaryType(checker.getTypeAtLocation(obj))) {
            return undefined;
        }
        const receiver = this.csharpNativeReceiver(obj);
        // only a dictionary C# type carries ContainsKey (IList<object> keeps the helper)
        if (receiver === undefined || receiver.type.indexOf('Dictionary<') < 0) {
            return undefined;
        }
        const printedKey = this.csharpNativeStringKey(key);
        if (printedKey === undefined) {
            return undefined;
        }
        return `${receiver.text}.ContainsKey(${printedKey})`;
    }

    // `x.length` -> `x.Count`, same proof for the checker's array operands; strings keep
    // the `((string)x).Length` branch and every unproven operand keeps getArrayLength
    csharpNativeLengthExpression(expression): string | undefined {
        if (!this.csharpIsArrayType(this.getChecker().getTypeAtLocation(expression))) {
            return undefined;
        }
        const receiver = this.csharpNativeReceiver(expression);
        if (receiver === undefined) {
            return undefined;
        }
        return `${receiver.text}.Count`;
    }

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right;

        const op = node.operatorToken.kind;

        if (left.kind === ts.SyntaxKind.TypeOfExpression) {
            const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
            if (typeOfExpression) {
                return typeOfExpression;
            }
        }

        // handle: [x,d] = this.method()
        if (op === ts.SyntaxKind.EqualsToken && left.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            const arrayBindingPatternElements = left.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement = `var ${syntheticName} = ${this.printNode(right, 0)};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                // const type = this.getType(node);
                // const parsedType = this.getTypeFromRawType(type);
                const leftElement = arrayBindingPatternElements[index];
                const leftType = this.getChecker().getTypeAtLocation(leftElement);
                const parsedType = this.getTypeFromRawType(leftType);

                const castExp = parsedType ? `(${parsedType})` : "";

                // const statement = this.getIden(identation) + `${e} = (${castExp}((List<object>)${syntheticName}))[${index}]`;
                const statement = this.getIden(identation) + `${e} = ((IList<object>)${syntheticName})[${index}]`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + ";\n";
                } else {
                    // printStatement adds the last ;
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        if (op === ts.SyntaxKind.InKeyword) {
            const nativeIn = this.csharpNativeInExpression(left, right);
            if (nativeIn !== undefined) {
                return nativeIn;
            }
            return `inOp(${this.printNode(right, 0)}, ${this.printNode(left, 0)})`;
        }

        // only print the operands when this op is actually handled here; otherwise
        // the base printBinaryExpression prints them, and doing it eagerly means
        // every unhandled binary expression gets its subtrees printed twice
        if (op === ts.SyntaxKind.PlusEqualsToken || op === ts.SyntaxKind.MinusEqualsToken || op in this.binaryExpressionsWrappers) {
            const nativeComparison = this.csharpNativeNumericComparison(node, identation);
            if (nativeComparison !== undefined) {
                return nativeComparison;
            }
            const leftText = this.printNode(left, 0);
            const rightText = this.printNode(right, 0);

            if (op === ts.SyntaxKind.PlusEqualsToken) {
                return `${leftText} = add(${leftText}, ${rightText})`;
            }

            if (op === ts.SyntaxKind.MinusEqualsToken) {
                return `${leftText} = subtract(${leftText}, ${rightText})`;
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

    // the C# type of a whole-call / whole-property initializer, keyed on the AST so
    // the printer's cast wrappers (`((string)x).ToUpper()`) do not hide the callee
    csharpCallReturnType(initializer): string | undefined {
        if (initializer?.kind === ts.SyntaxKind.PropertyAccessExpression) {
            // `x.length` prints `((string)x).Length` or `getArrayLength(x)`, both int
            return (initializer.name?.escapedText === 'length') ? 'int' : undefined;
        }
        if (initializer?.kind !== ts.SyntaxKind.CallExpression) {
            return undefined;
        }
        const expression = initializer.expression;
        if (expression?.kind !== ts.SyntaxKind.PropertyAccessExpression) {
            return undefined;
        }
        const methodName = expression.name?.escapedText as string;
        const target = expression.expression;
        if (target?.kind === ts.SyntaxKind.ThisKeyword) {
            // the table names the C# signature of the same-name base helper, which the printed
            // call only binds when the printer resolves the callee. An unresolvable one
            // (`this.proxyUrlCallback(...)` — a property holding the function — or a
            // checker-less program) prints `callDynamically(this, "name", ...)` instead, and
            // that helper returns `object`: no concrete type may be named for its value
            if (!this.csharpCalleeResolves(initializer)) {
                return undefined;
            }
            return CSHARP_THIS_RETURN_TYPES[methodName];
        }
        if (target?.kind === ts.SyntaxKind.Identifier) {
            const full = (target.escapedText as string) + '.' + methodName;
            if (CSHARP_STATIC_RETURN_TYPES[full] !== undefined) {
                return CSHARP_STATIC_RETURN_TYPES[full];
            }
        }
        return CSHARP_METHOD_RETURN_TYPES[methodName];
    }

    // mirrors printWrappedUnknownThisProperty: a `this.<name>(...)` call whose callee the
    // checker cannot resolve is printed as `callDynamically(this, "<name>", ...)`, whose C#
    // signature returns `object` whatever the name says
    csharpCalleeResolves(node): boolean {
        let signature;
        try {
            signature = this.getChecker().getResolvedSignature(node);
        } catch (e) {
            return false;
        }
        return signature?.declaration !== undefined;
    }

    // the concrete C# type the initializer already produces, or undefined when the
    // printer cannot name it (this.safeString, getValue, add, parseInt, ... return object)
    csharpTypeOfInitializer(initializer): string | undefined {
        switch (initializer?.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return 'string';
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
            return 'bool';
        case ts.SyntaxKind.PrefixUnaryExpression:
            // `!x` prints `!isTrue(x)`
            return (initializer.operator === ts.SyntaxKind.ExclamationToken) ? 'bool' : undefined;
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.csharpTypeOfInitializer(initializer.expression);
        case ts.SyntaxKind.BinaryExpression: {
            const op = initializer.operatorToken.kind;
            // `a || b` prints `isTrue(a) || isTrue(b)`; the comparison wrappers and
            // `in` all return bool
            switch (op) {
            case ts.SyntaxKind.BarBarToken:
            case ts.SyntaxKind.AmpersandAmpersandToken:
            case ts.SyntaxKind.EqualsEqualsToken:
            case ts.SyntaxKind.EqualsEqualsEqualsToken:
            case ts.SyntaxKind.ExclamationEqualsToken:
            case ts.SyntaxKind.ExclamationEqualsEqualsToken:
            case ts.SyntaxKind.GreaterThanToken:
            case ts.SyntaxKind.GreaterThanEqualsToken:
            case ts.SyntaxKind.LessThanToken:
            case ts.SyntaxKind.LessThanEqualsToken:
            case ts.SyntaxKind.InKeyword:
                return 'bool';
            }
            return undefined;
        }
        }
        return this.csharpCallReturnType(initializer);
    }

    csharpEnclosingFunction(node) {
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

    csharpTypeNameIsShadowed(scope, csharpType: string): boolean {
        const names = csharpType.match(/[A-Za-z_]\w*/g) ?? [];
        const relevant = names.filter((n) => CSHARP_TYPE_NAMES.indexOf(n) >= 0);
        if (relevant.length === 0 || scope === undefined) {
            return false;
        }
        let shadowed = false;
        const visit = (n) => {
            if (shadowed) { return; }
            const isBinding = (n.kind === ts.SyntaxKind.Parameter) || (n.kind === ts.SyntaxKind.VariableDeclaration);
            if (isBinding && (n.name?.kind === ts.SyntaxKind.Identifier)) {
                const printed = this.printNode(n.name, 0);
                if (relevant.indexOf(printed) >= 0) { shadowed = true; return; }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return shadowed;
    }

    // reject the refinement when something downstream needs the local to stay `object`:
    // `x.push(v)` prints `((IList<object>)x).Add(v)` on a value that must be boxed, a
    // later assignment of another concrete type would stop compiling, and `x++` prints
    // `postFixIncrement(ref x)` whose parameter is `ref object`
    csharpLocalIsSafeToType(scope, declaration, varName: string, csharpType: string, safeAccessor = false): boolean {
        if (scope === undefined) {
            return false;
        }
        let safe = true;
        const visit = (n) => {
            if (!safe) { return; }
            if ((n.kind === ts.SyntaxKind.Identifier) && (n.escapedText === varName) && (n !== declaration.name)) {
                const parent = n.parent;
                if (parent?.kind === ts.SyntaxKind.VariableDeclaration && parent.name === n) {
                    return; // a sibling block-scoped declaration; it gets its own type
                }
                if ((parent?.kind === ts.SyntaxKind.PostfixUnaryExpression) || (parent?.kind === ts.SyntaxKind.PrefixUnaryExpression)) {
                    const op = parent.operator;
                    if ((op === ts.SyntaxKind.PlusPlusToken) || (op === ts.SyntaxKind.MinusMinusToken)) {
                        safe = false; // postFixIncrement(ref x) takes a ref object
                        return;
                    }
                    // prefixUnaryNeg/Plus(ref x) has int / Int64 / double twins only: a
                    // nullable or reference local would not bind any overload
                    if (safeAccessor && (op !== ts.SyntaxKind.ExclamationToken) && (csharpType !== 'int') && (csharpType !== 'Int64') && (csharpType !== 'double')) {
                        safe = false;
                        return;
                    }
                }
                if (parent?.kind === ts.SyntaxKind.SpreadElement) {
                    safe = false;
                    return;
                }
                if (parent?.kind === ts.SyntaxKind.ArrayLiteralExpression
                    && parent.parent?.kind === ts.SyntaxKind.BinaryExpression
                    && parent.parent.left === parent
                    && parent.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                    safe = false; // [x, y] = f() destructures into `x = ((IList<object>)...)[0]`
                    return;
                }
                if (parent?.kind === ts.SyntaxKind.PropertyAccessExpression && parent.expression === n) {
                    const method = parent.name?.escapedText;
                    // these print as `((IList<object>)x).Add(...)` / `x = (x as IList<object>)...`
                    if ((method === 'push') || (method === 'reverse') || (method === 'sort')) {
                        safe = false;
                        return;
                    }
                    // the remaining list methods print an `((IList<object>)x)` cast too; only
                    // a safe* list local can carry one
                    if (safeAccessor && !this.csharpTypeIsList(csharpType) && ((method === 'join') || (method === 'shift') || (method === 'pop'))) {
                        safe = false;
                        return;
                    }
                }
                if (safeAccessor) {
                    // `const [a, b] = x` prints a `((IList<object>)x)[0]` read
                    if (parent?.kind === ts.SyntaxKind.VariableDeclaration && parent.name?.kind === ts.SyntaxKind.ArrayBindingPattern && !this.csharpTypeIsList(csharpType)) {
                        safe = false;
                        return;
                    }
                    // `throw new ExchangeError (x)` wraps the argument in a hard `(string)`
                    // cast, which only compiles from `object` or a string
                    if (!this.csharpTypeIsStringType(csharpType) && this.csharpIsClassThrowArgument(n)) {
                        safe = false;
                        return;
                    }
                    // `delete obj[x]` prints `.Remove((string)x)`, the same hard cast
                    if (!this.csharpTypeIsStringType(csharpType) && this.csharpIsDeleteKey(n)) {
                        safe = false;
                        return;
                    }
                }
                if (parent?.kind === ts.SyntaxKind.BinaryExpression && parent.left === n) {
                    const op = parent.operatorToken.kind;
                    if (op === ts.SyntaxKind.EqualsToken) {
                        if (this.csharpTypeOfInitializer(parent.right) !== csharpType) {
                            safe = false;
                            return;
                        }
                    } else if ((op >= ts.SyntaxKind.FirstCompoundAssignment) && (op <= ts.SyntaxKind.LastCompoundAssignment)) {
                        safe = false;
                        return;
                    }
                }
                // a `string?` local as the LEFT operand of `+` prints add(<x>, ...): the
                // nullable-to-`string` conversion makes add(string, ...) a better match than
                // add(object, object), which turns a null left into the right operand instead
                // of null (see the same rule in the ccxt cs/ccxt/base comments)
                if (safeAccessor && (csharpType === 'string?') && this.csharpIsLeftPlusOperand(n)) {
                    safe = false;
                    return;
                }
            }
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(scope, visit);
        return safe;
    }

    getCSharpLocalType(declaration): string {
        const csharpType = this.csharpTypeOfInitializer(declaration.initializer);
        if (csharpType === undefined) {
            return this.VAR_TOKEN;
        }
        // the scan matches AST identifiers, so it needs the source name, not the
        // printed one (`string` is renamed to `str` on the way out)
        const sourceName = declaration.name?.escapedText;
        if (sourceName === undefined) {
            return this.VAR_TOKEN;
        }
        const scope = this.csharpEnclosingFunction(declaration);
        const safeAccessor = this.csharpIsSafeAccessorCall(declaration.initializer);
        if (this.csharpTypeNameIsShadowed(scope, csharpType) || !this.csharpLocalIsSafeToType(scope, declaration, sourceName, csharpType, safeAccessor)) {
            return this.VAR_TOKEN;
        }
        return csharpType;
    }

    // `this.safeString2 (...)`: the printed call binds the concrete C# signature of the
    // same-name base helper (see CSHARP_THIS_RETURN_TYPES). Used to gate the extra sinks.
    csharpIsSafeAccessorCall(initializer): boolean {
        if (initializer?.kind !== ts.SyntaxKind.CallExpression) {
            return false;
        }
        const expression = initializer.expression;
        if (expression?.kind !== ts.SyntaxKind.PropertyAccessExpression || expression.expression?.kind !== ts.SyntaxKind.ThisKeyword) {
            return false;
        }
        return CSHARP_SAFE_ACCESSOR_NAMES.indexOf(expression.name?.escapedText as string) >= 0;
    }

    csharpTypeIsList(csharpType: string): boolean {
        return (csharpType === 'List<object>') || (csharpType === 'IList<object>');
    }

    csharpTypeIsStringType(csharpType: string): boolean {
        return (csharpType === 'string') || (csharpType === 'string?');
    }

    // `throw new ExchangeError (x)`: the printer wraps the argument in a hard `(string)`
    csharpIsClassThrowArgument(node): boolean {
        let current = node;
        while (current.parent) {
            const parent = current.parent;
            if ((parent.kind === ts.SyntaxKind.ParenthesizedExpression) || (parent.kind === ts.SyntaxKind.AsExpression)) {
                current = parent;
                continue;
            }
            if ((parent.kind === ts.SyntaxKind.NewExpression) && (parent.arguments?.indexOf(current) >= 0)) {
                current = parent;
                continue;
            }
            return parent.kind === ts.SyntaxKind.ThrowStatement;
        }
        return false;
    }

    // `delete obj[x]` prints `.Remove((string)x)`
    csharpIsDeleteKey(node): boolean {
        let value = node;
        while (value.parent && ((value.parent.kind === ts.SyntaxKind.ParenthesizedExpression) || (value.parent.kind === ts.SyntaxKind.AsExpression))) {
            value = value.parent;
        }
        const access = value.parent;
        return access?.kind === ts.SyntaxKind.ElementAccessExpression && access.argumentExpression === value && access.parent?.kind === ts.SyntaxKind.DeleteExpression;
    }

    // `(x) + y` / `x + y` prints `add(x, y)`: the parentheses keep x's static type
    csharpIsLeftPlusOperand(node): boolean {
        let value = node;
        while (value.parent && (value.parent.kind === ts.SyntaxKind.ParenthesizedExpression)) {
            value = value.parent;
        }
        const parent = value.parent;
        if (parent?.kind !== ts.SyntaxKind.BinaryExpression || parent.left !== value) {
            return false;
        }
        const op = parent.operatorToken.kind;
        return (op === ts.SyntaxKind.PlusToken) || (op === ts.SyntaxKind.PlusEqualsToken);
    }

    printVariableDeclarationList(node,identation) {
        const declaration = node.declarations[0];
        // const name = declaration.name.escapedText;

        if (this.removeVariableDeclarationForFunctionExpression && declaration?.initializer &&  ts.isFunctionExpression(declaration.initializer)) {
            return this.printNode(declaration.initializer, identation).trimEnd();
        }
        // handle array binding : input: const [a,b] = this.method()
        // output: var abVar = this.method; var a = abVar[0]; var b = abVar[1];
        if (declaration?.name.kind === ts.SyntaxKind.ArrayBindingPattern) {
            const arrayBindingPattern = declaration.name;
            const arrayBindingPatternElements = arrayBindingPattern.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e.name, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement =  `${this.getIden(identation)}var ${syntheticName} = ${this.printNode(declaration.initializer, 0)};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                // const type = this.getType(node);
                // const parsedType = this.getTypeFromRawType(type);
                const statement = this.getIden(identation) + `var ${e} = ((IList<object>) ${syntheticName})[${index}]`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + ";\n";
                } else {
                    // printStatement adds the last ;
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        const isNew = declaration?.initializer && (declaration.initializer.kind === ts.SyntaxKind.NewExpression);
        const varToken = isNew ? 'var ' : this.VAR_TOKEN + ' ' ;

        // handle default undefined initialization
        if (declaration?.initializer && declaration.initializer === undefined) {
            // handle the let id: Str; case
            return this.getIden(identation) + varToken + this.printNode(declaration.name) + " = " + this.UNDEFINED_TOKEN;
        } else if (!declaration.initializer) {
            return this.getIden(identation) + 'object ' + this.printNode(declaration.name) + " = " + this.UNDEFINED_TOKEN;
        }
        const parsedValue = this.printNode(declaration.initializer, identation).trimStart();
        if (parsedValue === this.UNDEFINED_TOKEN) {
            let specificVarToken = "object";
            if (this.INFER_VAR_TYPE) {
                const variableType = this.getChecker().typeToString(this.getChecker().getTypeAtLocation(declaration));
                if (this.VariableTypeReplacements[variableType]) {
                    specificVarToken = this.VariableTypeReplacements[variableType] + '?';
                }
            }
            return this.getIden(identation) + specificVarToken + " " + this.printNode(declaration.name) + " = " + parsedValue;
        }
        const declaredType = isNew ? 'var' : this.getCSharpLocalType(declaration);
        // remember the concrete types this printer declared itself: the printed prefix is
        // final (a host wrapper only rewrites untyped `object <name> = ` declarations), so
        // the local's static type is known at every later read
        if (!isNew && node.declarations.length === 1 && this.csharpTypeIsNative(declaredType)) {
            this.csharpTypedLocals.set(declaration, declaredType);
        }
        return this.getIden(identation) + declaredType + " " + this.printNode(declaration.name) + " = " + parsedValue;
    }

    transformPropertyAcessExpressionIfNeeded(node) {
        const expression = node.expression;
        const leftSide = this.printNode(expression, 0);
        const rightSide = node.name.escapedText;

        let rawExpression = undefined;

        switch(rightSide) {
        case 'length':
                const type = (this.getChecker() as TypeChecker).getTypeAtLocation(expression); // eslint-disable-line
            this.warnIfAnyType(node, type.flags, leftSide, "length");
            // rawExpression = this.isStringType(type.flags) ? `(string${leftSide}).Length` : `(${leftSide}.Cast<object>().ToList()).Count`;
            rawExpression = this.isStringType(type.flags) ? `((string)${leftSide}).Length` : (this.csharpNativeLengthExpression(expression) ?? `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`); // `(${leftSide}.Cast<object>()).ToList().Count`
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
        if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node) || ts.isStringLiteral(node) || (ts as any).isBooleanLiteral(node)) {
            return this.UNDEFINED_TOKEN;
        }

        if (ts.isNumericLiteral(node)) {
            return this.UNDEFINED_TOKEN;
        }

        // convert x: number = undefined (invalid) into x = -1 (valid)
        if (node?.escapedText === "undefined" && this.getChecker().getTypeAtLocation(node?.parent)?.flags === ts.TypeFlags.Number) {
            // return "-1";
            return this.UNDEFINED_TOKEN;
        }

        return undefined;
    }

    printFunctionBody(node, identation) {

        // check if there is any default parameter to initialize
        const funcParams = node.parameters;
        const initParams = [];
        if (funcParams.length > 0) {
            const body = node.body.statements;
            const first = body.length > 0 ? body[0] : [];
            const remaining = body.length > 0 ? body.slice(1): [];
            let firstStatement = this.printNode(first, identation + 1);

            const remainingString = remaining.map((statement) => this.printNode(statement, identation + 1)).join("\n");
            funcParams.forEach((param) => {
                const initializer = param.initializer;
                if (initializer) {
                    if (ts.isArrayLiteralExpression(initializer)) {
                        initParams.push(`${this.printNode(param.name, 0)} ??= new List<object>();`);
                    }
                    if (ts.isObjectLiteralExpression(initializer)) {
                        initParams.push(`${this.printNode(param.name, 0)} ??= new Dictionary<string, object>();`);
                    }
                    if (ts.isNumericLiteral(initializer)) {
                        initParams.push(`${this.printNode(param.name, 0)} ??= ${this.printNode(initializer, 0)};`);
                    }
                    if (ts.isStringLiteral(initializer)) {
                        initParams.push(`${this.printNode(param.name, 0)} ??= ${this.printNode(initializer, 0)};`);
                    }
                    if ((ts as any).isBooleanLiteral(initializer)) {
                        initParams.push(`${this.printNode(param.name, 0)} ??= ${this.printNode(initializer, 0)};`);
                    }
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
            return blockOpen + firstStatement + remainingString + blockClose;
        }

        return super.printFunctionBody(node, identation);
    }

    printInstanceOfExpression(node, identation) {
        const left = node.left.escapedText;
        const right = node.right.escapedText;
        return this.getIden(identation) + `${left} is ${right}`;
    }

    printAsExpression(node, identation) {
        const type = node.type;

        if (type.kind === ts.SyntaxKind.AnyKeyword) {
            return `((object)${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === ts.SyntaxKind.StringKeyword) {
            return `((string)${this.printNode(node.expression, identation)})`;
        }

        if (type.kind === ts.SyntaxKind.ArrayType) {
            if (type.elementType.kind === ts.SyntaxKind.AnyKeyword) {
                return `(IList<object>)(${this.printNode(node.expression, identation)})`;
            }
            if (type.elementType.kind === ts.SyntaxKind.StringKeyword) {
                // ts 'as string[]' is a compile-time-only assertion with no runtime
                // effect, and C# IList<T> is invariant in BOTH directions: a hard
                // (IList<string>) cast throws on the untyped core's List<object>
                // (ccxt cs ws test lane, https://github.com/ccxt/ccxt/actions/runs/31173663316)
                // while a hard (IList<object>) cast throws on genuinely typed
                // List<string> values (starknet typedData via the paradex broker-id
                // leg, https://github.com/ccxt/ccxt/actions/runs/31322911365). The
                // honest emission is the bare expression, like the fallthrough below.
                return this.printNode(node.expression, identation);
            }
        }

        return this.printNode(node.expression, identation);
    }

    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        const initializer = node.initializer;

        let type = this.printParameterType(node);
        type = type ? type : "";

        if (defaultValue) {
            if (initializer) {
                const customDefaultValue = this.printCustomDefaultValueIfNeeded(initializer);
                const defaultValue = customDefaultValue ? customDefaultValue : this.printNode(initializer, 0);
                type = (defaultValue === "null" && type !== "object") ? type + "? ": type + " ";
                return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + defaultValue;
            }
            return type + " " + name;
        }
        return name;
    }

    printArrayLiteralExpression(node) {

        let arrayOpen = this.ARRAY_OPENING_TOKEN;
        const elems = node.elements;

        const elements = node.elements.map((e) => {
            return this.printNode(e);
        }).join(", ");

        // take into consideration list of promises
        if (elems.length > 0) {
            const first = elems[0];
            if (first.kind === ts.SyntaxKind.CallExpression) {
                // const type = this.getChecker().getTypeAtLocation(first);
                let type = this.getFunctionType(first);
                // const parsedType = this.getTypeFromRawType(type);
                // parsedType === "Task" ||
                // to do check this later
                if (type === undefined || elements.indexOf(this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN) > -1) {
                    // if (type === undefined) {
                    arrayOpen = "new List<object> {";
                    // }
                    //  else {
                    //     arrayOpen = "new List<Task<object>> {";
                    // }
                } else {
                    type = 'object';
                    // check this out later
                    // if (type === 'Task<List<object>>') {
                    //     type = 'Task<object>';
                    // }
                    // if (type === 'string'){
                    //     type = 'object';
                    // }
                    // type =
                    arrayOpen = `new List<${type}> {`;
                }
            }
        }

        return arrayOpen + elements + this.ARRAY_CLOSING_TOKEN;
    }

    // A method declared `: boolean` / `: boolean | undefined` (or an alias of either) returns a
    // C# `bool` / `bool?` instead of `object`. Only non-async methods with an explicit annotation
    // qualify: `undefined`/`null` union members make the result nullable, any other member (or an
    // inferred type) keeps the upstream `object`. The nullable spelling is what keeps a missing
    // key a missing key — plain `bool` would turn it into `false`.
    csharpBooleanReturnType(node): string | undefined {
        if (node?.kind !== ts.SyntaxKind.MethodDeclaration || this.isAsyncFunction(node)) {
            return undefined;
        }
        if (this.csharpBooleanReturnTypes.has(node)) {
            return this.csharpBooleanReturnTypes.get(node);
        }
        let result: string | undefined = undefined;
        if (node.type) {
            const type = this.getChecker().getTypeFromTypeNode(node.type);
            const members = type.isUnion() ? type.types : [ type ];
            let nullable = false;
            let sawBoolean = false;
            let sawOther = false;
            for (const member of members) {
                if (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) {
                    nullable = true;
                } else if (member.flags & ts.TypeFlags.BooleanLike) {
                    sawBoolean = true;
                } else {
                    sawOther = true;
                }
            }
            if (sawBoolean && !sawOther) {
                result = nullable ? this.BOOLEAN_KEYWORD + '?' : this.BOOLEAN_KEYWORD;
            }
        } else {
            // an un-annotated override inherits the parent's printed return type
            // (printMethodDefinition), so its returns need the same unboxing
            result = this.csharpBooleanReturnType(this.getMethodOverride(node));
        }
        this.csharpBooleanReturnTypes.set(node, result);
        return result;
    }

    printFunctionType(node) {
        const booleanType = this.csharpBooleanReturnType(node);
        if (booleanType !== undefined) {
            return booleanType;
        }
        return super.printFunctionType(node);
    }

    // `return x;` inside a bool/bool? method: the printed expression is still the `object`
    // box the rest of the printer produces, so unbox it through `object`. The nullable
    // spelling `(bool?)((object)(x))` accepts null; the non-nullable one needs the
    // null-forgiving `!` on the box (CS8605 under TreatWarningsAsErrors otherwise) — which is
    // exactly the runtime NullReferenceException a `: boolean` method returning null deserves
    printReturnStatement(node, identation) {
        // nearest function-like: a `return` inside an arrow/function expression belongs to
        // that callback, never to the enclosing bool method
        const booleanType = this.csharpBooleanReturnType(ts.findAncestor(node.parent, ts.isFunctionLike));
        if (booleanType === undefined || !node.expression) {
            return super.printReturnStatement(node, identation);
        }
        const leadingComment = this.printLeadingComments(node, identation);
        let trailingComment = this.printTraillingComment(node, identation);
        trailingComment = trailingComment ? " " + trailingComment : trailingComment;
        const value = this.printNode(node.expression, identation).trim();
        const forgiving = booleanType.endsWith('?') ? '' : '!';
        return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + ` ((${booleanType})((object)(${value}))${forgiving})` + this.LINE_TERMINATOR + trailingComment;
    }

    printMethodDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.transformMethodNameIfNeeded(name);

        let returnType = this.printFunctionType(node);

        let modifiers = this.printModifiers(node);
        const defaultAccess = this.METHOD_DEFAULT_ACCESS ? this.METHOD_DEFAULT_ACCESS + " ": "";
        modifiers = modifiers ? modifiers + " " : defaultAccess; // tmp check this

        modifiers = modifiers.indexOf("public") === -1 && modifiers.indexOf("private") === -1 && modifiers.indexOf("protected") === -1 ? defaultAccess + modifiers : modifiers;

        let parsedArgs = undefined;
        // c# only move this elsewhere (csharp transpiler)
        const methodOverride = this.getMethodOverride(node) as any;
        const isOverride = methodOverride !== undefined;
        modifiers = isOverride ? modifiers + "override " : modifiers + "virtual ";

        // infer parent return type
        if (isOverride && (returnType === "object" || returnType === "Task<object>")) {
            returnType = this.printFunctionType(methodOverride);
        }

        // ts does not infer parameters types of overriden methods :x , so we need some
        // heuristic here to infer the types
        if (isOverride && node.parameters.length > 0) {
            const first = node.parameters[0];
            const firstType = this.getType(first);

            if (firstType === undefined) {
                // use the override version, check this out later
                // parsedArgs = this.printMethodParameters(methodOverride);
                const currentArgs = node.parameters;
                const parentArgs = methodOverride.parameters;
                parsedArgs = "";
                parentArgs.forEach((param, index) => {
                    const originalName = this.printNode(currentArgs[index].name, 0);
                    const parsedArg = this.printParameteCustomName(param, originalName);
                    parsedArgs+= parsedArg;
                    if (index < parentArgs.length - 1) {
                        parsedArgs+= ", ";
                    }
                });
            }
        }

        parsedArgs = parsedArgs ? parsedArgs : this.printMethodParameters(node);

        returnType = returnType ? returnType + " " : returnType;

        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
        const methodDef = this.getIden(identation) + modifiers + returnType + methodToken + name
            + "(" + parsedArgs + ")";

        return this.printNodeCommentsIfAny(node, identation, methodDef);
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
        return `((${parsedArg} is IList<object>) || (${parsedArg}.GetType().IsGenericType && ${parsedArg}.GetType().GetGenericTypeDefinition().IsAssignableFrom(typeof(List<>))))`;
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        return `new List<object>(((IDictionary<string,object>)${parsedArg}).Keys)`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        return `new List<object>(((IDictionary<string,object>)${parsedArg}).Values)`;
    }

    printJsonParseCall(node, identation, parsedArg = undefined) {
        return `parseJson(${parsedArg})`;
    }

    printJsonStringifyCall(node, identation, parsedArg = undefined) {
        return `json(${parsedArg})`; // make this customizable
    }

    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return `promiseAll(${parsedArg})`;
    }

    printMathFloorCall(node, identation, parsedArg = undefined) {
        return `(Math.Floor(Double.Parse((${parsedArg}).ToString())))`;
    }

    printMathRoundCall(node, identation, parsedArg = undefined) {
        return `Math.Round(Convert.ToDouble(${parsedArg}))`;
    }

    printMathCeilCall(node, identation, parsedArg = undefined) {
        return `Math.Ceiling(Convert.ToDouble(${parsedArg}))`;
    }

    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any) {
        return `((${parsedArg} is int) || (${parsedArg} is long) || (${parsedArg} is Int32) || (${parsedArg} is Int64))`;
    }

    printArrayPushCall(node, identation, name = undefined, parsedArg = undefined) {
        return  `((IList<object>)${name}).Add(${parsedArg})`;
    }

    printIncludesCall(node, identation, name = undefined, parsedArg = undefined) {
        return `${name}.Contains(${parsedArg})`;
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
    }

    printSearchCall(node, identation, name = undefined, parsedArg = undefined) {
        return `((string)${name}).IndexOf(${parsedArg})`;
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `((string)${name}).StartsWith(((string)${parsedArg}))`;
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `((string)${name}).EndsWith(((string)${parsedArg}))`;
    }

    printTrimCall(node, identation, name = undefined) {
        return `((string)${name}).Trim()`;
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        return `String.Join(${parsedArg}, ((IList<object>)${name}).ToArray())`;
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        return `((string)${name}).Split(new [] {((string)${parsedArg})}, StringSplitOptions.None).ToList<object>()`;
    }

    printConcatCall(node, identation, name = undefined, parsedArg = undefined) {
        return `concat(${name}, ${parsedArg})`;
    }

    printToFixedCall(node, identation, name = undefined, parsedArg = undefined) {
        return `toFixed(${name}, ${parsedArg})`;
    }

    printToStringCall(node, identation, name = undefined) {
        return `((object)${name}).ToString()`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        return `((string)${name}).ToUpper()`;
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        return `((string)${name}).ToLower()`;
    }

    printShiftCall(node, identation, name = undefined) {
        return `((IList<object>)${name}).First()`;
    }

    printReverseCall(node, identation, name = undefined) {
        return `${name} = (${name} as IList<object>).Reverse().ToList()`;
    }

    printPopCall(node, identation, name = undefined) {
        return `((IList<object>)${name}).Last()`;
    }

    printAssertCall(node, identation, parsedArgs) {
        return `assert(${parsedArgs})`;
    }

    printSliceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        if (parsedArg2 === undefined){
            // return `((string)${name}).Substring((int)${parsedArg})`;
            parsedArg2 = 'null';
        }
        // return `((string)${name})[((int)${parsedArg})..((int)${parsedArg2})]`;
        return `slice(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `((string)${name}).Replace((string)${parsedArg}, (string)${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `((string)${name}).Replace((string)${parsedArg}, (string)${parsedArg2})`;
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return `(${name} as String).PadRight(Convert.ToInt32(${parsedArg}), Convert.ToChar(${parsedArg2}))`;
    }

    printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
        return `(${name} as String).PadLeft(Convert.ToInt32(${parsedArg}), Convert.ToChar(${parsedArg2}))`;
    }

    printDateNowCall(node, identation) {
        return "(new DateTimeOffset(DateTime.UtcNow)).ToUnixTimeMilliseconds()";
    }

    printLengthProperty(node, identation, name = undefined) {
        const leftSide = this.printNode(node.expression, 0);
        const type = (this.getChecker() as TypeChecker).getTypeAtLocation(node.expression); // eslint-disable-line
        this.warnIfAnyType(node, type.flags, leftSide, "length");
        return this.isStringType(type.flags) ? `((string)${leftSide}).Length` : (this.csharpNativeLengthExpression(node.expression) ?? `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`);
    }

    printPostFixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        if (operand.kind === ts.SyntaxKind.NumericLiteral) {
            return super.printPostFixUnaryExpression(node, identation);
        }
        const leftSide = this.printNode(operand, 0);
        const op = this.PostFixOperators[operator]; // todo: handle --
        if (op === '--') {
            return `postFixDecrement(ref ${leftSide})`;
        }
        return `postFixIncrement(ref ${leftSide})`;
    }

    printPrefixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        if (operand.kind === ts.SyntaxKind.NumericLiteral) {
            return super.printPrefixUnaryExpression(node, identation);
        }
        if (operator === ts.SyntaxKind.ExclamationToken) {
            // not branch check falsy/turthy values if needed;
            return  this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
        }
        const leftSide = this.printNode(operand, 0);
        if (operator === ts.SyntaxKind.PlusToken) {
            return `prefixUnaryPlus(ref ${leftSide})`;
        } else {
            return `prefixUnaryNeg(ref ${leftSide})`;
        }
    }

    // `isTrue(x)` is the identity function on a C# bool (`isTrue` returns a bool unchanged),
    // so the wrapper is only needed for values the printer leaves boxed as `object`. Every
    // shape below is rendered as a C# bool by the printer itself; anything else keeps the helper.
    csharpConditionPrintsBool(node): boolean {
        switch (node?.kind) {
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
            return true; // `true` / `false`
        case ts.SyntaxKind.ParenthesizedExpression:
            return this.csharpConditionPrintsBool(node.expression);
        case ts.SyntaxKind.PrefixUnaryExpression:
            // `!x` prints `!isTrue(x)`, and printCondition always returns a bool
            return node.operator === ts.SyntaxKind.ExclamationToken;
        case ts.SyntaxKind.BinaryExpression:
            return this.csharpBinaryExpressionPrintsBool(node);
        case ts.SyntaxKind.Identifier:
            return this.csharpIdentifierPrintsBool(node);
        case ts.SyntaxKind.CallExpression:
            return this.csharpCallPrintsBool(node);
        }
        return false;
    }

    // isEqual / !isEqual / isGreaterThan / ... / inOp all have a C# `bool` signature, and a
    // `&&` / `||` prints both operands through printCondition, i.e. as bool themselves
    csharpBinaryExpressionPrintsBool(node): boolean {
        switch (node.operatorToken.kind) {
        case ts.SyntaxKind.EqualsEqualsToken:
        case ts.SyntaxKind.EqualsEqualsEqualsToken:
        case ts.SyntaxKind.ExclamationEqualsToken:
        case ts.SyntaxKind.ExclamationEqualsEqualsToken:
        case ts.SyntaxKind.GreaterThanToken:
        case ts.SyntaxKind.GreaterThanEqualsToken:
        case ts.SyntaxKind.LessThanToken:
        case ts.SyntaxKind.LessThanEqualsToken:
        case ts.SyntaxKind.InKeyword:
        case ts.SyntaxKind.BarBarToken:
        case ts.SyntaxKind.AmpersandAmpersandToken:
            return true;
        }
        return false;
    }

    // the checker sees a value that is exactly boolean; `boolean | undefined` is a
    // TypeFlags.Union here and is therefore rejected (`bool?` is no condition in C#)
    csharpIsCheckedBoolean(node): boolean {
        const type = this.getChecker().getTypeAtLocation(node);
        return ((type?.flags ?? 0) & ts.TypeFlags.BooleanLike) !== 0;
    }

    // `bool name = ...` is only declared when getCSharpLocalType resolved that exact
    // declaration to `bool`, so ask the same function: the condition and the declaration
    // cannot disagree. Parameters, members and demoted locals return `object` there.
    csharpIdentifierPrintsBool(node): boolean {
        if (!this.csharpIsCheckedBoolean(node)) {
            return false;
        }
        const declaration = this.getChecker().getSymbolAtLocation(node)?.valueDeclaration;
        if (declaration === undefined || !ts.isVariableDeclaration(declaration) || declaration.name?.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        if (!this.csharpLocalTypes.has(declaration)) {
            this.csharpLocalTypes.set(declaration, this.getCSharpLocalType(declaration));
        }
        return this.csharpLocalTypes.get(declaration) === 'bool';
    }

    // calls the printer gives a concrete bool signature (inArray, valueIsDefined, startsWith,
    // Array.isArray, ...); safeBool and friends are `bool?` / `object` and keep the wrapper
    csharpCallPrintsBool(node): boolean {
        return this.csharpIsCheckedBoolean(node) && (this.csharpCallReturnType(node) === 'bool');
    }

    // same emission as the base implementation except for the bare-bool branch: the node is
    // printed once and only wrapped in isTrue(...) when the printer did not already render a bool
    printCondition(node, identation) {
        if (this.supportsFalsyOrTruthyValues) {
            return this.printNode(node, identation);
        }
        // can be called from ifs or conditional expressions or binary expressions so might contain the ! operator
        if (node?.kind === ts.SyntaxKind.PrefixUnaryExpression && node.operator === ts.SyntaxKind.ExclamationToken) {
            return this.printPrefixUnaryExpression(node, identation); // avoid infinite recursion
        }
        const printed = this.printNode(node, 0);
        if (this.csharpConditionPrintsBool(node)) {
            return `${this.getIden(identation)}${this.csharpConditionParensIfNeeded(node, printed)}`;
        }
        return `${this.getIden(identation)}${this.FALSY_WRAPPER_OPEN}${printed}${this.FALSY_WRAPPER_CLOSE}`;
    }

    // dropping the wrapper exposes the `&&` / `||` of the node, so the bare text needs its own
    // parentheses where C# binds tighter than the JS it replaces: under `!` (which binds tighter
    // than both), and a `||` that becomes an operand of a `&&` (`(a || b) && c` must not flatten
    // to `a || b && c`). Source parentheses, when present, already come out in `printed`.
    csharpConditionParensIfNeeded(node, printed: string): string {
        if (node?.kind !== ts.SyntaxKind.BinaryExpression) {
            return printed;
        }
        const op = node.operatorToken.kind;
        if (op !== ts.SyntaxKind.BarBarToken && op !== ts.SyntaxKind.AmpersandAmpersandToken) {
            return printed;
        }
        const parent = node.parent;
        const underNot = parent?.kind === ts.SyntaxKind.PrefixUnaryExpression && parent.operator === ts.SyntaxKind.ExclamationToken;
        const underAnd = op === ts.SyntaxKind.BarBarToken && parent?.kind === ts.SyntaxKind.BinaryExpression
            && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
        return (underNot || underAnd) ? `(${printed})` : printed;
    }

    printConditionalExpression(node, identation) {
        const condition = this.printCondition(node.condition, 0);
        const whenTrue = this.printNode(node.whenTrue, 0);
        const whenFalse = this.printNode(node.whenFalse, 0);

        return `((bool) ${condition})` + " ? " + whenTrue + " : " + whenFalse;
    }

    printDeleteExpression(node, identation) {
        const object = this.printNode (node.expression.expression, 0);
        const key = this.printNode (node.expression.argumentExpression, 0);
        return `((IDictionary<string,object>)${object}).Remove((string)${key})`;
    }

    printNewExpression(node, identation) {
        let expression = node.expression?.escapedText;
        expression = expression ? expression : this.printNode(node.expression);
        // JS's built-in `Error` maps to C#'s `Exception` (C# has no `Error` type in the BCL)
        if (expression === 'Error') {
            expression = 'Exception';
        }
        const args = node.arguments.map(n => this.printNode(n, identation)).join(", ");
        const newToken = this.NEW_TOKEN ? this.NEW_TOKEN + " " : "";
        return newToken + expression + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
    }

    printThrowStatement(node, identation) {
        // const expression = this.printNode(node.expression, 0);
        // return this.getIden(node) + this.THROW_TOKEN + " " + expression + this.LINE_TERMINATOR;
        if (node.expression.kind === ts.SyntaxKind.Identifier) {
            return this.getIden(identation) + this.THROW_TOKEN + ' ' + this.printNode(node.expression, 0) + this.LINE_TERMINATOR;
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
                // JS's built-in `Error` maps to C#'s `Exception` (C# has no `Error` type in the BCL)
                const idName = id.escapedText === 'Error' ? 'Exception' : id.escapedText;
                const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
                if (symbol) {
                    const declarations = this.getChecker().getDeclaredTypeOfSymbol(symbol).symbol?.declarations ?? [];
                    const isClassDeclaration = declarations.find(l => l.kind === ts.SyntaxKind.InterfaceDeclaration ||  l.kind === ts.SyntaxKind.ClassDeclaration);
                    if (isClassDeclaration){
                        return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${idName} ((string)${parsedArg}) ${this.LINE_TERMINATOR}`;
                    } else {
                        return this.getIden(identation) + `throwDynamicException(${idName}, ${parsedArg});return null;`;
                    }
                }
                return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${idName === id.escapedText ? newExpression : idName} (${parsedArg}) ${this.LINE_TERMINATOR}`;
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

    csModifiers = {

    };

    printPropertyAccessModifiers(node) {
        let modifiers = this.printModifiers(node);
        if (modifiers === '') {
            modifiers = this.defaultPropertyAccess;
        }
        // add type
        let typeText = 'object';
        if (node.type) {
            typeText = this.getType(node);
            if (!typeText) {
                if (node.type.kind === ts.SyntaxKind.AnyKeyword) {
                    typeText = this.OBJECT_KEYWORD + ' ';
                }
            }
        }
        return modifiers + ' ' + typeText + ' ';
    }

    // printLeadingComments(node, identation) {
    //     const fullText = this.getSrc().getFullText();
    //     const commentsRangeList = ts.getLeadingCommentRanges(fullText, node.pos);
    //     const commentsRange = commentsRangeList ? commentsRangeList : undefined;
    //     let res = "";
    //     if (commentsRange) {
    //         for (const commentRange of commentsRange) {
    //             const commentText = fullText.slice(commentRange.pos, commentRange.end);
    //             if (commentText !== undefined) {
    //                 const formatted = commentText
    //                     .split("\n")
    //                     .map(line=>line.trim())
    //                     .map(line => !(line.trim().startsWith("*")) ? this.getIden(identation) + line : this.getIden(identation) + " " + line) .join("\n");
    //                 // res+= this.transformLeadingComment(formatted) + "\n";
    //             }
    //         }
    //     }
    //     return res;
    // }
}

// if (this.requiresCallExpressionCast) {
//     const parsedTypes = this.getTypesFromCallExpressionParameters(node);
//     const tmpArgs = [];
//     args.forEach((arg, index) => {
//         const parsedType = parsedTypes[index];
//         const cast = parsedType ? `(${parsedType})` : '';
//         tmpArgs.push(cast + this.printNode(arg, identation).trim());
//     });
//     parsedArgs = tmpArgs.join(",");
// } else {
//     parsedArgs = args.map((a) => {
//         return  this.printNode(a, identation).trim();
//     }).join(", ");
// }

// getTypesFromCallExpressionParameters(node) {
//     const resolvedParams = this.getChecker().getResolvedSignature(node).parameters;
//     const parsedTypes = [];
//     resolvedParams.forEach((p) => {
//         const decl = p.declarations[0];
//         const type = this.getChecker().getTypeAtLocation(decl);
//         const parsedType = this.getTypeFromRawType(type);
//         parsedTypes.push(parsedType);
//     });

//     return parsedTypes;
// }


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
