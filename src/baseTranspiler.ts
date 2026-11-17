import { SyntaxKind, getLeadingCommentRanges, getTrailingCommentRanges, type BinaryExpression, type Node, type PropertyAccessExpression, type SourceFile } from "typescript/unstable/ast";
import { isArrayLiteralExpression, isArrowFunction, isAwaitExpression, isBinaryExpression, isBooleanLiteral, isCallExpression, isClassDeclaration, isConditionalExpression, isExportAssignment } from "typescript/unstable/ast/is";
import { isExportDeclaration, isFunctionDeclaration, isFunctionExpression, isImportDeclaration, isMethodDeclaration, isNumericLiteral, isObjectLiteralExpression, isSourceFile, isStringLiteralLikeNode, isVariableStatement } from "typescript/unstable/ast/is";
import { createAwaitExpression, createParenthesizedExpression, createReturnStatement } from "typescript/unstable/ast/factory";
import { SignatureKind, TypeFlags, type Checker, type Program } from "typescript/unstable/sync";
import { findAncestor, getAllSuperTypeNodes, isFunctionLike } from "./tsUtils.js";
import { IFileImport, IFileExport, TranspilationError, IMethodType, IParameterType, ITranspileContext } from './types.js';
import { unCamelCase } from "./utils.js";
import { Logger } from "./logger.js";

const NO_CONTEXT_ERROR = "No transpilation context set: the typescript program must be created before printing nodes.";

// builtin call hooks dispatched by printCallExpression: `Receiver.method(x)` by its full text,
// `x.method()` / `x.method(a[, b])` by the method name
const STATIC_CALL_HOOKS = new Map(Object.entries({
    "JSON.parse": "printJsonParseCall", "JSON.stringify": "printJsonStringifyCall", "Array.isArray": "printArrayIsArrayCall",
    "Object.keys": "printObjectKeysCall", "Object.values": "printObjectValuesCall", "Promise.all": "printPromiseAllCall",
    "Math.round": "printMathRoundCall", "Math.floor": "printMathFloorCall", "Math.ceil": "printMathCeilCall", "Number.isInteger": "printNumberIsIntegerCall",
}));
const NO_ARG_METHOD_HOOKS = new Map(Object.entries({
    toString: "printToStringCall", toUpperCase: "printToUpperCaseCall", toLowerCase: "printToLowerCaseCall",
    shift: "printShiftCall", pop: "printPopCall", reverse: "printReverseCall", trim: "printTrimCall",
}));
const ARG_METHOD_HOOKS = new Map(Object.entries({
    push: "printArrayPushCall", includes: "printIncludesCall", indexOf: "printIndexOfCall", join: "printJoinCall", split: "printSplitCall",
    toFixed: "printToFixedCall", concat: "printConcatCall", search: "printSearchCall", endsWith: "printEndsWithCall",
    startsWith: "printStartsWithCall", padEnd: "printPadEndCall", padStart: "printPadStartCall",
}));
const TWO_ARG_METHOD_HOOKS = new Map(Object.entries({ slice: "printSliceCall", replace: "printReplaceCall", replaceAll: "printReplaceAllCall" }));

// printNode dispatch: node kind -> printer method called as (node, identation)
const PRINT_BY_KIND = new Map<SyntaxKind, string>([
    [SyntaxKind.ExpressionStatement, "printExpressionStatement"], [SyntaxKind.Block, "printBlock"], [SyntaxKind.FunctionDeclaration, "printFunctionDeclaration"],
    [SyntaxKind.FunctionExpression, "printFunctionDeclaration"], [SyntaxKind.ArrowFunction, "printFunctionDeclaration"], [SyntaxKind.ClassDeclaration, "printClass"],
    [SyntaxKind.VariableStatement, "printVariableStatement"], [SyntaxKind.MethodDeclaration, "printMethodDeclaration"],
    [SyntaxKind.PropertyAccessExpression, "printPropertyAccessExpression"], [SyntaxKind.ArrayLiteralExpression, "printArrayLiteralExpression"],
    [SyntaxKind.CallExpression, "printCallExpression"], [SyntaxKind.WhileStatement, "printWhileStatement"], [SyntaxKind.BinaryExpression, "printBinaryExpression"],
    [SyntaxKind.BreakStatement, "printBreakStatement"], [SyntaxKind.ForStatement, "printForStatement"],
    [SyntaxKind.PostfixUnaryExpression, "printPostFixUnaryExpression"], [SyntaxKind.VariableDeclarationList, "printVariableDeclarationList"],
    [SyntaxKind.ObjectLiteralExpression, "printObjectLiteralExpression"], [SyntaxKind.PropertyAssignment, "printPropertyAssignment"],
    [SyntaxKind.ElementAccessExpression, "printElementAccessExpression"], [SyntaxKind.IfStatement, "printIfStatement"],
    [SyntaxKind.ParenthesizedExpression, "printParenthesizedExpression"], [SyntaxKind.ThisKeyword, "printThisKeyword"], [SyntaxKind.TryStatement, "printTryStatement"],
    [SyntaxKind.PrefixUnaryExpression, "printPrefixUnaryExpression"], [SyntaxKind.ThrowStatement, "printThrowStatement"],
    [SyntaxKind.NewExpression, "printNewExpression"], [SyntaxKind.AwaitExpression, "printAwaitExpression"],
    [SyntaxKind.ConditionalExpression, "printConditionalExpression"], [SyntaxKind.AsExpression, "printAsExpression"],
    [SyntaxKind.ArrayBindingPattern, "printArrayBindingPattern"], [SyntaxKind.Constructor, "printConstructorDeclaration"],
    [SyntaxKind.PropertyDeclaration, "printPropertyDeclaration"], [SyntaxKind.SpreadElement, "printSpreadElement"], [SyntaxKind.NullKeyword, "printNullKeyword"],
    [SyntaxKind.ContinueStatement, "printContinueStatement"], [SyntaxKind.DeleteExpression, "printDeleteExpression"],
]);
// node kind -> printer method called as (node)
const PRINT_NODE_ONLY_BY_KIND = new Map<SyntaxKind, string>([
    [SyntaxKind.StringLiteral, "printStringLiteral"], [SyntaxKind.NumericLiteral, "printNumericLiteral"], [SyntaxKind.Identifier, "printIdentifier"],
    [SyntaxKind.TrueKeyword, "printBooleanLiteral"], [SyntaxKind.FalseKeyword, "printBooleanLiteral"], [SyntaxKind.Parameter, "printParameter"],
]);

class BaseTranspiler {

    NUM_LINES_BETWEEN_CLASS_MEMBERS = 1;
    LINES_BETWEEN_FILE_MEMBERS = 0;
    NUM_LINES_END_FILE = 1;
    SPACE_DEFAULT_PARAM = " ";
    BLOCK_OPENING_TOKEN = '{';
    BLOCK_CLOSING_TOKEN = '}';
    SPACE_BEFORE_BLOCK_OPENING = ' ';
    CONDITION_OPENING = '(';
    CONDITION_CLOSE = ')';
    DEFAULT_IDENTATION = "    ";
    STRING_QUOTE_TOKEN = '"';
    UNDEFINED_TOKEN = "null";
    NULL_TOKEN = "null";
    IF_TOKEN = "if";
    ELSE_TOKEN = "else";
    ELSEIF_TOKEN = "else if";
    THIS_TOKEN = "this";
    SLASH_TOKEN = "/";
    ASTERISK_TOKEN = "*";
    PLUS_TOKEN = "+";
    MINUS_TOKEN = "-";
    EQUALS_TOKEN = "=";
    EQUALS_EQUALS_TOKEN = "==";
    EXCLAMATION_EQUALS_TOKEN = "!=";
    EXCLAMATION_EQUALS_EQUALS_TOKEN = "!=";
    EQUALS_EQUALS_EQUALS_TOKEN = "==";
    AMPERSTAND_APERSAND_TOKEN = "&&";
    PLUS_EQUALS = "+=";
    BAR_BAR_TOKEN = "||";
    PERCENT_TOKEN = "%";
    RETURN_TOKEN = "return";
    OBJECT_OPENING = "{";
    OBJECT_CLOSING = "}";
    LEFT_PARENTHESIS = "(";
    RIGHT_PARENTHESIS = ")";
    ARRAY_OPENING_TOKEN = "[";
    ARRAY_CLOSING_TOKEN = "]";
    TRUE_KEYWORD = "true";
    FALSE_KEYWORD = "false";
    THROW_TOKEN = "throw";
    AWAIT_TOKEN = "await";
    STATIC_TOKEN = "static";
    CONTINUE_TOKEN = "continue";
    EXTENDS_TOKEN = ":";
    NOT_TOKEN = "!";
    SUPER_TOKEN = "super";
    PROPERTY_ACCESS_TOKEN = ".";
    TRY_TOKEN = "try";
    CATCH_TOKEN = "catch";
    CATCH_DECLARATION = "Exception";
    BREAK_TOKEN = "break";
    IN_TOKEN = "in";
    LESS_THAN_TOKEN = "<";
    GREATER_THAN_TOKEN = ">";
    GREATER_THAN_EQUALS_TOKEN = ">=";
    LESS_THAN_EQUALS_TOKEN = "<=";
    PLUS_PLUS_TOKEN = "++";
    MINUS_MINUS_TOKEN = "--";
    CONSTRUCTOR_TOKEN = "def __init__";
    SUPER_CALL_TOKEN = "super().__init__";
    WHILE_TOKEN = "while";
    FOR_TOKEN = "for";
    VAR_TOKEN = "";

