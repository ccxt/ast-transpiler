import ts from 'typescript';
import { IFileImport, IFileExport, TranspilationError, IMethodType, IParameterType } from './types.js';
import { unCamelCase } from "./utils.js";
import { Logger } from "./logger.js";
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
    NEW_CORRESPODENT = "new";
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

    PARSEINT_WRAPPER_OPEN = "";
    PARSEINT_WRAPPER_CLOSE = "";

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
    PropertyAccessRequiresParenthesisRemoval = [];
    VariableTypeReplacements = {};
    ArgTypeReplacements = {};

    FuncModifiers = {};

    uncamelcaseIdentifiers;
    asyncTranspiling;
    requiresReturnType;
    requiresParameterType;
    supportsFalsyOrTruthyValues;
    requiresCallExpressionCast;
    id;

    constructor(config) {
        Object.assign (this, (config['parser'] || {}));
        this.id = "base";
        this.uncamelcaseIdentifiers = false;
        this.requiresReturnType = false;
        this.requiresParameterType = false;
        this.supportsFalsyOrTruthyValues = true;
        this.requiresCallExpressionCast = false;
        this.initOperators();
    }

    initOperators() {
        this.SupportedKindNames = {
            [ts.SyntaxKind.StringLiteral]: this.STRING_LITERAL_KEYWORD,
            [ts.SyntaxKind.StringKeyword]: this.STRING_KEYWORD,
            // [ts.SyntaxKind.NumberKeyword]: this.NUMBER_KEYWORD,
            [ts.SyntaxKind.NumberKeyword]: this.DEFAULT_TYPE,
            [ts.SyntaxKind.MinusMinusToken]: this.MINUS_MINUS_TOKEN,
            [ts.SyntaxKind.MinusToken]: this.MINUS_TOKEN,
            [ts.SyntaxKind.SlashToken]: this.SLASH_TOKEN,
            [ts.SyntaxKind.AsteriskToken]: this.ASTERISK_TOKEN,
            [ts.SyntaxKind.InKeyword]: this.IN_TOKEN,
            [ts.SyntaxKind.PlusToken]: this.PLUS_TOKEN,
            [ts.SyntaxKind.PercentToken]: this.PERCENT_TOKEN,
            [ts.SyntaxKind.LessThanToken]: this.LESS_THAN_TOKEN,
            [ts.SyntaxKind.LessThanEqualsToken]: this.LESS_THAN_EQUALS_TOKEN,
            [ts.SyntaxKind.GreaterThanToken]: this.GREATER_THAN_TOKEN,
            [ts.SyntaxKind.GreaterThanEqualsToken]: this.GREATER_THAN_EQUALS_TOKEN,
            [ts.SyntaxKind.EqualsEqualsToken]: this.EQUALS_EQUALS_TOKEN,
            [ts.SyntaxKind.EqualsEqualsEqualsToken]: this.EQUALS_EQUALS_EQUALS_TOKEN,
            [ts.SyntaxKind.EqualsToken]: this.EQUALS_TOKEN,
            [ts.SyntaxKind.PlusEqualsToken]: this.PLUS_EQUALS,
            [ts.SyntaxKind.BarBarToken]: this.BAR_BAR_TOKEN,
            [ts.SyntaxKind.AmpersandAmpersandToken]: this.AMPERSTAND_APERSAND_TOKEN,
            [ts.SyntaxKind.ExclamationEqualsEqualsToken]: this.EXCLAMATION_EQUALS_EQUALS_TOKEN,
            [ts.SyntaxKind.ExclamationEqualsToken]: this.EXCLAMATION_EQUALS_TOKEN,
            [ts.SyntaxKind.AsyncKeyword]: this.ASYNC_TOKEN,
            [ts.SyntaxKind.AwaitKeyword]: this.AWAIT_TOKEN,
            [ts.SyntaxKind.StaticKeyword]: this.STATIC_TOKEN,
            [ts.SyntaxKind.PublicKeyword]: this.PUBLIC_KEYWORD,
            [ts.SyntaxKind.PrivateKeyword]: this.PRIVATE_KEYWORD,
            [ts.SyntaxKind.VoidKeyword]: this.VOID_KEYWORD,
            [ts.SyntaxKind.BooleanKeyword]: this.BOOLEAN_KEYWORD,
        };

        this.PostFixOperators = {
            [ts.SyntaxKind.PlusPlusToken]: this.PLUS_PLUS_TOKEN,
            [ts.SyntaxKind.MinusMinusToken]: this.MINUS_MINUS_TOKEN,
        };

        this.PrefixFixOperators = {
            [ts.SyntaxKind.ExclamationToken]: this.NOT_TOKEN,
            [ts.SyntaxKind.MinusToken]: this.MINUS_TOKEN,
        };

        this.FunctionDefSupportedKindNames = {
            [ts.SyntaxKind.StringKeyword]: this.STRING_KEYWORD
        };

        this.FuncModifiers = {
            [ts.SyntaxKind.AsyncKeyword]: this.ASYNC_TOKEN,
            [ts.SyntaxKind.PublicKeyword]: this.PUBLIC_KEYWORD,
            [ts.SyntaxKind.PrivateKeyword]: this.PRIVATE_KEYWORD,
            [ts.SyntaxKind.StaticKeyword]: this.STATIC_TOKEN,
        };
    }

    applyUserOverrides(config): void {
        this.LeftPropertyAccessReplacements = Object.assign ({}, this.LeftPropertyAccessReplacements, config['LeftPropertyAccessReplacements'] ?? {});
        this.RightPropertyAccessReplacements = Object.assign ({}, this.RightPropertyAccessReplacements, config['RightPropertyAccessReplacements'] ?? {});
        this.FullPropertyAccessReplacements = Object.assign ({}, this.FullPropertyAccessReplacements, config['FullPropertyAccessReplacements'] ?? {});
        this.CallExpressionReplacements = Object.assign ({}, this.CallExpressionReplacements, config['CallExpressionReplacements'] ?? {});
        this.StringLiteralReplacements = Object.assign ({}, this.StringLiteralReplacements, config['StringLiteralReplacements'] ?? {});
    }

    getLineAndCharacterOfNode(node): [number,number] {
        const { line, character } =
        global.src.getLineAndCharacterOfPosition(node.getStart());
        return [line + 1,character];
    }

    isComment(line: string){
        line = line.trim();
        return line.startsWith("//") || line.startsWith("/*") || line.startsWith("*");
    }

    isStringType(flags: ts.TypeFlags) {
        return flags === ts.TypeFlags.String || flags === ts.TypeFlags.StringLiteral;
    }

    isAnyType(flags: ts.TypeFlags) {
        return flags === ts.TypeFlags.Any;
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

    isAsyncFunction(node) {
        let modifiers = node.modifiers;
        if (modifiers === undefined) {
            return false;
        }
        modifiers = modifiers.filter(mod => mod.kind === ts.SyntaxKind.AsyncKeyword);

        return modifiers.length > 0;
    }

    getMethodOverride(node: ts.Node): ts.Node {
        /////
        //// Warning: Only takes into consideration 1 level of heritage
        //// might be costly, try to improve its performance later
        ////
        // Check if the method is a member of a class
        if (node === undefined) {
            return undefined;
        }
        if (!ts.isClassDeclaration(node.parent)) {
            return undefined;
        }

        // Get the class declaration
        const classDeclaration = node.parent as ts.ClassDeclaration;

        // Check if the class has a base class
        if (!classDeclaration.heritageClauses) {
            return undefined;
        }

        let method = undefined;

        let parentClass = (ts as any).getAllSuperTypeNodes(node.parent)[0];

        while (parentClass !== undefined) {
            const parentClassType = global.checker.getTypeAtLocation(parentClass);
            const parentClassDecl = parentClassType?.symbol?.valueDeclaration;

            if (parentClassDecl === undefined) {
                this.warn(node, "Parent class", "Parent class not found");
                return undefined;
            }

            const parentClassMembers = parentClassDecl.members ?? [];

            parentClassMembers.forEach(elem=> {
                if (ts.isMethodDeclaration(elem)) {

                    const name = elem.name.getText().trim();
                    if ((node as any).name.escapedText === name) {
                        method = elem;
                    }
                }
            });

            parentClass = (ts as any).getAllSuperTypeNodes(parentClassDecl)[0] ?? undefined;
        }



        // TODO: Check if the method has the same signature as a method in the base class
        return method;
    }

    getIden (num) {
        return this.DEFAULT_IDENTATION.repeat(num);
    }

    getBlockOpen(identation){
        return this.SPACE_BEFORE_BLOCK_OPENING + this.BLOCK_OPENING_TOKEN + "\n";
    }

    getBlockClose(identation, chainBlock = false) {

        if (chainBlock) {
            return this.BLOCK_CLOSING_TOKEN ? "\n" + this.getIden(identation) + this.BLOCK_CLOSING_TOKEN  + this.SPACE_BEFORE_BLOCK_OPENING : "\n" + this.getIden(identation) + this.BLOCK_CLOSING_TOKEN;
        }

        return this.BLOCK_CLOSING_TOKEN ? "\n" + this.getIden(identation) + this.BLOCK_CLOSING_TOKEN : "";
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

    transformIdentifier(identifier) {
        return this.unCamelCaseIfNeeded(identifier);
    }

    printIdentifier(node) {
        let idValue = node.text ?? node.escapedText;

        if (this.ReservedKeywordsReplacements[idValue]) {
            idValue = this.ReservedKeywordsReplacements[idValue];
        }

        if (idValue === "undefined") {
            return this.UNDEFINED_TOKEN;
        }
        return this.transformIdentifier(idValue); // check this later
    }

    shouldRemoveParenthesisFromCallExpression(node) {
        if (node.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
            return this.PropertyAccessRequiresParenthesisRemoval.includes(node.expression.name.text);
        }
        return false;
    }

    printInstanceOfExpression(node, identation) {
        // const left = this.printNode(node.left, 0);
        // const right = this.printNode(node.right, 0);
        const left = node.left.escapedText;
        const right = node.right.escapedText;
        return this.getIden(identation) + `${left} instanceof ${right}`;
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

        if (operatorToken.kind == ts.SyntaxKind.InstanceOfKeyword) {
            return this.printInstanceOfExpression(node, identation);
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

        const expression = node.expression;

        const transformedProperty = this.transformPropertyAcessExpressionIfNeeded(node);
        if (transformedProperty) {
            return this.getIden(identation) + transformedProperty;
        }

        let leftSide = node.expression.escapedText;
        let rightSide = node.name.escapedText;

        switch (rightSide) {
        case "length":
            return this.printLengthProperty(node, identation, leftSide);
        }

        let rawExpression = node.getText().trim();

        if (this.FullPropertyAccessReplacements.hasOwnProperty(rawExpression)){ // eslint-disable-line
            return this.FullPropertyAccessReplacements[rawExpression]; // eslint-disable-line
        }

        leftSide = this.LeftPropertyAccessReplacements.hasOwnProperty(leftSide) ? this.LeftPropertyAccessReplacements[leftSide] : this.printNode(expression, 0); // eslint-disable-line

        // checking "toString" insde the object will return the builtin toString method :X
        rightSide = this.RightPropertyAccessReplacements.hasOwnProperty(rightSide) ? // eslint-disable-line
            this.RightPropertyAccessReplacements[rightSide] :
            this.transformPropertyAcessRightIdentifierIfNeeded(rightSide) ?? rightSide;

        // join together the left and right side again
        const accessToken = this.getExceptionalAccessTokenIfAny(node) ?? this.PROPERTY_ACCESS_TOKEN;

        rawExpression = leftSide + accessToken + rightSide;

        return rawExpression;
    }

    printCustomDefaultValueIfNeeded(node) {
        return undefined;
    }

    printParameteCustomName(node, name, defaultValue = true) {
        // useful for when we have to get the parent's method argument type
        const initializer = node.initializer;

        let type = this.printParameterType(node);
        type = type ? type + " " : "";

        if (defaultValue) {
            if (initializer) {
                const customDefaultValue = this.printCustomDefaultValueIfNeeded(initializer);
                const defaultValue = customDefaultValue ? customDefaultValue : this.printNode(initializer, 0);
                return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + defaultValue;
            }
            return type + name;
        }
        return name;
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
                if (type) {
                    type = (defaultValue === "null" && type !== "object") ? type + "? ": type + " ";
                }
                return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + defaultValue;
            }
            if (type === "") {
                return name;
            }
            return type + " " + name;
        }
        return name;
    }

    printModifiers(node) {
        let modifiers = node.modifiers;
        if (modifiers === undefined) {
            return "";
        }
        modifiers = modifiers.filter(mod => this.FuncModifiers[mod.kind]);

        if (!this.asyncTranspiling) {
            modifiers = modifiers.filter(mod => mod.kind !== ts.SyntaxKind.AsyncKeyword);
        }
        const res = modifiers.map(modifier => this.FuncModifiers[modifier.kind]).join(" ");

        return res;
    }

    transformLeadingComment(comment) {
        return comment; // to override
    }

    transformTrailingComment(comment) {
        return comment; // to override
    }

    printLeadingComments(node, identation) {
        const fullText = global.src.getFullText();
        const commentsRangeList = ts.getLeadingCommentRanges(fullText, node.pos);
        const commentsRange = commentsRangeList ? commentsRangeList : undefined;
        let res = "";
        if (commentsRange) {
            for (const commentRange of commentsRange) {
                const commentText = fullText.slice(commentRange.pos, commentRange.end);
                if (commentText !== undefined) {
                    const formatted = commentText
                        .split("\n")
                        .map(line=>line.trim())
                        .map(line => !(line.trim().startsWith("*")) ? this.getIden(identation) + line : this.getIden(identation) + " " + line) .join("\n");
                    res+= this.transformLeadingComment(formatted) + "\n";
                }
            }
        }
        return res;
    }

    printTraillingComment(node, identation) {
        const fullText = global.src.getFullText();
        const commentsRangeList = ts.getTrailingCommentRanges(fullText, node.end);
        const commentsRange = commentsRangeList ? commentsRangeList : undefined;
        let res = "";
        if (commentsRange) {
            for (const commentRange of commentsRange) {
                const commentText = fullText.slice(commentRange.pos, commentRange.end);
                if (commentText !== undefined) {
                    res+= " " + this.transformTrailingComment(commentText);
                }
            }
        }
        return res;
    }

    printNodeCommentsIfAny(node, identation, parsedNode) {
        const leadingComment = this.printLeadingComments(node, identation);
        const trailingComment = this.printTraillingComment(node, identation);
        return leadingComment + parsedNode + trailingComment;
    }

    getType(node) {
        // try to get type from declared type, example: x: string = "foo"
        const type = node.type;
        if (type) {
            if (type.kind === ts.SyntaxKind.TypeReference) {
                const typeRef = type.typeName.escapedText;
                if (typeRef === "Promise") {
                    const typeArgs = type.typeArguments.filter(t => t.kind !== ts.SyntaxKind.VoidKeyword);
                    const insideTypes = typeArgs.map(type => {
                        if (this.SupportedKindNames.hasOwnProperty(type.kind)) {  // eslint-disable-line
                            return this.SupportedKindNames[type.kind];
                        } else {
                            return type.escapedText;
                        }
                    }).join(",");

                    if (insideTypes.length > 0) {
                        return `${this.PROMISE_TYPE_KEYWORD}<${insideTypes}>`;
                    }
                    return this.PROMISE_TYPE_KEYWORD;
                }
                return type.typeName.escapedText;
            } else if (this.SupportedKindNames.hasOwnProperty(type.kind)) { // eslint-disable-line
                return this.SupportedKindNames[type.kind];
            }
        }

        // todo: infer from initializer re-think this logic ex: x = 1;
        // can we use the type checker here?
        const initializer = node.initializer;
        if (initializer) {
            if (ts.isArrayLiteralExpression(initializer)) {
                return this.ARRAY_KEYWORD;
            }
            if ((ts as any).isBooleanLiteral(initializer)) {
                return this.BOOLEAN_KEYWORD;
            }
            if (ts.isObjectLiteralExpression(initializer)) {
                return this.OBJECT_KEYWORD;
            }
            if (ts.isNumericLiteral(initializer)) {
                // return this.NUMBER_TYPE_TOKEN;
                // const value = initializer.text;
                // const num = Number(value);
                // if (Number.isInteger(num)) {
                //     return this.INTEGER_KEYWORD;
                // }
                // return this.NUMBER_KEYWORD;
                return this.DEFAULT_TYPE; // int and number to object
            }
            if (ts.isStringLiteralLike(initializer)) {
                return this.STRING_KEYWORD;
            }
        }
        return undefined;
    }

    getTypeFromRawType(type) {
        // check for primitive types
        if (type.flags === ts.TypeFlags.Any) {
            return undefined;
        }
        if (type.flags === ts.TypeFlags.Void) {
            return this.VOID_KEYWORD;
        }
        if (type.flags === ts.TypeFlags.Number) {
            // return this.NUMBER_KEYWORD;
            return this.DEFAULT_TYPE;
        }

        if (type.flags === ts.TypeFlags.String) {
            return this.STRING_KEYWORD;
        }
        // if (type.flags === ts.TypeFlags.Boolean) {
        //     return this.BOOLEAN_KEYWORD;
        // }

        // check for array or object

        if (type?.symbol?.escapedName === 'Array') {
            return this.ARRAY_KEYWORD;
        }
        if (type?.symbol?.escapedName === '__object') {
            return this.OBJECT_KEYWORD;
        }

        // check this out, trying to resolve Promise<{}>
        if (type?.symbol?.escapedName === '__type') {
            return this.OBJECT_KEYWORD;
            // return this.DEFAULT_TYPE;
        }

        // check for promise type

        if (type?.symbol?.escapedName === 'Promise') {
            return this.PROMISE_TYPE_KEYWORD;
        }

        // check this out not sure about this
        if (type?.intrinsicName === 'object') {
            return this.OBJECT_KEYWORD;
        }
        if (type?.intrinsicName === 'boolean') {
            return this.BOOLEAN_KEYWORD;
        }

        return undefined;
    }

    getFunctionType(node, async = true){
        // use type checker to do it here
        const type = global.checker.getReturnTypeOfSignature(global.checker.getSignatureFromDeclaration(node));

        const parsedTtype = this.getTypeFromRawType(type);

        if (parsedTtype === this.PROMISE_TYPE_KEYWORD) {
            if (type.resolvedTypeArguments.length === 0) {
                return this.PROMISE_TYPE_KEYWORD;
            }
            if (type.resolvedTypeArguments.length === 1 && type.resolvedTypeArguments[0].flags === ts.TypeFlags.Void) {
                return this.PROMISE_TYPE_KEYWORD;
            }

            const insideTypes = type.resolvedTypeArguments.map(type => this.getTypeFromRawType(type)).join(",");
            if (insideTypes.length > 0) {
                if (async) {
                    return `${this.PROMISE_TYPE_KEYWORD}<${insideTypes}>`;
                } else {
                    return insideTypes;
                }
            }
            return undefined;
        }
        return parsedTtype;
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

        const type = global.checker.typeToString(global.checker.getTypeAtLocation(node));

        if (this.ArgTypeReplacements[type]) {
            return this.ArgTypeReplacements[type];
        }

        return this.DEFAULT_PARAMETER_TYPE;
    }

    printFunctionType(node){
        if (!this.requiresReturnType) {
            return "";
        }

        const typeText = this.getFunctionType(node);
        if (typeText === undefined || (typeText !== this.VOID_KEYWORD && typeText !== this.PROMISE_TYPE_KEYWORD)) {
            // throw new FunctionReturnTypeError("Function return type is not supported");
            let res = "";
            if (this.isAsyncFunction(node)) {
                res = `${this.PROMISE_TYPE_KEYWORD}<${this.DEFAULT_RETURN_TYPE}>`;
            } else {
                res = this.DEFAULT_RETURN_TYPE;
            }
            this.warn(node, node.name.getText(), "Function return type not found, will default to: " + res);
            return res;
        }
        return typeText;
    }

    printFunctionDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.transformFunctionNameIfNeeded(name);

        const parsedArgs = node.parameters.map(param => this.printParameter(param)).join(", ");

        let modifiers = this.printModifiers(node);
        modifiers = modifiers ? modifiers + " " : modifiers;

        let returnType = this.printFunctionType(node);
        returnType = returnType ? returnType + " " : returnType;

        const fnKeyword = this.FUNCTION_TOKEN ? this.FUNCTION_TOKEN + " " : "";
        if (!fnKeyword){
            modifiers = modifiers + "public ";
        }
        const functionDef = this.getIden(identation) + modifiers + returnType + fnKeyword + name
            + "(" + parsedArgs + ")";

        return functionDef;
    }

    transformFunctionNameIfNeeded(name): string {
        return this.unCamelCaseIfNeeded(name);
    }

    printFunctionDeclaration(node, identation) {
        let functionDef = this.printFunctionDefinition(node, identation);
        const funcBody = this.printFunctionBody(node, identation);
        functionDef += funcBody;

        return this.printNodeCommentsIfAny(node, identation, functionDef);
    }

    printMethodParameters(node) {
        return node.parameters.map(param => this.printParameter(param)).join(", ");
    }

    transformMethodNameIfNeeded(name: string): string {
        return this.unCamelCaseIfNeeded(name);
    }

    printMethodDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.transformMethodNameIfNeeded(name);

        let returnType = this.printFunctionType(node);

        let modifiers = this.printModifiers(node);
        const defaultAccess = this.METHOD_DEFAULT_ACCESS ? this.METHOD_DEFAULT_ACCESS + " ": "";
        modifiers = modifiers ? modifiers + " " : defaultAccess; // tmp check this

        const parsedArgs = this.printMethodParameters(node);

        returnType = returnType ? returnType + " " : returnType;

        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
        const methodDef = this.getIden(identation) + modifiers + returnType + methodToken + name
            + "(" + parsedArgs + ")";

        return this.printNodeCommentsIfAny(node, identation, methodDef);
    }

    printMethodDeclaration(node, identation) {

        let methodDef = this.printMethodDefinition(node, identation);

        const funcBody = this.printFunctionBody(node, identation);

        methodDef += funcBody;

        return methodDef;
    }

    printStringLiteral(node) {
        const token = this.STRING_QUOTE_TOKEN;
        let text = node.text;
        if (text in this.StringLiteralReplacements) {
            return this.StringLiteralReplacements[text];
        }
        text = text.replaceAll("\b", "\\b");
        text = text.replaceAll("\f", "\\f");
        text = text.replaceAll("\n", "\\n");
        text = text.replaceAll("\r", "\\r");
        text = text.replaceAll("\t", "\\t");
        if (token === "'") {
            text = text.replaceAll("\\\"", "\""); // unscape double quotes
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

        const elements = node.elements.map((e) => {
            return this.printNode(e);
        }).join(", ");
        return this.ARRAY_OPENING_TOKEN + elements  + this.ARRAY_CLOSING_TOKEN;
    }

    printVariableDeclarationList(node,identation) {
        const declaration = node.declarations[0];
        const varToken = this.VAR_TOKEN ? this.VAR_TOKEN + " ": "";
        // const name = declaration.name.escapedText;
        const parsedValue = (declaration.initializer) ? this.printNode(declaration.initializer, identation) : this.NULL_TOKEN;
        return this.getIden(identation) + varToken + this.printNode(declaration.name) + " = " + parsedValue.trim();
    }

    printVariableStatement(node, identation){

        if (this.isCJSRequireStatement(node)) {
            return ""; // remove cjs imports
        }

        const decList = node.declarationList;
        const varStatement = this.printVariableDeclarationList(decList, identation) + this.LINE_TERMINATOR;
        return this.printNodeCommentsIfAny(node, identation, varStatement);
    }

    printOutOfOrderCallExpressionIfAny(node, identation) {
        return undefined; // stub to override
    }

    printSuperCallInsideConstructor(node, identation) {
        const args = node.arguments;

        const parsedArgs = args.map((a) => {
            return this.printNode(a, identation).trim();
        }).join(",");
        return this.SUPER_CALL_TOKEN + "(" + parsedArgs + ")";
    }

    isBuiltInFunctionCall(node) {
        const symbol = global.checker.getSymbolAtLocation(node);
        const isInLibFiles = symbol?.getDeclarations()
            ?.some(s => s.getSourceFile().fileName.includes("/node_modules/typescript/lib/"))
            ?? false;


        return isInLibFiles;
    }

    getTypesFromCallExpressionParameters(node) {
        const resolvedParams = global.checker.getResolvedSignature(node).parameters;
        const parsedTypes = [];
        resolvedParams.forEach((p) => {
            const decl = p.declarations[0];
            const type = global.checker.getTypeAtLocation(decl);
            const parsedType = this.getTypeFromRawType(type);
            parsedTypes.push(parsedType);
        });
        return parsedTypes;
    }

    printArgsForCallExpression(node, identation) {
        const args = node.arguments;

        const parsedArgs = args.map((a) => {
            return  this.printNode(a, identation).trim();
        }).join(", ");
        return parsedArgs;
    }

    // builtin functions override
    printArrayIsArrayCall(node, identation, parsedArg = undefined) {
        return undefined; // stub
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        return undefined; // stub
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        return undefined; // stub
    }

    printJsonParseCall(node, identation, parsedArg = undefined) {
        return undefined; // stub
    }

    printJsonStringifyCall(node, identation, parsedArg = undefined) {
        return undefined; // stub
    }


    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return undefined; // stub
    }

    printMathFloorCall(node, identation, parsedArg = undefined) {
        return undefined; // stub
    }

    printMathRoundCall(node, identation, parsedArg = undefined) {
        return undefined; // stub
    }

    printMathCeilCall(node, identation, parsedArg = undefined) {
        return undefined; // stub
    }

    printNumberIsIntegerCall(node, identation, parsedArg = undefined) {
        return undefined; // stub
    }

    printArrayPushCall(node, identation, name = undefined, parsedArg = undefined) {
        return undefined; // stub
    }

    printIncludesCall(node, identation, name = undefined, parsedArg = undefined) {
        return undefined; // stub
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        return undefined; // stub
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return undefined; // stub
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return undefined; // stub
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return undefined; // stub
    }

    printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
        return undefined; // stub
    }

    printTrimCall(node, identation, name = undefined) {
        return undefined; // stub
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        return undefined; // stub
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        return undefined; // stub
    }

    printToFixedCall(node, identation, name = undefined, parsedArg = undefined) {
        return undefined; // stub
    }

    printSliceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return undefined; // stub
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return undefined; // stub
    }

    printToStringCall(node, identation, name = undefined) {
        return undefined; // stub
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        return undefined; // stub
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        return undefined; // stub
    }

    printShiftCall(node, identation, name = undefined) {
        return undefined; // stub
    }

    printReverseCall(node, identation, name = undefined) {
        return undefined; // stub
    }

    printPopCall(node, identation, name = undefined) {
        return undefined; // stub
    }

    printAssertCall(node, identation, parsedArgs) {
        return `assert(${parsedArgs})`;
    }

    printDateNowCall(node, identation) {
        return undefined; // stub
    }

    printCallExpression(node, identation) {
        const expression = node.expression;

        const parsedArgs = this.printArgsForCallExpression(node, identation);

        const removeParenthesis = this.shouldRemoveParenthesisFromCallExpression(node);

        const finalExpression = this.printOutOfOrderCallExpressionIfAny(node, identation);
        if (finalExpression) {
            return finalExpression;
        }

        // check propertyAccessExpression for built in functions calls like Json.parse
        if (node.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
            const expressionText = node.expression.getText().trim();
            const args = node.arguments ?? [];

            if (args.length === 0) {
                switch(expressionText) {
                case "Date.now":
                    return this.printDateNowCall(node, identation);
                }
            }

            if (args.length === 1) {
                const parsedArg = this.printNode(args[0], 0);
                switch (expressionText) {
                case "JSON.parse":
                    return this.printJsonParseCall(node, identation, parsedArg);
                case "JSON.stringify":
                    return this.printJsonStringifyCall(node, identation, parsedArg);
                case "Array.isArray":
                    return this.printArrayIsArrayCall(node, identation, parsedArg);
                case "Object.keys":
                    return this.printObjectKeysCall(node, identation, parsedArg);
                case "Object.values":
                    return this.printObjectValuesCall(node, identation, parsedArg);
                case "Promise.all":
                    return this.printPromiseAllCall(node, identation, parsedArg);
                case "Math.round":
                    return this.printMathRoundCall(node, identation, parsedArg);
                case "Math.floor":
                    return this.printMathFloorCall(node, identation, parsedArg);
                case "Math.ceil":
                    return this.printMathCeilCall(node, identation, parsedArg);
                case "Number.isInteger":
                    return this.printNumberIsIntegerCall(node, identation, parsedArg);
                }
            }
            const rightSide = node.expression.name?.escapedText;
            const leftSide = node.expression?.expression;

            if (args.length === 0 && rightSide !== undefined && leftSide !== undefined) {
                const parsedLeftSide = this.printNode(leftSide, 0);
                switch (rightSide) {
                case "toString":
                    return this.printToStringCall(node, identation, parsedLeftSide);
                case "toUpperCase":
                    return this.printToUpperCaseCall(node, identation, parsedLeftSide);
                case "toLowerCase":
                    return this.printToLowerCaseCall(node, identation, parsedLeftSide);
                case "shift":
                    return this.printShiftCall(node, identation, parsedLeftSide);
                case "pop":
                    return this.printPopCall(node, identation, parsedLeftSide);
                case "reverse":
                    return this.printReverseCall(node, identation, parsedLeftSide);
                case "trim":
                    return this.printTrimCall(node, identation, parsedLeftSide);
                }
            }

            // handle built in functions like

            const arg = args && args.length > 0 ? args[0] : undefined;

            if (leftSide && rightSide && arg) {
                const parsedArg = this.printNode(arg, identation).trimStart();
                const secondParsedArg = args[1] ? this.printNode(args[1], identation).trimStart() : undefined;
                const name = this.printNode(leftSide, 0);
                switch(rightSide) {
                case 'push':
                    return this.printArrayPushCall(node, identation, name, parsedArg);
                case 'includes':
                    return this.printIncludesCall(node, identation, name, parsedArg);
                case 'indexOf':
                    return this.printIndexOfCall(node, identation, name, parsedArg);
                case 'join':
                    return this.printJoinCall(node, identation, name, parsedArg);
                case 'split':
                    return this.printSplitCall(node, identation, name, parsedArg);
                case 'toFixed':
                    return this.printToFixedCall(node, identation, name, parsedArg);
                case 'endsWith':
                    return this.printEndsWithCall(node, identation, name, parsedArg);
                case 'startsWith':
                    return this.printStartsWithCall(node, identation, name, parsedArg);
                case 'padEnd':
                    return this.printPadEndCall(node, identation, name, parsedArg, secondParsedArg);
                case 'padStart':
                    return this.printPadStartCall(node, identation, name, parsedArg, secondParsedArg);
                }

                if (args.length === 1 || args.length === 2) {
                    const parsedArg2 = args[1] ? this.printNode(args[1], identation).trimStart() : undefined;
                    switch(rightSide) {
                    case 'slice':
                        return this.printSliceCall(node, identation, name, parsedArg, parsedArg2);
                    case 'replace':
                        return this.printReplaceCall(node, identation, name, parsedArg, parsedArg2);
                    }
                }
            }
        }  else {
            // handle functions like assert
            const args = node.arguments ?? [];
            if (args.length === 2) {
                if ( expression.escapedText === "assert") {
                    return this.printAssertCall(node, identation, parsedArgs);
                }
                if (expression.escapedText === "padEnd") {
                    // check this
                }
            }
        }

        // print super() call inside constructor
        if (expression.kind === ts.SyntaxKind.SuperKeyword) {
            return this.printSuperCallInsideConstructor(node, identation);
        }

        let parsedExpression = undefined;
        if (this.CallExpressionReplacements.hasOwnProperty(expression.getText())) { // eslint-disable-line
            parsedExpression = this.CallExpressionReplacements[expression.getText()];
        } else {
            if (expression.kind === ts.SyntaxKind.Identifier) {
                const idValue = expression.text ?? expression.escapedText;
                parsedExpression = this.unCamelCaseIfNeeded(idValue);
            } else {
                parsedExpression = this.printNode(expression, 0);
            }
        }

        let parsedCall = parsedExpression;
        if (!removeParenthesis) {
            parsedCall+= "(" + parsedArgs + ")";

        }
        return parsedCall;
    }

    printClassBody(node, identation) {
        // const parsedMembers = node.members.map(m => this.printNode(m, identation+1));

        const parsedMembers = [];
        node.members.forEach( (m, index) => {
            const parsedNode = this.printNode(m, identation+1);
            if (m.kind  === ts.SyntaxKind.PropertyDeclaration || index === 0) {
                parsedMembers.push(parsedNode);
            } else {
                parsedMembers.push("\n".repeat(this.NUM_LINES_BETWEEN_CLASS_MEMBERS) + parsedNode);
            }
        });
        return parsedMembers.join("\n");
    }

    printClassDefinition(node, identation) {
        const className = node.name.escapedText;
        const heritageClauses = node.heritageClauses;

        let classInit = "";
        const classOpening = this.getBlockOpen(identation);
        if (heritageClauses !== undefined) {
            const classExtends = heritageClauses[0].types[0].expression.escapedText;
            classInit = this.getIden(identation) + "class " + className + " " + this.EXTENDS_TOKEN + " " + classExtends + classOpening;
        } else {
            classInit = this.getIden(identation) + "class " + className + classOpening;
        }
        return classInit;
    }

    printClass(node, identation) {

        const classDefinition = this.printClassDefinition(node, identation);

        const classBody = this.printClassBody(node, identation);

        const classClosing = this.getBlockClose(identation);

        return classDefinition + classBody + classClosing;
    }

    printConstructorDeclaration (node, identation) {
        const args = this.printMethodParameters(node);
        const constructorBody = this.printFunctionBody(node, identation);
        return this.getIden(identation) +
                this.CONSTRUCTOR_TOKEN +
                "(" + args + ")" +
                constructorBody;
    }

    printWhileStatement(node, identation) {
        const loopExpression = node.expression;

        const expression = this.printNode(loopExpression, 0);

        const whileStm = this.getIden(identation) +
                    this.WHILE_TOKEN + " " +
                    this.CONDITION_OPENING + expression + this.CONDITION_CLOSE +
                    this.printBlock(node.statement, identation);
        return this.printNodeCommentsIfAny(node, identation, whileStm);
    }

    printForStatement(node, identation) {
        const initializer = this.printNode(node.initializer, 0);
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

    printBreakStatement(node, identation) {
        const breakStm = this.getIden(identation) + this.BREAK_TOKEN + this.LINE_TERMINATOR;
        return this.printNodeCommentsIfAny(node, identation, breakStm);
    }

    printPostFixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        return this.getIden(identation) + this.printNode(operand, 0) + this.PostFixOperators[operator];
    }

    printPrefixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        if (operator === ts.SyntaxKind.ExclamationToken) {
            // not branch check falsy/turthy values if needed;
            return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
        }
        return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printNode(operand, 0);
    }

    printObjectLiteralBody(node, identation) {
        let body =  node.properties.map((p) => this.printNode(p, identation+1)).join(",\n");
        body = body ? body + "," : body;
        return body;
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

        const customRightSide = this.printCustomRightSidePropertyAssignment(initializer, identation);

        const valueAsString = customRightSide ? customRightSide : this.printNode(initializer, identation);

        let trailingComment = this.printTraillingComment(node, identation);
        trailingComment = trailingComment ? " " + trailingComment : trailingComment;

        const propOpen = this.PROPERTY_ASSIGNMENT_OPEN ? this.PROPERTY_ASSIGNMENT_OPEN  + " ": "";
        const propClose = this.PROPERTY_ASSIGNMENT_CLOSE ? " " + this.PROPERTY_ASSIGNMENT_CLOSE : "";

        return this.getIden(identation) +
                propOpen +
                nameAsString +
                this.PROPERTY_ASSIGNMENT_TOKEN + " " +
                valueAsString.trim() +
                propClose +
                trailingComment;
    }

    printElementAccessExpressionExceptionIfAny(node) {
        return undefined; // stub to override
    }

    printElementAccessExpression(node, identation) {
        // example x['test']
        const {expression, argumentExpression} = node;

        const exception = this.printElementAccessExpressionExceptionIfAny(node);
        if (exception) {
            return exception;
        }

        // when we want replace x['test'] with getValue(x, 'test') only when in the left side
        // Examples:
        // x["a"] = x["b"] : binary expression
        // const a = x["b"] : variable declaration
        const isLeftSideOfAssignment = node.parent?.kind === ts.SyntaxKind.BinaryExpression &&
                            (node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken || node.parent.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) &&
                            node.parent?.left === node;
        // to do; check nested accesses
        // const newNode = node.parent;
        // we need this loop because we might have x["t"]["test"]["key"]
        // so the parent of the node might be another ElementAccessExpression and not the binary expression/variable declaration directly
        // to do
        // while (newNode !== undefined && newNode.kind !== ts.SyntaxKind.BinaryExpression) {
        //     if (newNode.right === node) {
        //         rightSideOfAssignment = true;
        //         break;
        //     }
        //     newNode = newNode.parent;
        // }

        const expressionAsString = this.printNode(expression, 0);
        const argumentAsString = this.printNode(argumentExpression, 0);

        // c# only
        if (!isLeftSideOfAssignment && this.ELEMENT_ACCESS_WRAPPER_OPEN && this.ELEMENT_ACCESS_WRAPPER_CLOSE) {
            return `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${expressionAsString}, ${argumentAsString}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
        }
        // cast order["test"] to ((Dictionariy<string, object>)order)["test"] or List<object>
        if (isLeftSideOfAssignment && this.ELEMENT_ACCESS_WRAPPER_OPEN && this.ELEMENT_ACCESS_WRAPPER_CLOSE) {
            const type = global.checker.getTypeAtLocation(argumentExpression);
            const isString = this.isStringType(type.flags);

            let isUnionString = false; // handle unions later
            if (type.flags === ts.TypeFlags.Union) {
                isUnionString = this.isStringType(type?.types[0].flags);
            }

            if (isString || isUnionString || type.flags === ts.TypeFlags.Any) { // default to string when unknown
                const cast = ts.isStringLiteralLike(argumentExpression) ? "" : '(string)';
                return `((IDictionary<string,object>)${expressionAsString})[${cast}${argumentAsString}]`;
            }
            return `((${this.ARRAY_KEYWORD})${expressionAsString})[Convert.ToInt32(${argumentAsString})]`;
        }

        return expressionAsString + "[" + argumentAsString + "]";
    }

    printCondition (node, identation) {

        if (this.supportsFalsyOrTruthyValues) {
            // languages like php or python do not need this extra logic
            return this.printNode(node, identation);
        }

        // can be called from ifs or conditional expressions or binary expressions so might contain the ! operator
        if (node.kind  === ts.SyntaxKind.PrefixUnaryExpression && node.operator === ts.SyntaxKind.ExclamationToken) {
            return this.printPrefixUnaryExpression(node, identation); // avoid infinite recursion
        }

        let expression = this.printNode(node, 0);
        // wrap falsy/truty expressions if needed
        if ( (1+1) || (node.kind !== ts.SyntaxKind.BinaryExpression && node.kind !== ts.SyntaxKind.ParenthesizedExpression)) {

            const typeFlags = global.checker.getTypeAtLocation(node).flags;
            if ( (1+1) || typeFlags !== ts.TypeFlags.BooleanLiteral && typeFlags  !== ts.TypeFlags.Boolean) {
                expression = this.printNode(node, 0);
                // this.warn(node, node.getText(), "Falsy/Truthy expressions are not supported by this language, so adding the defined wrapper!");
                expression = `${this.FALSY_WRAPPER_OPEN}${expression}${this.FALSY_WRAPPER_CLOSE}`;
            }
        }
        return `${this.getIden(identation)}${expression}`; // stub to override
    }


    printIfStatement(node, identation) {

        const expression = this.printCondition(node.expression, 0);

        const elseExists = node.elseStatement !== undefined;
        const isElseIf = node.parent.kind === ts.SyntaxKind.IfStatement;

        const needChainBlock = elseExists;
        const ifBody = this.printBlock(node.thenStatement, identation, needChainBlock);

        let ifComplete = this.CONDITION_OPENING + expression + this.CONDITION_CLOSE + ifBody;
        if (isElseIf) {
            ifComplete = this.ELSEIF_TOKEN + " " + ifComplete;
        } else {
            ifComplete = this.getIden(identation) + this.IF_TOKEN + " " + ifComplete;
        }

        const elseStatement = node.elseStatement;
        if (elseStatement?.kind === ts.SyntaxKind.Block) {

            const elseBody = this.printBlock(elseStatement, identation);

            const elseBlock = this.ELSE_TOKEN + elseBody;

            ifComplete += elseBlock;

        } else if (elseStatement?.kind === ts.SyntaxKind.IfStatement) {
            const elseBody = this.printIfStatement(elseStatement, identation);
            ifComplete += elseBody;
        }
        return this.printNodeCommentsIfAny(node, identation, ifComplete);
    }

    printParenthesizedExpression(node, identation) {
        if (node.expression.kind === ts.SyntaxKind.AsExpression) {
            // transform (this as any) into this, () and as any are not necessary
            return this.getIden(identation) + this.printNode(node.expression, 0);
        }
        return this.getIden(identation) + this.LEFT_PARENTHESIS + this.printNode(node.expression, 0) + this.RIGHT_PARENTHESIS;
    }

    printBooleanLiteral(node) {
        if (ts.SyntaxKind.TrueKeyword === node.kind) {
            return this.TRUE_KEYWORD;
        }
        return this.FALSE_KEYWORD;
    }

    printTryStatement(node, identation) {
        const tryBody = this.printBlock(node.tryBlock, identation, true);

        const catchBody = this.printBlock(node.catchClause.block, identation);
        const catchDeclaration = this.CATCH_DECLARATION + " " + this.printNode(node.catchClause.variableDeclaration.name, 0);

        const catchCondOpen = this.CONDITION_OPENING ? this.CONDITION_OPENING : " ";

        return this.getIden(identation) + this.TRY_TOKEN +
                            tryBody +
                            this.CATCH_TOKEN + catchCondOpen + catchDeclaration + this.CONDITION_CLOSE +
                            catchBody;
    }

    printNewExpression(node, identation) {
        let expression = node.expression?.escapedText;
        expression = expression ? expression : this.printNode(node.expression); // new Exception or new exact[string] check this out
        const args = node.arguments.map(n => this.printNode(n, identation)).join(", ");
        const newToken = this.NEW_TOKEN ? this.NEW_TOKEN + " " : "";
        return newToken + expression + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
    }

    printThrowStatement(node, identation) {
        const expression = this.printNode(node.expression, 0);
        return this.getIden(identation) + this.THROW_TOKEN + " " + expression + this.LINE_TERMINATOR;
    }

    printAwaitExpression(node, identation) {
        const expression = this.printNode(node.expression, identation);
        const awaitToken = this.asyncTranspiling ? this.AWAIT_TOKEN + " " : "";
        return awaitToken + expression;
    }

    printConditionalExpression(node, identation) {
        const condition = this.printCondition(node.condition, identation);
        const whenTrue = this.printNode(node.whenTrue, 0);
        const whenFalse = this.printNode(node.whenFalse, 0);

        return condition + " ? " + whenTrue + " : " + whenFalse;
    }

    printAsExpression(node, identation) {
        return this.printNode(node.expression, identation);
    }

    getFunctionNodeFromReturn(node) {
        let parent = node.parent;
        while (parent) {
            if (parent.kind === ts.SyntaxKind.FunctionDeclaration || parent.kind === ts.SyntaxKind.MethodDeclaration) {
                return parent;
            }
            parent = parent.parent;
        }
        return undefined;
    }


    printReturnStatement(node, identation) {
        const leadingComment = this.printLeadingComments(node, identation);
        let trailingComment = this.printTraillingComment(node, identation);
        trailingComment = trailingComment ? " " + trailingComment : trailingComment;
        const exp =  node.expression;
        let rightPart = exp ? (' ' + this.printNode(exp, identation)) : '';
        rightPart = rightPart.trim();

        // cast return type if needed
        // if (false && this.requiresCallExpressionCast) {
        //     const functionNode = this.getFunctionNodeFromReturn(node);
        //     let functionType = this.getFunctionType(functionNode, false);
        //     if (functionType === undefined) {
        //         // check the parent method type if any
        //         const overrideMethod = this.getMethodOverride(functionNode);
        //         if (overrideMethod !== undefined) {
        //             functionType = this.getFunctionType(overrideMethod, false);
        //         }
        //     }
        //     if (functionType && exp?.kind !== ts.SyntaxKind.UndefinedKeyword) {
        //         rightPart = rightPart ? ' ' + `((${functionType}) (${rightPart}))` + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
        //         return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + rightPart + trailingComment;
        //     }
        // }
        rightPart = rightPart ? ' ' + rightPart + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
        return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + rightPart + trailingComment;
    }

    printArrayBindingPattern(node, identation) {
        const elements = node.elements.map((e) => this.printNode(e.name, identation)).join(", ");
        return this.getIden(identation) + this.ARRAY_OPENING_TOKEN + elements + this.ARRAY_CLOSING_TOKEN;
    }

    printBlock(node, identation, chainBlock = false) {
        const blockOpen = this.getBlockOpen(identation);
        const blockClose = this.getBlockClose(identation, chainBlock);
        const statements = node.statements.map((s) => this.printNode(s, identation+1)).join("\n");

        return blockOpen + statements + blockClose;
    }

    printExpressionStatement(node, identation) {
        if (this.isCJSModuleExportsExpressionStatement(node)) {
            return ""; // remove module.exports = ...
        }
        const exprStm = this.printNode(node.expression, identation);

        // skip empty statements
        if (exprStm.length === 0) {
            return "";
        }
        const expStatement = this.getIden(identation) + exprStm + this.LINE_TERMINATOR;
        return this.printNodeCommentsIfAny(node, identation, expStatement);
    }

    printPropertyDeclaration(node, identation) {
        let modifiers = this.printModifiers(node);
        modifiers = modifiers ? modifiers + " " : modifiers;
        const name = this.printNode(node.name, 0);
        if (node.initializer) {
            const initializer = this.printNode(node.initializer, 0);
            return this.getIden(identation) + modifiers + name + " = " + initializer + this.LINE_TERMINATOR;
        }
        return this.getIden(identation) + modifiers + name + this.LINE_TERMINATOR;
    }

    printSpreadElement(node, identation) {
        const expression = this.printNode(node.expression, 0);
        return this.getIden(identation) + this.SPREAD_TOKEN + expression;
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

    printNode(node, identation = 0): string {

        try {
            if(ts.isExpressionStatement(node)) {
                return this.printExpressionStatement(node, identation);
            } else if(ts.isBlock(node)) {
                return this.printBlock(node, identation);
            } else if (ts.isFunctionDeclaration(node)){
                return this.printFunctionDeclaration(node, identation);
            } else if (ts.isClassDeclaration(node)) {
                return this.printClass(node, identation);
            } else if (ts.isVariableStatement(node)) {
                return this.printVariableStatement(node, identation);
            } else if (ts.isMethodDeclaration(node)) {
                return this.printMethodDeclaration(node, identation);
            } else if (ts.isStringLiteral(node)) {
                return this.printStringLiteral(node);
            } else if (ts.isNumericLiteral(node)) {
                return this.printNumericLiteral(node);
            } else if (ts.isPropertyAccessExpression(node)) {
                return this.printPropertyAccessExpression(node, identation);
            } else if (ts.isArrayLiteralExpression(node)) {
                return this.printArrayLiteralExpression(node, identation);
            } else if (ts.isCallExpression(node)) {
                return this.printCallExpression(node, identation);
            } else if (ts.isWhileStatement(node)) {
                return this.printWhileStatement(node, identation);
            } else if (ts.isBinaryExpression(node)) {
                return this.printBinaryExpression(node, identation);
            } else if (ts.isBreakStatement(node)) {
                return this.printBreakStatement(node, identation);
            } else if (ts.isForStatement(node)) {
                return this.printForStatement(node, identation);
            } else if (ts.isPostfixUnaryExpression(node)) {
                return this.printPostFixUnaryExpression(node, identation);
            } else if (ts.isVariableDeclarationList(node)) {
                return this.printVariableDeclarationList(node, identation); // statements are slightly different if inside a for
            } else if (ts.isObjectLiteralExpression(node)) {
                return this.printObjectLiteralExpression(node, identation);
            } else if (ts.isPropertyAssignment(node)) {
                return this.printPropertyAssignment(node, identation);
            } else if (ts.isIdentifier(node)) {
                return this.printIdentifier(node);
            } else if (ts.isElementAccessExpression(node)) {
                return this.printElementAccessExpression(node, identation);
            } else if (ts.isIfStatement(node)) {
                return this.printIfStatement(node, identation);
            } else if (ts.isParenthesizedExpression(node)) {
                return this.printParenthesizedExpression(node, identation);
            } else if ((ts as any).isBooleanLiteral(node)) {
                return this.printBooleanLiteral(node);
            } else if (ts.SyntaxKind.ThisKeyword === node.kind) {
                return this.THIS_TOKEN;
            } else if (ts.SyntaxKind.SuperKeyword === node.kind) {
                return this.SUPER_TOKEN;
            }else if (ts.isTryStatement(node)){
                return this.printTryStatement(node, identation);
            } else if (ts.isPrefixUnaryExpression(node)) {
                return this.printPrefixUnaryExpression(node, identation);
            } else if (ts.isNewExpression(node)) {
                return this.printNewExpression(node, identation);
            } else if (ts.isThrowStatement(node)) {
                return this.printThrowStatement(node, identation);
            } else if (ts.isAwaitExpression(node)) {
                return this.printAwaitExpression(node, identation);
            } else if (ts.isConditionalExpression(node)) {
                return this.printConditionalExpression(node, identation);
            } else if (ts.isAsExpression(node)) {
                return this.printAsExpression(node, identation);
            } else if (ts.isReturnStatement(node)) {
                return this.printReturnStatement(node, identation);
            } else if (ts.isArrayBindingPattern(node)) {
                return this.printArrayBindingPattern(node, identation);
            } else if (ts.isParameter(node)) {
                return this.printParameter(node);
            } else if (ts.isConstructorDeclaration(node)) {
                return this.printConstructorDeclaration(node, identation);
            } else if (ts.isPropertyDeclaration(node)) {
                return this.printPropertyDeclaration(node, identation);
            } else if (ts.isSpreadElement(node)) {
                return this.printSpreadElement(node, identation);
            } else if (ts.SyntaxKind.NullKeyword === node.kind) {
                return this.printNullKeyword(node, identation);
            } else if (ts.isContinueStatement(node)) {
                return this.printContinueStatement(node, identation);
            } else if (ts.isDeleteExpression(node)) {
                return this.printDeleteExpression(node, identation);
            }

            if (node.statements) {
                const transformedStatements = node.statements.map((m)=> {
                    return this.printNode(m, identation + 1);
                });

                return transformedStatements.filter(st => st.length > 0 ).join("\n" + "\n".repeat(this.LINES_BETWEEN_FILE_MEMBERS)) + "\n".repeat(this.NUM_LINES_END_FILE);
            }
            return "";

        } catch (e) {
            throw new TranspilationError(this.id, e.messageText, node.getFullText(), node.pos, node.end);
        }
    }

    getFileESMImports(node): IFileImport[] {
        const result = [];
        const importStatements = node.statements.filter((s) => ts.isImportDeclaration(s));
        importStatements.forEach(node => {
            const importPath = node.moduleSpecifier.text;
            const importClause = node.importClause;
            const namedImports = importClause.namedBindings;
            if (namedImports) {
                if (namedImports.elements) {
                    // named imports
                    namedImports.elements.forEach((elem) => {
                        const name = elem.name.text;
                        const fileImport: IFileImport = {
                            name,
                            path: importPath,
                            isDefault: false
                        };
                        result.push(fileImport);
                    });
                } else {
                    // namespace import (import * as name from 'path')
                    const name = namedImports.name.escapedText;
                    const fileImport: IFileImport = {
                        name,
                        path: importPath,
                        isDefault: false
                    };
                    result.push(fileImport);
                }

            } else {
                // default import
                const name = importClause.name.text;
                const fileImport: IFileImport = {
                    name,
                    path: importPath,
                    isDefault: true
                };
                result.push(fileImport);
            }
        });
        return result;
    }

    isCJSRequireStatement(node): boolean {
        const dec = node.declarationList.declarations[0];
        return dec.initializer && ts.isCallExpression(dec.initializer) && dec.initializer.expression.getText() === "require";
    }

    isCJSModuleExportsExpressionStatement(node): boolean {
        if (node.expression && node.expression.kind === ts.SyntaxKind.BinaryExpression ) {
            if (node.expression.left.kind === ts.SyntaxKind.PropertyAccessExpression) {
                const left = node.expression.left as ts.PropertyAccessExpression;
                return left.expression.getText() === "module" && left.name.getText() === "exports";
            }
        }
        return false;
    }

    getCJSImports(node): IFileImport[] {
        const result = [];
        const varStatements = node.statements.filter(s => ts.isVariableStatement(s));
        const decList = varStatements.map(s => s.declarationList);
        const dec = decList.map(d => d.declarations[0]);

        dec.forEach(decNode => {
            if (decNode.initializer && decNode.initializer.kind === ts.SyntaxKind.CallExpression) {
                const callExpression = decNode.initializer.expression.getText();
                if (callExpression === "require") {
                    const isDefault = decNode.name.kind === ts.SyntaxKind.Identifier;
                    const importPath = decNode.initializer.arguments[0].text;
                    if (isDefault) {
                        const name = decNode.name.text;
                        const fileImport: IFileImport = {
                            name,
                            path: importPath,
                            isDefault: isDefault
                        };
                        result.push(fileImport);
                    } else {
                        const elems = decNode.name.elements;
                        elems.forEach(elem => {
                            const name = elem.name.text;
                            const fileImport: IFileImport = {
                                name,
                                path: importPath,
                                isDefault: false,
                            };
                            result.push(fileImport);
                        });
                    }
                }
            }
        });

        return result;
    }

    getFileImports(node): IFileImport[] {
        const esmImports = this.getFileESMImports(node);
        if (esmImports.length > 0) {
            return esmImports;
        }
        const cjsImports = this.getCJSImports(node);
        return cjsImports;
    }

    getESMExports(node): IFileExport[] {
        const result = [];
        const namedExports = node.statements.filter((s) => ts.isExportDeclaration(s));
        const defaultExport = node.statements.filter((s) => ts.isExportAssignment(s));

        namedExports.forEach(node => {
            const namedExports = node.exportClause;
            if (namedExports) {
                namedExports.elements.forEach((elem) => {
                    const name = elem.name.text;
                    const fileExport: IFileExport = {
                        name,
                        isDefault: false
                    };
                    result.push(fileExport);
                });
            }
        });

        defaultExport.forEach(node => {
            const name = node.expression.getText();
            const fileExport: IFileExport = {
                name,
                isDefault: true
            };
            result.push(fileExport);
        });
        return result;
    }

    getCJSExports(node): IFileExport[] {
        const result = [];
        const moduleExports = node.statements.filter(s => this.isCJSModuleExportsExpressionStatement(s)).map(s => s.expression as ts.BinaryExpression);

        moduleExports.forEach(node => {
            const right = node.right;
            if (right.kind === ts.SyntaxKind.ObjectLiteralExpression) {
                const props = right.properties;
                props.forEach(prop => {
                    const name = prop.name.getText();
                    const fileExport: IFileExport = {
                        name,
                        isDefault: false
                    };
                    result.push(fileExport);
                });
            }
            if (right.kind === ts.SyntaxKind.Identifier) {
                const name = right.getText();
                const fileExport: IFileExport = {
                    name,
                    isDefault: true
                };
                result.push(fileExport);
            }
        });
        return result;
    }

    getExportDeclarations(node): IFileExport[] {
        // example export default class X
        const result = [];
        const classDeclarations = node.statements.filter((s) => ts.isClassDeclaration(s));
        const functionDeclarations = node.statements.filter((s) => ts.isFunctionDeclaration(s));

        const both = classDeclarations.concat(functionDeclarations);
        both.forEach(classNode => {
            const modifiers = classNode.modifiers;
            if (modifiers) {
                const isDefault = modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
                if (isDefault) {
                    const name = classNode.name.text;
                    const fileExport: IFileExport = {
                        name,
                        isDefault: true
                    };
                    result.push(fileExport);
                }
            }
        });
        return result;
    }

    getFileExports(node): IFileExport[] {
        const defaultClassAndFunctionsExports = this.getExportDeclarations(node);
        const esmExports = this.getESMExports(node).concat(defaultClassAndFunctionsExports);
        if (esmExports.length > 0) {
            return esmExports;
        }
        return this.getCJSExports(node);
    }

    getReturnTypeFromMethod(node): string {
        // first try custom type

        const bType = global.checker.getTypeAtLocation(node);
        // const func2Symbol = bType.getProperty("test1")!;
        const func2Type = global.checker.getTypeOfSymbolAtLocation(bType.symbol, bType.symbol.valueDeclaration);
        const func2Signature = global.checker.getSignaturesOfType(func2Type, ts.SignatureKind.Call)[0];
        const rawType = func2Signature.getReturnType();
        // const parsed = ts.TypeFlags[rawType.flags];
        // console.log(parsed);
        const res = global.checker.typeToString(rawType); // C
        if (res === undefined) {
            const name = node.type?.typeName?.escapedText;
            if (name){
                return name as string;
            }
        }
        return res;
    }

    getParameterType(node): IParameterType {
        const isOptional = node.questionToken !== undefined;

        const result: IParameterType = {
            name: node.name.getText(),
            isOptional: isOptional,
            type: undefined
        };

        if (node.initializer !== undefined) {
            result.initializer = node.initializer.getText();
        }

        // first try custom type
        if (node.type === undefined) {
            // does not have a type or uses a initializer
            if (node.initializer !== undefined) {
                const type = global.checker.getTypeAtLocation(node.initializer);
                const res = global.checker.typeToString(type); // C
                // console.log("initializer", res);
                // result.initializer = node.initializer.text;
                result.type = ts.TypeFlags[type.flags];
                return result;
            }
        }

        const name = node.type?.typeName?.escapedText;
        if (name){
            result.type = name as string;
            if (node.initializer !== undefined) {
                result.initializer = node.initializer.text;
            }
            return result;
        }

        if (node.type != undefined) {
            const type = global.checker.getTypeAtLocation(node.type);
            const res = global.checker.typeToString(type); // C
            result.type = res as string;
            return result;
        }
        return result;
    }

    getMethodTypes(file): IMethodType[] {
        const result: IMethodType[] = [];
        if (!file.statements) {
            return result;
        }
        const classDeclarations = file.statements.filter((s) => ts.isClassDeclaration(s));
        classDeclarations.forEach((node) => {
            const methods = node.members.filter((m) => ts.isMethodDeclaration(m));
            methods.forEach(m => {
                const isAsync = this.isAsyncFunction(m);
                const name = m.name.getText();
                const returnType = this.getReturnTypeFromMethod(m);
                const parameters = (m as any).parameters;
                // const paramTypes:IParameterType[] = parameters.map((p) => this.getParameterType(p));
                const paramTypes:IParameterType[] = [];
                parameters.forEach((p) => {
                    const res = this.getParameterType(p);
                    paramTypes.push(res);
                });
                result.push({
                    name,
                    async:isAsync,
                    returnType,
                    parameters: paramTypes
                });
            });
        });

        return result;
    }
}

export {
    BaseTranspiler
};