    METHOD_DEFAULT_ACCESS = "public";

    PROPERTY_ASSIGNMENT_TOKEN = ":";
    PROPERTY_ASSIGNMENT_OPEN = "";
    PROPERTY_ASSIGNMENT_CLOSE = "";

    LINE_TERMINATOR = ";";

    FUNCTION_TOKEN = "function";
    METHOD_TOKEN = "function";
    ASYNC_TOKEN = "async";
    PROMISE_TYPE_KEYWORD = "Task";

    NEW_TOKEN = "new";

    STRING_LITERAL_KEYWORD = "StringLiteral";
    STRING_KEYWORD = "string";
    NUMBER_KEYWORD = "float";

    PUBLIC_KEYWORD = "public";
    PRIVATE_KEYWORD = "private";
    VOID_KEYWORD = "void";
    BOOLEAN_KEYWORD = "bool";

    ARRAY_KEYWORD = "List<object>";
    OBJECT_KEYWORD = "Dictionary<string, object>";
    INTEGER_KEYWORD = "int";
    DEFAULT_RETURN_TYPE = "object";
    DEFAULT_PARAMETER_TYPE = "object";
    DEFAULT_TYPE = "object";

    FALSY_WRAPPER_OPEN = "";
    FALSY_WRAPPER_CLOSE = "";
    ELEMENT_ACCESS_WRAPPER_OPEN = "";
    ELEMENT_ACCESS_WRAPPER_CLOSE = "";
    COMPARISON_WRAPPER_OPEN = "";
    COMPARISON_WRAPPER_CLOSE = "";
    UKNOWN_PROP_WRAPPER_OPEN = "";
    UNKOWN_PROP_WRAPPER_CLOSE = "";
    UKNOWN_PROP_ASYNC_WRAPPER_OPEN = "";
    UNKOWN_PROP_ASYNC_WRAPPER_CLOSE = "";
    EQUALS_EQUALS_WRAPPER_OPEN = "";
    EQUALS_EQUALS_WRAPPER_CLOSE = "";
    DIFFERENT_WRAPPER_OPEN = "";
    DIFFERENT_WRAPPER_CLOSE = "";
    GREATER_THAN_WRAPPER_OPEN = "";
    GREATER_THAN_WRAPPER_CLOSE = "";
    LESS_THAN_WRAPPER_OPEN = "";
    LESS_THAN_WRAPPER_CLOSE = "";
    GREATER_THAN_EQUALS_WRAPPER_OPEN = "";
    GREATER_THAN_EQUALS_WRAPPER_CLOSE = "";
    LESS_THAN_EQUALS_WRAPPER_OPEN = "";
    LESS_THAN_EQUALS_WRAPPER_CLOSE = "";
    DIVIDE_WRAPPER_OPEN = "";
    DIVIDE_WRAPPER_CLOSE = "";
    PLUS_WRAPPER_OPEN = "";
    PLUS_WRAPPER_CLOSE = "";
    MINUS_WRAPPER_OPEN = "";
    MINUS_WRAPPER_CLOSE = "";
    MOD_WRAPPER_OPEN = "";
    MOD_WRAPPER_CLOSE = "";
    ARRAY_LENGTH_WRAPPER_OPEN = "";
    ARRAY_LENGTH_WRAPPER_CLOSE = "";
    MULTIPLY_WRAPPER_OPEN = "";
    MULTIPLY_WRAPPER_CLOSE = "";
    INDEXOF_WRAPPER_OPEN = "";
    INDEXOF_WRAPPER_CLOSE = "";
    DYNAMIC_CALL_OPEN = "";

    SPREAD_TOKEN = "...";

    INFER_VAR_TYPE = false;
    INFER_ARG_TYPE = false;

    SupportedKindNames = {};
    PostFixOperators = {};
    PrefixFixOperators = {};
    FunctionDefSupportedKindNames = {};

    LeftPropertyAccessReplacements = {};
    RightPropertyAccessReplacements = {};
    FullPropertyAccessReplacements = {};
    StringLiteralReplacements = {};

    CallExpressionReplacements = {};
    ReservedKeywordsReplacements = {};
    ReassignedVars = {};
    PropertyAccessRequiresParenthesisRemoval = [];
    VariableTypeReplacements = {};
    ArgTypeReplacements = {};

    FuncModifiers = {};
    defaultPropertyAccess = 'public';

    currentClassName = "";
    className = "undefined";

    uncamelcaseIdentifiers;
    asyncTranspiling;
    implicitAsyncTranspiling;
    requiresReturnType;
    requiresParameterType;
    supportsFalsyOrTruthyValues;
    requiresCallExpressionCast;
    removeVariableDeclarationForFunctionExpression;
    includeFunctionNameInFunctionExpressionDeclaration;
    id;
    // typescript state for the transpilation currently in flight. Set by the owning
    // Transpiler before it walks the AST, so nothing leaks through process globals.
    context: ITranspileContext | undefined;

    constructor(config) {
        Object.assign (this, (config['parser'] || {}));
        this.id = "base";
        this.uncamelcaseIdentifiers = false;
        this.requiresReturnType = false;
        this.requiresParameterType = false;
        this.supportsFalsyOrTruthyValues = true;
        this.requiresCallExpressionCast = false;
        this.removeVariableDeclarationForFunctionExpression = true;
        this.includeFunctionNameInFunctionExpressionDeclaration = true;
        this.initOperators();
    }

    setContext(context: ITranspileContext | undefined): void {
        this.context = context;
    }

    requireContext(): ITranspileContext {
        if (this.context === undefined) throw new Error(NO_CONTEXT_ERROR);
        return this.context;
    }

    getSrc(): SourceFile {
        return this.requireContext().src;
    }

    getChecker(): Checker {
        return this.requireContext().checker;
    }

    // true when some node under `scope` (excluding `scope` itself) satisfies `predicate`;
    // the walk stops at the first hit and does not descend below it
    hasNodeWhere(scope: Node | undefined, predicate: (n: any) => boolean): boolean {
        if (scope === undefined) {
            return false;
        }
        let found = false;
        const visit = (n: any) => {
            if (found) {
                return;
            }
            if (predicate(n)) {
                found = true;
                return;
            }
            n.forEachChild(visit);
        };
        scope.forEachChild(visit);
        return found;
    }

    // the checker when a transpilation context is set, undefined otherwise (an in-memory
    // program without one keeps every helper the checker would have proven away)
    checkerOrUndefined(): Checker | undefined {
        return this.context?.checker;
    }

    getProgram(): Program {
        return this.requireContext().program;
    }

    initOperators() {
        this.SupportedKindNames = {
            [SyntaxKind.StringLiteral]: this.STRING_LITERAL_KEYWORD,
            [SyntaxKind.StringKeyword]: this.STRING_KEYWORD,
            // [ts.SyntaxKind.NumberKeyword]: this.NUMBER_KEYWORD,
            [SyntaxKind.NumberKeyword]: this.DEFAULT_TYPE,
            [SyntaxKind.MinusMinusToken]: this.MINUS_MINUS_TOKEN,
            [SyntaxKind.MinusToken]: this.MINUS_TOKEN,
            [SyntaxKind.SlashToken]: this.SLASH_TOKEN,
            [SyntaxKind.AsteriskToken]: this.ASTERISK_TOKEN,
            [SyntaxKind.InKeyword]: this.IN_TOKEN,
            [SyntaxKind.PlusToken]: this.PLUS_TOKEN,
            [SyntaxKind.PercentToken]: this.PERCENT_TOKEN,
            [SyntaxKind.LessThanToken]: this.LESS_THAN_TOKEN,
            [SyntaxKind.LessThanEqualsToken]: this.LESS_THAN_EQUALS_TOKEN,
            [SyntaxKind.GreaterThanToken]: this.GREATER_THAN_TOKEN,
            [SyntaxKind.GreaterThanEqualsToken]: this.GREATER_THAN_EQUALS_TOKEN,
            [SyntaxKind.EqualsEqualsToken]: this.EQUALS_EQUALS_TOKEN,
            [SyntaxKind.EqualsEqualsEqualsToken]: this.EQUALS_EQUALS_EQUALS_TOKEN,
            [SyntaxKind.EqualsToken]: this.EQUALS_TOKEN,
            [SyntaxKind.PlusEqualsToken]: this.PLUS_EQUALS,
            [SyntaxKind.BarBarToken]: this.BAR_BAR_TOKEN,
            [SyntaxKind.AmpersandAmpersandToken]: this.AMPERSTAND_APERSAND_TOKEN,
            [SyntaxKind.ExclamationEqualsEqualsToken]: this.EXCLAMATION_EQUALS_EQUALS_TOKEN,
            [SyntaxKind.ExclamationEqualsToken]: this.EXCLAMATION_EQUALS_TOKEN,
            [SyntaxKind.AsyncKeyword]: this.ASYNC_TOKEN,
            [SyntaxKind.AwaitKeyword]: this.AWAIT_TOKEN,
            [SyntaxKind.StaticKeyword]: this.STATIC_TOKEN,
            [SyntaxKind.PublicKeyword]: this.PUBLIC_KEYWORD,
            [SyntaxKind.PrivateKeyword]: this.PRIVATE_KEYWORD,
            [SyntaxKind.VoidKeyword]: this.VOID_KEYWORD,
            [SyntaxKind.BooleanKeyword]: this.BOOLEAN_KEYWORD,
        };

        this.PostFixOperators = {
            [SyntaxKind.PlusPlusToken]: this.PLUS_PLUS_TOKEN,
            [SyntaxKind.MinusMinusToken]: this.MINUS_MINUS_TOKEN,
        };

        this.PrefixFixOperators = {
            [SyntaxKind.ExclamationToken]: this.NOT_TOKEN,
            [SyntaxKind.MinusToken]: this.MINUS_TOKEN,
        };

        this.FunctionDefSupportedKindNames = {
            [SyntaxKind.StringKeyword]: this.STRING_KEYWORD
        };

        this.FuncModifiers = {
            [SyntaxKind.AsyncKeyword]: this.ASYNC_TOKEN,
            [SyntaxKind.PublicKeyword]: this.PUBLIC_KEYWORD,
            [SyntaxKind.PrivateKeyword]: this.PRIVATE_KEYWORD,
            [SyntaxKind.StaticKeyword]: this.STATIC_TOKEN,
        };
    }

    capitalize(str: string) {
        return str[0].toUpperCase() + str.slice(1);
    }

    applyUserOverrides(config): void {
        for (const key of ['LeftPropertyAccessReplacements', 'RightPropertyAccessReplacements', 'FullPropertyAccessReplacements', 'CallExpressionReplacements', 'StringLiteralReplacements']) {
            this[key] = Object.assign ({}, this[key], config[key] ?? {});
        }
    }

    getLineAndCharacterOfNode(node): [number,number] {
        const { line, character } = this.getSrc().getLineAndCharacterOfPosition(node.getStart());
        return [line + 1,character];
    }

    isComment(line: string){
        line = line.trim();
        return line.startsWith("//") || line.startsWith("/*") || line.startsWith("*");
    }

    isStringType(flags: TypeFlags) {
        return flags === TypeFlags.String || flags === TypeFlags.StringLiteral;
    }

    isAnyType(flags: TypeFlags) {
        return flags === TypeFlags.Any;
    }

    warnIfAnyType(node, flags, variable, target) {
        if (this.isAnyType(flags)) {
            const [line, character] = this.getLineAndCharacterOfNode(node);
            Logger.warning(`[${this.id}] Line: ${line} char: ${character}: ${variable} has any type, ${target} might be incorrectly transpiled`);
        }
    }

    warn(node, target, message) {
        const [line, character] = this.getLineAndCharacterOfNode(node);
        Logger.warning(`[${this.id}] Line: ${line} char: ${character}: ${target} : ${message}`);
    }

    hasAsyncModifier(node) {
        return (node.modifiers ?? []).some(mod => mod.kind === SyntaxKind.AsyncKeyword);
    }

    isPromiseType(type) {
        return type !== undefined && this.getTypeFromRawType(type) === this.PROMISE_TYPE_KEYWORD;
    }

    isImplicitAsyncFunction(node) {
        // a function declared WITHOUT the `async` keyword that returns a Promise
        // directly, ie: `watchTicker (symbol: string): Promise<Ticker> { return this.watch (...); }`
        // (a common fast-path in JS for pure delegator/pass-through methods);
        // target languages without that distinction transpile it as if it were `async`
        if (!this.implicitAsyncTranspiling || !isFunctionLike(node) || this.hasAsyncModifier(node)) {
            return false;
        }
        const signature = this.getChecker().getSignatureFromDeclaration(node);
        return signature !== undefined && this.isPromiseType(this.getChecker().getReturnTypeOfSignature(signature));
    }

    isAsyncFunction(node) {
        return this.hasAsyncModifier(node) || this.isImplicitAsyncFunction(node);
    }

    // the method of the same name in the closest-to-root ancestor class that declares it
    getMethodOverride(node): Node {
        if (node === undefined || !isClassDeclaration(node.parent) || !node.parent.heritageClauses) {
            return undefined;
        }
        let method = undefined;
        let parentClass = getAllSuperTypeNodes(node.parent)[0];
        while (parentClass !== undefined) {
            const parentClassDecl = this.getChecker().getTypeAtLocation(parentClass)?.getSymbol()?.valueDeclaration?.resolve();
            if (parentClassDecl === undefined) {
                this.warn(node, "Parent class", "Parent class not found");
                return undefined;
            }
            for (const elem of (parentClassDecl as any).members ?? []) {
                if (isMethodDeclaration(elem) && node.name.text === elem.name.getText().trim()) {
                    method = elem;
                }
            }
            parentClass = getAllSuperTypeNodes(parentClassDecl)[0] ?? undefined;
        }
        return method;
    }

    getIden (num) {
        return this.DEFAULT_IDENTATION.repeat(parseInt(num));
    }

    getBlockOpen(identation){
        return this.SPACE_BEFORE_BLOCK_OPENING + this.BLOCK_OPENING_TOKEN + "\n";
    }

    getBlockClose(identation, chainBlock = false) {
        const close = "\n" + this.getIden(identation) + this.BLOCK_CLOSING_TOKEN;
        if (chainBlock) {
            return this.BLOCK_CLOSING_TOKEN ? close + this.SPACE_BEFORE_BLOCK_OPENING : close;
        }
        return this.BLOCK_CLOSING_TOKEN ? close : "";
    }

    startsWithUpperCase(str) {
        return str.charAt(0) === str.charAt(0).toUpperCase();
    }

    unCamelCaseIfNeeded(name: string): string {
        if (this.uncamelcaseIdentifiers && !this.startsWithUpperCase(name) ) { // avoid snake_case constant (MY_CONSTANT) or exception errors (BadRequestException)
            return unCamelCase(name) ?? name;
        }
        return name;
    }

    transformIdentifier(node, identifier) {
        return this.unCamelCaseIfNeeded(identifier);
    }

    transformCallExpressionName(name: string, nameNode = undefined) {
        return name;
    }

    transformPropertyAccessExpressionName(name: string, nameNode = undefined) {
        return name;
    }

    printIdentifier(node) {
        const idValue = this.ReservedKeywordsReplacements[node.text] || node.text;
        if (idValue === "undefined") {
            return this.UNDEFINED_TOKEN;
        }
        return this.transformIdentifier(node, idValue);
    }

    shouldRemoveParenthesisFromCallExpression(node) {
        if (node.expression.kind === SyntaxKind.PropertyAccessExpression) {
            return this.PropertyAccessRequiresParenthesisRemoval.includes(node.expression.name.text);
        }
        return false;
    }

    printInstanceOfExpression(node, identation) {
        return this.getIden(identation) + `${node.left.text} instanceof ${node.right.text}`;
    }

    getCustomOperatorIfAny(left, right, operator) {
        return undefined;
    }

    printCustomBinaryExpressionIfAny(node, identation) {
        return undefined; // stub to override
    }

    printBinaryExpression(node, identation) {
        const {left, right, operatorToken} = node;
        const customBinaryExp = this.printCustomBinaryExpressionIfAny(node, identation);
        if (customBinaryExp) {
            return customBinaryExp;
        }
        const kind = operatorToken.kind;
        if (kind == SyntaxKind.InstanceOfKeyword) {
            return this.printInstanceOfExpression(node, identation);
        }
        // c# wrapper
        if ((kind === SyntaxKind.EqualsEqualsToken || kind === SyntaxKind.EqualsEqualsEqualsToken) && this.COMPARISON_WRAPPER_OPEN) {
            return `${this.COMPARISON_WRAPPER_OPEN}${this.printNode(left, 0)}, ${this.printNode(right, identation)}${this.COMPARISON_WRAPPER_CLOSE}`;
        }
        let prefixes = "";
        let leftVar, rightVar;
        // || and && print their operands as conditions because of the falsy values
        if (kind === SyntaxKind.BarBarToken || kind === SyntaxKind.AmpersandAmpersandToken) {
            leftVar = this.printCondition(left, 0);
            rightVar = this.printCondition(right, identation);
        } else {
            leftVar = this.printNode(left, 0);
            prefixes = this.getBinaryExpressionPrefixes(node, identation) ?? "";
            rightVar = this.printNode(right, identation);
        }
        const operator = this.getCustomOperatorIfAny(left, right, operatorToken) || this.SupportedKindNames[kind];
        return prefixes + leftVar +" "+ operator + " " + rightVar.trim();
    }

    getBinaryExpressionPrefixes(node, identation) {
        return undefined;
    }

    transformPropertyAcessExpressionIfNeeded (node) {
        return undefined;
    }

    transformPropertyAcessRightIdentifierIfNeeded (name: string): string {
        return this.unCamelCaseIfNeeded(name);
    }

    getExceptionalAccessTokenIfAny(node) {
        return undefined; // stub to override
    }

    printLengthProperty(node, identation, name = undefined) {
        return undefined; // stub to override
    }

    printPropertyAccessExpression(node, identation) {
        const transformedProperty = this.transformPropertyAcessExpressionIfNeeded(node);
        if (transformedProperty) {
            return this.getIden(identation) + transformedProperty;
        }
        const leftText = node.expression.text;
        const rightText = node.name.text;
        if (rightText === "length") {
            return this.printLengthProperty(node, identation, leftText);
        }
        const rawExpression = node.getText().trim();
        // hasOwnProperty: a plain lookup would find builtins such as "toString" on the object
        const has = (table, key) => Object.prototype.hasOwnProperty.call(table, key);
        if (has(this.FullPropertyAccessReplacements, rawExpression)) {
            return this.FullPropertyAccessReplacements[rawExpression];
        }
        const leftSide = has(this.LeftPropertyAccessReplacements, leftText) ? this.LeftPropertyAccessReplacements[leftText] : this.printNode(node.expression, 0);
        const rightSide = has(this.RightPropertyAccessReplacements, rightText) ? this.RightPropertyAccessReplacements[rightText] : this.transformPropertyAcessRightIdentifierIfNeeded(rightText) ?? rightText;
        const accessToken = this.getExceptionalAccessTokenIfAny(node) ?? this.PROPERTY_ACCESS_TOKEN;
        return leftSide + accessToken + this.transformPropertyAccessExpressionName(rightSide, node.name);
    }

    printCustomDefaultValueIfNeeded(node) {
        return undefined;
    }

    printParameterDefaultValue(initializer) {
        return this.printCustomDefaultValueIfNeeded(initializer) || this.printNode(initializer, 0);
    }

    // useful for when we have to get the parent's method argument type
    printParameteCustomName(node, name, defaultValue = true) {
        const printedType = this.printParameterType(node);
        const type = printedType ? printedType + " " : "";
        if (!defaultValue) {
            return name;
        }
        if (node.initializer) {
            return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + this.printParameterDefaultValue(node.initializer);
        }
        return type + name;
    }

    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        let type = this.printParameterType(node);
        type = type ? type + " " : "";
        if (!defaultValue) {
            return name;
        }
        if (node.initializer) {
            const value = this.printParameterDefaultValue(node.initializer);
            if (type) {
                type = (value === "null" && type !== "object") ? type + "? ": type + " ";
            }
            return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + value;
        }
        return type === "" ? name : type + " " + name;
    }

    printModifiers(node) {
        let modifiers = node.modifiers ?? [];
        modifiers = modifiers.filter(mod => this.FuncModifiers[mod.kind]);

        if (!this.asyncTranspiling) {
            modifiers = modifiers.filter(mod => mod.kind !== SyntaxKind.AsyncKeyword);
        }
        let res = modifiers.map(modifier => this.FuncModifiers[modifier.kind]).join(" ");

        if (this.asyncTranspiling && this.ASYNC_TOKEN && this.isImplicitAsyncFunction(node)) {
            // non-async functions returning a Promise directly are transpiled
            // as if they had been declared `async`
            res = res ? res + " " + this.ASYNC_TOKEN : this.ASYNC_TOKEN;
        }

        return res;
    }

    transformLeadingComment(comment) {
        return comment; // to override
    }

    transformTrailingComment(comment) {
        return comment; // to override
    }

    // the source text of each comment in `getRanges(fullText, pos)`, in order
    commentTexts(getRanges, pos): string[] {
        const fullText = this.getSrc().getFullText();
        return (getRanges(fullText, pos) ?? []).map(range => fullText.slice(range.pos, range.end));
    }

    printLeadingComments(node, identation) {
        const iden = this.getIden(identation);
        return this.commentTexts(getLeadingCommentRanges, node.pos).map(commentText => {
            const formatted = commentText.split("\n").map(line => line.trim()).map(line => line.startsWith("*") ? iden + " " + line : iden + line).join("\n");
            return this.transformLeadingComment(formatted) + "\n";
        }).join("");
    }

    printTraillingComment(node, identation) {
        return this.commentTexts(getTrailingCommentRanges, node.end).map(commentText => " " + this.transformTrailingComment(commentText)).join("");
    }

    printNodeCommentsIfAny(node, identation, parsedNode) {
        return this.printLeadingComments(node, identation) + parsedNode + this.printTraillingComment(node, identation);
    }

    // a declared type (`x: string`), else the type of a literal initializer (numbers map to object)
    getType(node) {
        const type = node.type;
        const supported = (t) => Object.prototype.hasOwnProperty.call(this.SupportedKindNames, t.kind);
        if (type?.kind === SyntaxKind.TypeReference) {
            if (type.typeName.text !== "Promise") {
                return type.typeName.text;
            }
            const typeArgs = type.typeArguments.filter(t => t.kind !== SyntaxKind.VoidKeyword);
            const insideTypes = typeArgs.map(t => supported(t) ? this.SupportedKindNames[t.kind] : t.text).join(",");
            return insideTypes.length > 0 ? `${this.PROMISE_TYPE_KEYWORD}<${insideTypes}>` : this.PROMISE_TYPE_KEYWORD;
        }
        if (type && supported(type)) {
            return this.SupportedKindNames[type.kind];
        }
        const initializer = node.initializer;
        if (initializer === undefined) {
            return undefined;
        }
        const byLiteral: [(n) => boolean, string][] = [
            [isArrayLiteralExpression, this.ARRAY_KEYWORD], [isBooleanLiteral, this.BOOLEAN_KEYWORD], [isObjectLiteralExpression, this.OBJECT_KEYWORD],
            [isNumericLiteral, this.DEFAULT_TYPE], [isStringLiteralLikeNode, this.STRING_KEYWORD],
        ];
        return byLiteral.find(([test]) => test(initializer))?.[1];
    }

    // primitive flags first (number maps to object), then the type's symbol, then its intrinsic name
    getTypeFromRawType(type) {
        if (type.flags === TypeFlags.Any) {
            return undefined;
        }
        const byFlags = { [TypeFlags.Void]: this.VOID_KEYWORD, [TypeFlags.Number]: this.DEFAULT_TYPE, [TypeFlags.String]: this.STRING_KEYWORD };
        const bySymbol = { Array: this.ARRAY_KEYWORD, __object: this.OBJECT_KEYWORD, __type: this.OBJECT_KEYWORD, Promise: this.PROMISE_TYPE_KEYWORD };
        const byIntrinsic = { object: this.OBJECT_KEYWORD, boolean: this.BOOLEAN_KEYWORD };
        const own = (table, key) => Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
        return own(byFlags, type.flags) ?? own(bySymbol, type?.getSymbol()?.escapedName) ?? own(byIntrinsic, type?.intrinsicName);
    }

    getFunctionType(node, async = true){
        const type = this.getChecker().getReturnTypeOfSignature(this.getChecker().getSignatureFromDeclaration(node));
        const parsedTtype = this.getTypeFromRawType(type);
        if (parsedTtype !== this.PROMISE_TYPE_KEYWORD) {
            return parsedTtype;
        }
        const resolvedTypeArguments = this.getChecker().getTypeArguments(type as any);
        if (resolvedTypeArguments.length === 0 || (resolvedTypeArguments.length === 1 && resolvedTypeArguments[0].flags === TypeFlags.Void)) {
            return this.PROMISE_TYPE_KEYWORD;
        }
        const insideTypes = resolvedTypeArguments.map(t => this.getTypeFromRawType(t)).join(",");
        if (insideTypes.length === 0) {
            return undefined;
        }
        return async ? `${this.PROMISE_TYPE_KEYWORD}<${insideTypes}>` : insideTypes;
    }

    printFunctionBody(node, identation) {
        return this.printBlock(node.body, identation);
    }

    printParameterType(node) {
        if (!this.requiresParameterType) {
            return "";
        }
        if (!this.INFER_ARG_TYPE) {
            return this.DEFAULT_PARAMETER_TYPE;
        }
        const type = this.getChecker().typeToString(this.getChecker().getTypeAtLocation(node));
        return this.ArgTypeReplacements[type] || this.DEFAULT_PARAMETER_TYPE;
    }

    printFunctionType(node){
        if (!this.requiresReturnType) {
            return "";
        }
        const typeText = this.getFunctionType(node);
        if (typeText === this.VOID_KEYWORD || typeText === this.PROMISE_TYPE_KEYWORD) {
            return typeText;
        }
        const res = this.isAsyncFunction(node) ? `${this.PROMISE_TYPE_KEYWORD}<${this.DEFAULT_RETURN_TYPE}>` : this.DEFAULT_RETURN_TYPE;
        this.warn(node, node.name.getText(), "Function return type not found, will default to: " + res);
        return res;
    }

    // `<text> ` when text is non-empty, else text unchanged
    withSpace(text) {
        return text ? text + " " : text;
    }

    printFunctionDefinition(node, identation) {
        const name = this.transformFunctionNameIfNeeded(node.name?.text ?? "");
        const parsedArgs = this.printMethodParameters(node);
        let modifiers = this.withSpace(this.printModifiers(node));
        let returnType = this.printFunctionType(node);
        if (returnType === 'java.util.concurrent.CompletableFuture') {
            returnType = 'java.util.concurrent.CompletableFuture<Void>';
        }
        const fnKeyword = this.withSpace(this.FUNCTION_TOKEN);
        if (!fnKeyword && isFunctionDeclaration(node)){
            modifiers = modifiers + "public ";
        }
        const printName = this.includeFunctionNameInFunctionExpressionDeclaration || !isFunctionExpression(node);
        return this.getIden(identation) + modifiers + this.withSpace(returnType) + fnKeyword + (printName ? name : "") + "(" + parsedArgs + ")";
    }

    transformFunctionNameIfNeeded(name): string {
        return this.unCamelCaseIfNeeded(name);
    }

    printFunctionDeclaration(node, identation) {
        if (isArrowFunction(node)) {
            const parameters = node.parameters.map(param => this.printParameter(param)).join(", ");
            return `(${parameters}) => ${this.printNode(node.body)}`;
        }
        const funcBody = this.printFunctionBody(node, identation);
        return this.printNodeCommentsIfAny(node, identation, this.printFunctionDefinition(node, identation) + funcBody);
    }

    printMethodParameters(node) {
        return node.parameters.map(param => this.printParameter(param)).join(", ");
    }

    transformMethodNameIfNeeded(name: string): string {
        return this.unCamelCaseIfNeeded(name);
    }

    printMethodDefinition(node, identation) {
        const name = this.transformMethodNameIfNeeded(node.name.text);
        const returnType = this.printFunctionType(node);
        const modifiers = this.withSpace(this.printModifiers(node)) || this.withSpace(this.METHOD_DEFAULT_ACCESS);
        const parsedArgs = this.printMethodParameters(node);
        const methodDef = this.getIden(identation) + modifiers + this.withSpace(returnType) + this.withSpace(this.METHOD_TOKEN) + name + "(" + parsedArgs + ")";
        return this.printNodeCommentsIfAny(node, identation, methodDef);
    }

    printMethodDeclaration(node, identation) {
        const methodDef = this.printMethodDefinition(node, identation);
        return methodDef + this.printFunctionBody(node, identation);
    }

    printStringLiteral(node) {
        const token = this.STRING_QUOTE_TOKEN;
        let text = node.text;
        if (text in this.StringLiteralReplacements) {
            return this.StringLiteralReplacements[text];
        }
        // trick to preserve valid backslashes (e.g. \n, \t)
        const backslashPlaceholder = "\x00";
        text = text.replaceAll("\\", backslashPlaceholder);
        for (const [raw, escaped] of [["\b", "\\b"], ["\f", "\\f"], ["\n", "\\n"], ["\r", "\\r"], ["\t", "\\t"], [backslashPlaceholder, "\\\\"]]) {
            text = text.replaceAll(raw, escaped);
        }
        if (token === "'") {
            text = text.replaceAll("'", "\\'"); // escape single quotes
        } else if (token === "\"") {
            text = text.replaceAll("\"", "\\\""); // escape double quotes
        }
        return token + text + token;
    }

    printNumericLiteral(node) {
        return node.text;
    }

    printArrayLiteralExpression(node, identation) {
        const elements = node.elements.map((e) => this.printNode(e)).join(", ");
        return this.ARRAY_OPENING_TOKEN + elements  + this.ARRAY_CLOSING_TOKEN;
    }

    printVariableDeclarationList(node,identation) {
        const declaration = node.declarations[0];
        const initializer = declaration?.initializer;
        if (this.removeVariableDeclarationForFunctionExpression && initializer && (isFunctionExpression(initializer) || isArrowFunction(initializer))) {
            return this.printNode(initializer, identation).trimEnd();
        }
        const parsedValue = initializer ? this.printNode(initializer, identation) : this.NULL_TOKEN;
        return this.getIden(identation) + this.withSpace(this.VAR_TOKEN) + this.printNode(declaration.name) + " = " + parsedValue.trim();
    }

    printVariableStatement(node, identation){
        if (this.isCJSRequireStatement(node)) {
            return ""; // remove cjs imports
        }
        const varStatement = this.printVariableDeclarationList(node.declarationList, identation) + this.LINE_TERMINATOR;
        return this.printNodeCommentsIfAny(node, identation, varStatement);
    }

    printOutOfOrderCallExpressionIfAny(node, identation) {
        return undefined; // stub to override
    }

    printSuperCallInsideConstructor(node, identation) {
        const parsedArgs = node.arguments.map((a) => this.printNode(a, identation).trim()).join(",");
        return this.SUPER_CALL_TOKEN + "(" + parsedArgs + ")";
    }

    printArgsForCallExpression(node, identation) {
        return node.arguments.map((a) => this.printNode(a, identation).trim()).join(", ");
    }

    printAssertCall(node, identation, parsedArgs) {
        return `assert(${parsedArgs})`;
    }

    // builtin calls are printed by optional language hooks (`printJsonParseCall`, `printPushCall`, ...);
    // a matched call whose hook the language does not define prints undefined
    callBuiltinHook(hook: string, ...args) {
        return typeof this[hook] === "function" ? this[hook](...args) : undefined;
    }

    printCallExpression(node, identation) {
        const expression = node.expression;
        const parsedArgs = this.printArgsForCallExpression(node, identation);
        const removeParenthesis = this.shouldRemoveParenthesisFromCallExpression(node);
        const finalExpression = this.printOutOfOrderCallExpressionIfAny(node, identation);
        if (finalExpression) {
            return finalExpression;
        }
        const args = node.arguments ?? [];
        // check propertyAccessExpression for built in functions calls like Json.parse
        if (expression.kind === SyntaxKind.PropertyAccessExpression) {
            const expressionText = expression.getText().trim();
            if (args.length === 0 && expressionText === "Date.now") {
                return this.callBuiltinHook("printDateNowCall", node, identation);
            }
            if (args.length === 1) {
                const parsedArg = this.printNode(args[0], 0);
                if (STATIC_CALL_HOOKS.has(expressionText)) {
                    return this.callBuiltinHook(STATIC_CALL_HOOKS.get(expressionText), node, identation, parsedArg);
                }
            }
            const rightSide = expression.name?.text;
            const leftSide = expression?.expression;
            if (args.length === 0 && rightSide !== undefined && leftSide !== undefined) {
                const parsedLeftSide = this.printNode(leftSide, 0);
                if (NO_ARG_METHOD_HOOKS.has(rightSide)) {
                    return this.callBuiltinHook(NO_ARG_METHOD_HOOKS.get(rightSide), node, identation, parsedLeftSide);
                }
            }
            if (leftSide && rightSide && args.length > 0) {
                const parsedArg = this.printNode(args[0], identation).trimStart();
                const secondParsedArg = args[1] ? this.printNode(args[1], identation).trimStart() : undefined;
                const name = this.printNode(leftSide, 0);
                if (ARG_METHOD_HOOKS.has(rightSide)) {
                    const hook = ARG_METHOD_HOOKS.get(rightSide);
                    const extra = (rightSide === "padEnd" || rightSide === "padStart") ? [secondParsedArg] : [];
                    return this.callBuiltinHook(hook, node, identation, name, parsedArg, ...extra);
                }
                if (args.length === 1 || args.length === 2) {
                    const parsedArg2 = args[1] ? this.printNode(args[1], identation).trimStart() : undefined;
                    if (TWO_ARG_METHOD_HOOKS.has(rightSide)) {
                        return this.callBuiltinHook(TWO_ARG_METHOD_HOOKS.get(rightSide), node, identation, name, parsedArg, parsedArg2);
                    }
                }
            }
        } else if (args.length === 2 && expression.text === "assert") {
            return this.printAssertCall(node, identation, parsedArgs);
        }
        // print super() call inside constructor
        if (expression.kind === SyntaxKind.SuperKeyword) {
            return this.printSuperCallInsideConstructor(node, identation);
        }
        let parsedExpression = undefined;
        if (Object.prototype.hasOwnProperty.call(this.CallExpressionReplacements, expression.getText())) {
            parsedExpression = this.CallExpressionReplacements[expression.getText()];
        } else if (expression.kind === SyntaxKind.Identifier) {
            parsedExpression = this.transformCallExpressionName(this.unCamelCaseIfNeeded(expression.text), expression);
        } else {
            parsedExpression = this.printNode(expression, 0);
        }
        if (removeParenthesis) return parsedExpression;
        return this.printCallHead(node, parsedExpression, parsedArgs);
    }

    /** `callee(args)` of a plain call; a language may name the callee's path from the node. */
    printCallHead(node, parsedExpression: string, parsedArgs: string): string {
        return parsedExpression + "(" + parsedArgs + ")";
    }

    printClassBody(node, identation) {
        return node.members.map((m, index) => {
            const parsedNode = this.printNode(m, identation+1);
            return (m.kind === SyntaxKind.PropertyDeclaration || index === 0) ? parsedNode : "\n".repeat(this.NUM_LINES_BETWEEN_CLASS_MEMBERS) + parsedNode;
        }).join("\n");
    }

    getCustomClassName(node) {
        return node.name.text;
    }

    getClassModifier(node) {
        return "";
    }

    printClassDefinition(node, identation) {
        const className = this.getCustomClassName(node);
        this.currentClassName = className;
        const heritageClauses = node.heritageClauses;
        const classModifier = this.getClassModifier(node);
        const classExtends = heritageClauses !== undefined ? " " + this.EXTENDS_TOKEN + " " + heritageClauses[0].types[0].expression.text : "";
        return this.getIden(identation) + classModifier + "class " + className + classExtends + this.getBlockOpen(identation);
    }

    printClass(node, identation) {
        const classDefinition = this.printClassDefinition(node, identation);
        const classBody = this.printClassBody(node, identation);
        return classDefinition + classBody + this.getBlockClose(identation);
    }

    printConstructorDeclaration (node, identation) {
        const args = this.printMethodParameters(node);
        const constructorBody = this.printFunctionBody(node, identation);
        return this.getIden(identation) + this.CONSTRUCTOR_TOKEN + "(" + args + ")" + constructorBody;
    }

    printWhileStatement(node, identation) {
        const expression = this.printNode(node.expression, 0);
        const whileStm = this.getIden(identation) + this.WHILE_TOKEN + " " + this.CONDITION_OPENING + expression + this.CONDITION_CLOSE + this.printBlock(node.statement, identation);
        return this.printNodeCommentsIfAny(node, identation, whileStm);
    }

    printForStatement(node, identation) {
        const header = [node.initializer, node.condition, node.incrementor].map(part => this.printNode(part, 0)).join("; ");
        const forStm = this.getIden(identation) + this.FOR_TOKEN + " " + this.CONDITION_OPENING + header + this.CONDITION_CLOSE + this.printBlock(node.statement, identation);
        return this.printNodeCommentsIfAny(node, identation, forStm);
    }

    printBreakStatement(node, identation) {
        return this.printNodeCommentsIfAny(node, identation, this.getIden(identation) + this.BREAK_TOKEN + this.LINE_TERMINATOR);
    }

    printPostFixUnaryExpression(node, identation) {
        return this.getIden(identation) + this.printNode(node.operand, 0) + this.PostFixOperators[node.operator];
    }

    printPrefixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        // `!` prints its operand as a condition (falsy/truthy values)
        const printed = operator === SyntaxKind.ExclamationToken ? this.printCondition(operand, 0) : this.printNode(operand, 0);
        return this.getIden(identation) + this.PrefixFixOperators[operator] + printed;
    }

    printObjectLiteralBody(node, identation) {
        const body = node.properties.map((p) => this.printNode(p, identation+1)).join(",\n");
        return body ? body + "," : body;
    }

    printObjectLiteralExpression(node, identation) {
        const objectBody = this.printObjectLiteralBody(node, identation);
        const formattedObjectBody = objectBody ? "\n" + objectBody + "\n" + this.getIden(identation) : objectBody;
        return  this.OBJECT_OPENING + formattedObjectBody + this.OBJECT_CLOSING;
    }

    printCustomRightSidePropertyAssignment(node, identation): string {
        return undefined; // stub to override
    }

    printPropertyAssignment(node, identation) {
        const {name, initializer} = node;
        const nameAsString = this.printNode(name, 0);
        const valueAsString = this.printCustomRightSidePropertyAssignment(initializer, identation) || this.printNode(initializer, identation);
        const trailingComment = this.printTraillingComment(node, identation);
        const propClose = this.PROPERTY_ASSIGNMENT_CLOSE ? " " + this.PROPERTY_ASSIGNMENT_CLOSE : "";
        return this.getIden(identation) + this.withSpace(this.PROPERTY_ASSIGNMENT_OPEN) + nameAsString + this.PROPERTY_ASSIGNMENT_TOKEN + " " + valueAsString.trim() + propClose + (trailingComment ? " " + trailingComment : "");
    }

    printElementAccessExpressionExceptionIfAny(node) {
        return undefined; // stub to override
    }

    // index WRITE (`x["k"] = v`) whose receiver the C# classifier already declared as a
    // concrete dictionary: the `((IDictionary<string,object>)x)` interface cast the C#
    // branch below emits only exists because the TS type says nothing about the printed
    // declaration, so a printer that knows the declared type can drop it. undefined/false
    // keeps the upstream cast (the untyped emission). See csharpTranspiler.ts.
    csharpDictionaryIndexWriteNeedsNoCast(node): boolean | undefined {
        return undefined; // stub to override
    }

    printElementAccessExpression(node, identation) {
        // example x['test']
        const {expression, argumentExpression} = node;
        const exception = this.printElementAccessExpressionExceptionIfAny(node);
        if (exception) {
            return exception;
        }
        // reads print through the element-access wrapper (`getValue(x, 'test')`); assignment targets
        // (`x["a"] = ...`, `x["a"] += ...`) print a cast receiver instead
        const parent = node.parent;
        const isLeftSideOfAssignment = parent?.kind === SyntaxKind.BinaryExpression && parent.left === node
            && (parent.operatorToken.kind === SyntaxKind.EqualsToken || parent.operatorToken.kind === SyntaxKind.PlusEqualsToken);
        const expressionAsString = this.printNode(expression, 0);
        const argumentAsString = this.printNode(argumentExpression, 0);
        if (!this.ELEMENT_ACCESS_WRAPPER_OPEN || !this.ELEMENT_ACCESS_WRAPPER_CLOSE) {
            return expressionAsString + "[" + argumentAsString + "]";
        }
        if (!isLeftSideOfAssignment) {
            return `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${expressionAsString}, ${argumentAsString}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
        }
        // string (or unknown) keys cast the receiver to a dictionary, other keys to a list
        const type = this.getChecker().getTypeAtLocation(argumentExpression);
        const isUnionString = type.flags === TypeFlags.Union && this.isStringType((type as any).getTypes()[0].flags);
        const isStringKey = this.isStringType(type.flags) || isUnionString || type.flags === TypeFlags.Any;
        if (this.id === "C#") {
            if (!isStringKey) {
                return `((${this.ARRAY_KEYWORD})${expressionAsString})[Convert.ToInt32(${argumentAsString})]`;
            }
            const cast = isStringLiteralLikeNode(argumentExpression) ? "" : '(string)';
            // a receiver the C# classifier declared as a concrete dictionary keeps only the key cast
            const receiver = this.csharpDictionaryIndexWriteNeedsNoCast(node) ? expressionAsString : `((IDictionary<string,object>)${expressionAsString})`;
            return `${receiver}[${cast}${argumentAsString}]`;
        }
        if (this.id === "Java") {
            return isStringKey ? `((java.util.HashMap<String, Object>)${expressionAsString}).get(${argumentAsString})` : `((java.util.List<Object>)${expressionAsString}).get(Helpers.toInt(${argumentAsString}))`;
        }
        return expressionAsString + "[" + argumentAsString + "]";
    }

    printCondition (node, identation) {
        if (this.supportsFalsyOrTruthyValues) {
            // languages like php or python do not need this extra logic
            return this.printNode(node, identation);
        }

        // can be called from ifs or conditional expressions or binary expressions so might contain the ! operator
        if (node.kind  === SyntaxKind.PrefixUnaryExpression && node.operator === SyntaxKind.ExclamationToken) {
            return this.printPrefixUnaryExpression(node, identation); // avoid infinite recursion
        }

        // wrap falsy/truthy expressions unconditionally
        return `${this.getIden(identation)}${this.FALSY_WRAPPER_OPEN}${this.printNode(node, 0)}${this.FALSY_WRAPPER_CLOSE}`;
    }

    printIfStatement(node, identation) {
        const expression = this.printCondition(node.expression, 0);
        const elseStatement = node.elseStatement;
        const ifBody = this.printBlock(node.thenStatement, identation, elseStatement !== undefined);
        const head = node.parent.kind === SyntaxKind.IfStatement ? this.ELSEIF_TOKEN + " " : this.getIden(identation) + this.IF_TOKEN + " ";
        let ifComplete = head + this.CONDITION_OPENING + expression + this.CONDITION_CLOSE + ifBody;
        if (elseStatement?.kind === SyntaxKind.Block) {
            ifComplete += this.ELSE_TOKEN + this.printBlock(elseStatement, identation);
        } else if (elseStatement?.kind === SyntaxKind.IfStatement) {
            ifComplete += this.printIfStatement(elseStatement, identation);
        }
        return this.printNodeCommentsIfAny(node, identation, ifComplete);
    }

    printParenthesizedExpression(node, identation) {
        if (node.expression.kind === SyntaxKind.AsExpression) {
            // transform (this as any) into this, () and as any are not necessary
            return this.getIden(identation) + this.printNode(node.expression, 0);
        }
        if (node.expression.kind === SyntaxKind.ArrowFunction) {
            // ignore arrowFunctions inside parenthesis
            return "";
        }
        return this.getIden(identation) + this.LEFT_PARENTHESIS + this.printNode(node.expression, 0) + this.RIGHT_PARENTHESIS;
    }

    printBooleanLiteral(node) {
        return SyntaxKind.TrueKeyword === node.kind ? this.TRUE_KEYWORD : this.FALSE_KEYWORD;
    }

    printTryStatement(node, identation) {
        const tryBody = this.printBlock(node.tryBlock, identation, true);
        const catchBody = this.printBlock(node.catchClause.block, identation);
        const catchDeclaration = this.CATCH_DECLARATION + " " + this.printNode(node.catchClause.variableDeclaration.name, 0);
        const catchCondOpen = this.CONDITION_OPENING || " ";
        return this.getIden(identation) + this.TRY_TOKEN + tryBody + this.CATCH_TOKEN + catchCondOpen + catchDeclaration + this.CONDITION_CLOSE + catchBody;
    }

    printNewExpression(node, identation) {
        // `new X(...)` keeps the bare name, other targets (`new exact[string]`) print the expression
        const expression = node.expression?.text || this.printNode(node.expression);
        const args = node.arguments.map(n => this.printNode(n, identation)).join(", ");
        return this.withSpace(this.NEW_TOKEN) + expression + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
    }

    printThrowStatement(node, identation) {
        return this.getIden(identation) + this.THROW_TOKEN + " " + this.printNode(node.expression, 0) + this.LINE_TERMINATOR;
    }

    printAwaitExpression(node, identation) {
        const expression = this.printNode(node.expression, identation);
        return (this.asyncTranspiling ? this.AWAIT_TOKEN + " " : "") + expression;
    }

    wrapSyntheticNode(synthetic, original) {
        // give the synthetic wrapper the original node's source range and splice it
        // into the parent chain, so position/type based helpers keep working
        synthetic.pos = original.pos;
        synthetic.end = original.end;
        synthetic.parent = original.parent;
        original.parent = synthetic;
        return synthetic;
    }

    wrapImplicitReturnAwait(node) {
        // inside a non-async function transpiled as async (isImplicitAsyncFunction),
        // returned Promises must be awaited to keep the generated code equivalent to
        // the classic `async`/`return await` form: wrap them in a synthetic await
        // expression so every language prints them through its usual await path
        let exp = node.expression;
        if (!exp || isAwaitExpression(exp)
                || !this.isImplicitAsyncFunction(findAncestor(node, isFunctionLike))
                || !this.isPromiseType(this.getChecker().getTypeAtLocation(exp))) {
            return node;
        }
        if (isConditionalExpression(exp) || isBinaryExpression(exp)) {
            // an await-token prefix would change precedence (e.g. `await a ? b : c`)
            exp = this.wrapSyntheticNode(createParenthesizedExpression(exp), exp);
        }
        // TS7 program nodes are read-only: print a synthetic return in place of the original
        const synthetic = this.wrapSyntheticNode(createReturnStatement(undefined), node);
        const awaited = this.wrapSyntheticNode(createAwaitExpression(exp), exp);
        awaited.parent = synthetic;
        Object.defineProperty(synthetic, "expression", { value: awaited });
        node.parent = synthetic.parent;
        return synthetic;
    }

    printConditionalExpression(node, identation) {
        const condition = this.printCondition(node.condition, identation);
        const whenTrue = this.printNode(node.whenTrue, 0);
        return condition + " ? " + whenTrue + " : " + this.printNode(node.whenFalse, 0);
    }

    printAsExpression(node, identation) {
        return this.printNode(node.expression, identation);
    }

    printReturnStatement(node, identation) {
        const leadingComment = this.printLeadingComments(node, identation);
        const trailingComment = this.printTraillingComment(node, identation);
        const rightPart = node.expression ? this.printNode(node.expression, identation).trim() : '';
        const tail = rightPart ? ' ' + rightPart + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
        return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + tail + (trailingComment ? " " + trailingComment : "");
    }

    printArrayBindingPattern(node, identation) {
        const elements = node.elements.map((e) => this.printNode(e.name, identation)).join(", ");
        return this.getIden(identation) + this.ARRAY_OPENING_TOKEN + elements + this.ARRAY_CLOSING_TOKEN;
    }

    printBlock(node, identation, chainBlock = false) {
        const blockOpen = this.getBlockOpen(identation);
        const blockClose = this.getBlockClose(identation, chainBlock);
        return blockOpen + node.statements.map((s) => this.printNode(s, identation+1)).join("\n") + blockClose;
    }

    printExpressionStatement(node, identation) {
        if (this.isCJSModuleExportsExpressionStatement(node)) {
            return ""; // remove module.exports = ...
        }
        const expressionStatementPrefixes = this.getExpressionStatementPrefixesIfAny(node, identation) ?? "";
        const exprStm = this.printNode(node.expression, identation);
        if (exprStm.length === 0) {
            return ""; // skip empty statements
        }
        return this.printNodeCommentsIfAny(node, identation, expressionStatementPrefixes + this.getIden(identation) + exprStm + this.LINE_TERMINATOR);
    }

    getExpressionStatementPrefixesIfAny(node, identation) {
        return undefined;
    }

    printPropertyDeclaration(node, identation) {
        const modifiers = this.printPropertyAccessModifiers(node);
        const name = this.printNode(node.name, 0);
        const initializer = node.initializer ? " = " + this.printNode(node.initializer, 0) : "";
        return this.getIden(identation) + modifiers + name + initializer + this.LINE_TERMINATOR;
    }

    printPropertyAccessModifiers (node) {
        return this.withSpace(this.printModifiers(node));
    }

    printSpreadElement(node, identation) {
        return this.getIden(identation) + this.SPREAD_TOKEN + this.printNode(node.expression, 0);
    }

    printNullKeyword(node, identation){
        return this.getIden(identation) + this.NULL_TOKEN;
    }

    printContinueStatement(node, identation){
        return this.getIden(identation) + this.CONTINUE_TOKEN + this.LINE_TERMINATOR;
    }

    printDeleteExpression (node, identation) {
        return undefined;
    }

    printThisKeyword(node, identation) {
        return this.THIS_TOKEN;
    }

    printNode(node, identation = 0): string {
        try {
            // dispatch on node.kind through the kind tables above
            if (PRINT_BY_KIND.has(node.kind)) {
                return this[PRINT_BY_KIND.get(node.kind)](node, identation);
            }
            if (PRINT_NODE_ONLY_BY_KIND.has(node.kind)) {
                return this[PRINT_NODE_ONLY_BY_KIND.get(node.kind)](node);
            }
            if (node.kind === SyntaxKind.SuperKeyword) {
                return this.SUPER_TOKEN;
            }
            if (node.kind === SyntaxKind.ReturnStatement) {
                return this.printReturnStatement(this.wrapImplicitReturnAwait(node), identation);
            }
            if (node.statements) {
                if (isSourceFile(node)) {
                    // reset the current class name when entering a new file so a
                    // class name from a previously transpiled file does not leak
                    // into a class-less file (e.g. try/catch wrappers in tests)
                    this.className = "undefined";
                }
                const transformedStatements = node.statements.map((m) => this.printNode(m, identation + 1));
                return transformedStatements.filter(st => st.length > 0 ).join("\n" + "\n".repeat(this.LINES_BETWEEN_FILE_MEMBERS)) + "\n".repeat(this.NUM_LINES_END_FILE);
            }
            return "";
        } catch (e) {
            if (!(e instanceof TranspilationError)) {
                console.error('[ast-transpiler] underlying error:', e && (e.stack || e.message || e));
            }
            throw new TranspilationError(this.id, (e && (e.messageText ?? e.message)) ?? String(e), node.getFullText(), node.pos, node.end);
        }
    }

    getFileESMImports(node): IFileImport[] {
        const result: IFileImport[] = [];
        for (const statement of node.statements.filter((s) => isImportDeclaration(s))) {
            const path = statement.moduleSpecifier.text;
            const importClause = statement.importClause;
            const namedImports = importClause.namedBindings;
            if (!namedImports) {
                result.push({ name: importClause.name.text, path, isDefault: true }); // default import
            } else if (namedImports.elements) {
                namedImports.elements.forEach((elem) => result.push({ name: elem.name.text, path, isDefault: false }));
            } else {
                result.push({ name: namedImports.name.text, path, isDefault: false }); // import * as name from 'path'
            }
        }
        return result;
    }

    isCJSRequireStatement(node): boolean {
        const dec = node.declarationList.declarations[0];
        return dec.initializer && isCallExpression(dec.initializer) && dec.initializer.expression.getText() === "require";
    }

    isCJSModuleExportsExpressionStatement(node): boolean {
        if (node.expression?.kind !== SyntaxKind.BinaryExpression || node.expression.left.kind !== SyntaxKind.PropertyAccessExpression) {
            return false;
        }
        const left = node.expression.left as PropertyAccessExpression;
        return left.expression.getText() === "module" && left.name.getText() === "exports";
    }

    getCJSImports(node): IFileImport[] {
        const result: IFileImport[] = [];
        const declarations = node.statements.filter(s => isVariableStatement(s)).map(s => s.declarationList.declarations[0]);
        for (const decNode of declarations) {
            if (decNode.initializer?.kind !== SyntaxKind.CallExpression || decNode.initializer.expression.getText() !== "require") {
                continue;
            }
            const path = decNode.initializer.arguments[0].text;
            if (decNode.name.kind === SyntaxKind.Identifier) {
                result.push({ name: decNode.name.text, path, isDefault: true });
            } else {
                decNode.name.elements.forEach(elem => result.push({ name: elem.name.text, path, isDefault: false }));
            }
        }
        return result;
    }

    getFileImports(node): IFileImport[] {
        const esmImports = this.getFileESMImports(node);
        return esmImports.length > 0 ? esmImports : this.getCJSImports(node);
    }

    getESMExports(node): IFileExport[] {
        const result: IFileExport[] = [];
        for (const statement of node.statements.filter((s) => isExportDeclaration(s))) {
            statement.exportClause?.elements.forEach((elem) => result.push({ name: elem.name.text, isDefault: false }));
        }
        for (const statement of node.statements.filter((s) => isExportAssignment(s))) {
            result.push({ name: statement.expression.getText(), isDefault: true });
        }
        return result;
    }

    getCJSExports(node): IFileExport[] {
        const result: IFileExport[] = [];
        const moduleExports = node.statements.filter(s => this.isCJSModuleExportsExpressionStatement(s)).map(s => s.expression as BinaryExpression);
        for (const { right } of moduleExports) {
            if (right.kind === SyntaxKind.ObjectLiteralExpression) {
                right.properties.forEach(prop => result.push({ name: prop.name.getText(), isDefault: false }));
            }
            if (right.kind === SyntaxKind.Identifier) {
                result.push({ name: right.getText(), isDefault: true });
            }
        }
        return result;
    }

    // `export default class X` / `export default function f`
    getExportDeclarations(node): IFileExport[] {
        const declarations = node.statements.filter((s) => isClassDeclaration(s)).concat(node.statements.filter((s) => isFunctionDeclaration(s)));
        return declarations.filter(d => d.modifiers?.some((m) => m.kind === SyntaxKind.DefaultKeyword)).map(d => ({ name: d.name.text, isDefault: true }));
    }

    getFileExports(node): IFileExport[] {
        const esmExports = this.getESMExports(node).concat(this.getExportDeclarations(node));
        return esmExports.length > 0 ? esmExports : this.getCJSExports(node);
    }

    getReturnTypeFromMethod(node): string {
        const bSymbol = this.getChecker().getTypeAtLocation(node).getSymbol();
        const func2Type = this.getChecker().getTypeOfSymbolAtLocation(bSymbol, bSymbol.valueDeclaration.resolve());
        const rawType = this.getChecker().getSignaturesOfType(func2Type, SignatureKind.Call)[0].getReturnType();
        const res = this.getChecker().typeToString(rawType);
        if (res === undefined && node.type?.typeName?.text) {
            return node.type.typeName.text as string;
        }
        return res;
    }

    getParameterType(node): IParameterType {
        const result: IParameterType = { name: node.name.getText(), isOptional: node.questionToken !== undefined, type: undefined };
        if (node.initializer !== undefined) {
            result.initializer = node.initializer.getText();
        }
        if (node.type === undefined && node.initializer !== undefined) {
            // untyped parameter with an initializer: the initializer's type flag name
            result.type = TypeFlags[this.getChecker().getTypeAtLocation(node.initializer).flags];
            return result;
        }
        const name = node.type?.typeName?.text;
        if (name) {
            result.type = name as string;
            if (node.initializer !== undefined) {
                result.initializer = node.initializer.text;
            }
            return result;
        }
        if (node.type != undefined) {
            result.type = this.getChecker().typeToString(this.getChecker().getTypeAtLocation(node.type)) as string;
        }
        return result;
    }

    getMethodTypes(file): IMethodType[] {
        const result: IMethodType[] = [];
        for (const node of (file.statements ?? []).filter((s) => isClassDeclaration(s))) {
            for (const m of node.members.filter((member) => isMethodDeclaration(member))) {
                const isAsync = this.isAsyncFunction(m);
                const name = m.name.getText();
                const returnType = this.getReturnTypeFromMethod(m);
                const parameters = m.parameters.map((p) => this.getParameterType(p));
                result.push({ name, async: isAsync, returnType, parameters });
            }
        }
        return result;
    }
}

export {
    BaseTranspiler
};
