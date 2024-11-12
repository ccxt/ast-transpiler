import { BaseTranspiler } from "./baseTranspiler.js";
import ts, { TypeChecker } from 'typescript';
import { unCamelCase, regexAll } from "./utils.js";
import { Logger } from "./logger.js";

const SyntaxKind = ts.SyntaxKind;

const parserConfig = {
    'ELSEIF_TOKEN': 'elseif',
    'THIS_TOKEN': '$this',
    'PROPERTY_ACCESS_TOKEN': '->',
    'UNDEFINED_TOKEN': 'null',
    'NOT_TOKEN': '!',
    'LINE_TERMINATOR': ';',
    'ARRAY_OPENING_TOKEN':"[",
    'ARRAY_CLOSING_TOKEN':"]",
    'OBJECT_OPENING':"array(",
    'OBJECT_CLOSING':")",
    'FUNCTION_TOKEN': 'function',
    'ASYNC_TOKEN': '',
    'PROPERTY_ASSIGNMENT_TOKEN': ' =>',
    'NEW_TOKEN': 'new',
    'THROW_TOKEN': 'throw',
    'SUPER_TOKEN': 'parent',
    'CONSTRUCTOR_TOKEN': 'function __construct',
    'SUPER_CALL_TOKEN': 'parent::__construct',
    'CATCH_DECLARATION': 'Exception',
    'CATCH_TOKEN': 'catch',
    'BLOCK_OPENING_TOKEN' :'{',
    'BLOCK_CLOSING_TOKEN' :'}',
    'CONDITION_OPENING' :'(',
    'CONDITION_CLOSE' :')',
    'PLUS_PLUS_TOKEN': '++',
    'MINUS_MINUS_TOKEN': '--',
    'SPACE_DEFAULT_PARAM': ' ',
    'EXCLAMATION_EQUALS_EQUALS_TOKEN': '!==',
    'EQUALS_EQUALS_EQUALS_TOKEN': '===',
    'STRING_QUOTE_TOKEN': '\'',
    'EXTENDS_TOKEN': 'extends',
};

export class PhpTranspiler extends BaseTranspiler {
    awaitWrapper;
    propRequiresScopeResolutionOperator: string[];
    AWAIT_WRAPPER_OPEN;
    AWAIT_WRAPPER_CLOSE;
    ASYNC_FUNCTION_WRAPPER_OPEN = "";
    constructor(config = {}) {

        config['parser'] = Object.assign ({}, parserConfig, config['parser'] ?? {});

        super(config);
        this.id = "php";
        this.asyncTranspiling = config['async'] ?? true;
        this.uncamelcaseIdentifiers = config['uncamelcaseIdentifiers'] ?? false;
        this.removeVariableDeclarationForFunctionExpression = config['removeFunctionAssignToVariable'] ?? false;
        this.includeFunctionNameInFunctionExpressionDeclaration = config['includeFunctionNameInFunctionExpressionDeclaration'] ?? false;

        this.propRequiresScopeResolutionOperator = ['super'] + (config['ScopeResolutionProps'] ?? []);

        this.initConfig();

        // user overrides
        this.applyUserOverrides(config);

        // const propertyAccessRemoval = config['PropertyAccessRequiresParenthesisRemoval'] ?? [];
        // this.PropertyAccessRequiresParenthesisRemoval.push(...propertyAccessRemoval);

        this.AWAIT_WRAPPER_OPEN = config['AWAIT_WRAPPER_OPEN'] ?? "Async\\await(";
        this.AWAIT_WRAPPER_CLOSE = config['AWAIT_WRAPPER_CLOSE'] ??  ")";
    }

    printAwaitExpression(node, identation) {
        const expression = this.printNode(node.expression, identation);

        if (!this.asyncTranspiling) {
            return expression;
        }

        return this.AWAIT_WRAPPER_OPEN + expression + this.AWAIT_WRAPPER_CLOSE;
    }

    transformIdentifier(node, identifier) {
        if (this.uncamelcaseIdentifiers) {
            identifier = this.unCamelCaseIfNeeded(identifier);
        }

        // Get the symbol for the identifier
        const symbol = global.checker.getSymbolAtLocation(node);

        // Check if the symbol references a function declaration or expression
        if (symbol && symbol.valueDeclaration) {
            const valueDecl = symbol.valueDeclaration;

            // Check if it's a function (FunctionDeclaration, FunctionExpression, ArrowFunction)
            if (ts.isFunctionDeclaration(valueDecl) || ts.isFunctionExpression(valueDecl) || ts.isArrowFunction(valueDecl)) {
                // Check if the identifier is passed as an argument in a function call
                if (node.parent && ts.isCallExpression(node.parent) && node.parent.arguments.includes(node)) {
                    return `'${identifier}'`;  // Transpile function reference as string
                }
            }
        }

        // below is commented, due to : https://github.com/ccxt/ast-transpiler/pull/15
        //
        // If the identifier is a function parameter (callback), it should remain a variable with `$` prefix
        // if (node.parent && (ts.isParameter(node.parent) || (ts.isCallExpression(node.parent) && ts.isIdentifier(node)))) {
        //     return "$" + identifier;
        // }

        // Default case: prepend $ for variables (non-functions), unless it's a class or constant
        if (!this.startsWithUpperCase(identifier)) {
            return "$" + identifier;  // Prepend $ for variable names
        }

        return identifier;
    }


    getCustomOperatorIfAny(left, right, operator) {
        const STRING_CONCAT = '.';
        const PLUS_EQUALS_TOKEN = '.=';
        if (operator.kind == SyntaxKind.PlusToken || operator.kind == SyntaxKind.PlusEqualsToken) {

            const TOKEN = operator.kind == SyntaxKind.PlusToken ? STRING_CONCAT : PLUS_EQUALS_TOKEN;

            if (left.kind == SyntaxKind.StringLiteral || right.kind == SyntaxKind.StringLiteral) {
                return TOKEN;
            }

            const leftType = global.checker.getTypeAtLocation(left);
            const rightType = global.checker.getTypeAtLocation(right);

            if (leftType.flags === ts.TypeFlags.String || rightType.flags === ts.TypeFlags.String) {
                return TOKEN;
            }
            if (leftType.flags === ts.TypeFlags.StringLiteral || rightType.flags === ts.TypeFlags.StringLiteral) {
                return TOKEN;
            }
        }
        return undefined;
    }

    printLengthProperty(node, identation, name = undefined) {
        const leftSide = this.printNode(node.expression, 0);
        const type = (global.checker as TypeChecker).getTypeAtLocation(node.expression); // eslint-disable-line
        this.warnIfAnyType(node, type.flags, leftSide, "length");
        return this.isStringType(type.flags) ? `strlen(${leftSide})` : `count(${leftSide})`;
    }

    printPopCall(node, identation, name = undefined) {
        return `array_pop(${name})`;
    }

    printReverseCall(node, identation, name = undefined) {
        return `${name} = array_reverse(${name})`;
    }

    printShiftCall(node, identation, name = undefined) {
        return `array_shift(${name})`;
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        return `strtolower(${name})`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        return `strtoupper(${name})`;
    }

    printToStringCall(node, identation, name = undefined) {
        return `((string) ${name})`;
    }

    printArrayIsArrayCall(node, identation, parsedArg = undefined) {
        return `gettype(${parsedArg}) === 'array' && array_is_list(${parsedArg})`;
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        return `is_array(${parsedArg}) ? array_keys(${parsedArg}) : array()`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        return `is_array(${parsedArg}) ? array_values(${parsedArg}) : array()`;
    }

    printJsonParseCall(node, identation, parsedArg?) {
        return `json_decode(${parsedArg}, $as_associative_array = true)`;
    }

    printJsonStringifyCall(node: any, identation: any, parsedArg?: any) {
        return `json_encode(${parsedArg})`;
    }

    printArrayPushCall(node, identation, name = undefined, parsedArg = undefined) {
        return `${name}[] = ${parsedArg}`;
    }

    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return `Promise\\all(${parsedArg})`;
    }

    printMathCeilCall(node, identation, parsedArg = undefined) {
        return `((int) ceil(${parsedArg}))`;
    }

    printNumberIsIntegerCall(node, identation, parsedArg?) {
        return `is_int(${parsedArg})`;
    }

    printMathRoundCall(node, identation, parsedArg = undefined) {
        return `((int) round(${parsedArg}))`;
    }

    printMathFloorCall(node: any, identation: any, parsedArg?: any) {
        return `((int) floor(${parsedArg}))`;
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `str_replace(${parsedArg}, ${parsedArg2}, ${name})`;
    }

    printIncludesCall(node, identation, name = undefined, parsedArg = undefined) {
        // "ol".includes("o") -> str_contains("ol", "o") or [12,3,4].includes(3) -> in_array(3, [12,3,4])
        const leftSide = node.expression?.expression;
        const leftSideText = this.printNode(leftSide, 0);
        const type = global.checker.getTypeAtLocation(leftSide); // eslint-disable-line
        this.warnIfAnyType(node, type.flags, leftSideText, "includes");
        this.warnIfAnyType(node, type.flags, leftSideText, "includes");
        if (this.isStringType(type.flags)) {
            return `str_contains(${name}, ${parsedArg})`;
        } else {
            return `in_array(${parsedArg}, ${name})`;
        }
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        const leftSide = node.expression?.expression;
        const leftSideText = this.printNode(leftSide, 0);
        const type = global.checker.getTypeAtLocation(leftSide); // eslint-disable-line
        this.warnIfAnyType(node, type.flags, leftSideText, "indexOf");
        if (this.isStringType(type.flags)) {
            return `mb_strpos(${name}, ${parsedArg})`;
        } else {
            return `array_search(${parsedArg}, ${name})`;
        }
    }

    printSearchCall(node, identation, name = undefined, parsedArg = undefined) {
        return `mb_strpos(${name}, ${parsedArg})`;
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `str_starts_with(${name}, ${parsedArg})`;
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `str_ends_with(${name}, ${parsedArg})`;
    }

    printTrimCall(node, identation, name = undefined) {
        return `trim(${name})`;
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        return `implode(${parsedArg}, ${name})`;
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        return `explode(${parsedArg}, ${name})`;
    }

    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any) {
        return `array_merge(${name}, ${parsedArg})`;
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return `str_pad(${name}, ${parsedArg}, ${parsedArg2}, STR_PAD_RIGHT)`;
    }

    printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
        return `str_pad(${name}, ${parsedArg}, ${parsedArg2}, STR_PAD_LEFT)`;
    }

    printDateNowCall(node, identation) {
        return "round(microtime(true) * 1000)";
    }

    printInstanceOfExpression(node, identation) {
        // const left = this.printNode(node.left, 0);
        // const right = this.printNode(node.right, 0);
        const left = node.left.escapedText;
        const right = node.right.escapedText;
        return this.getIden(identation) + "$"+left+" instanceof "+right+"";
    }

    printDeleteExpression(node, identation) {
        const expression = this.printNode (node.expression, 0);
        return `unset(${expression})`;
    }

    getExceptionalAccessTokenIfAny(node) {
        const leftSide = node.expression.escapedText ?? node.expression.getFullText().trim();

        if (!leftSide) {
            return undefined;
        }

        if (this.propRequiresScopeResolutionOperator.includes(leftSide)) {
            return "::";
        }
        return undefined;
    }

    handleTypeOfInsideBinaryExpression(node, identation) {
        const left = node.left;
        const right = node.right.text;
        const op = node.operatorToken.kind;
        const expression = left.expression;

        const isDifferentOperator = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
        const notOperator = isDifferentOperator ? this.NOT_TOKEN : "";

        const opComp = isDifferentOperator ? this.EXCLAMATION_EQUALS_EQUALS_TOKEN : this.EQUALS_EQUALS_EQUALS_TOKEN;

        switch (right) {
        case "string":
            return this.getIden(identation) + notOperator + "is_string(" + this.printNode(expression, 0) + ")";
        case "number":
            return this.getIden(identation) + notOperator + "(is_int(" + this.printNode(expression, 0) + ") || is_float(" + this.printNode(expression, 0) + "))";
        case "boolean":
            return this.getIden(identation) + notOperator + "is_bool(" + this.printNode(expression, 0) + ")";
        case "object":
            return this.getIden(identation) + notOperator + "is_array(" + this.printNode(expression, 0) + ")";
        case "undefined":
            return this.getIden(identation) + this.printNode(expression, 0) + " " + opComp + " null";
        }

        return undefined;

    }

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right.text;

        const op = node.operatorToken.kind;

        if (left.kind === SyntaxKind.TypeOfExpression) {
            // handle typeof operator
            // Example: typeof a === "string"
            const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
            if (typeOfExpression) {
                return typeOfExpression;
            }
        }

        if (op === ts.SyntaxKind.InKeyword) {
            const rightSide = this.printNode(node.right, 0);
            const leftSide = this.printNode(node.left, 0);
            return `${this.getIden(identation)}is_array(${rightSide}) && array_key_exists(${leftSide}, ${rightSide})`;
        }

        const prop = node?.left?.expression?.name?.text;

        if (prop) {
            const args = left.arguments;
            const parsedArg =  (args && args.length > 0) ? this.printNode(args[0], 0): undefined;
            const leftSideOfIndexOf = left.expression.expression;  // myString in myString.indexOf
            const leftSide = this.printNode(leftSideOfIndexOf, 0);
            const rightType = global.checker.getTypeAtLocation(leftSideOfIndexOf); // type of myString in myString.indexOf ("b") >= 0;
            switch(prop) {
            case 'indexOf':
                if (op === SyntaxKind.GreaterThanEqualsToken && right === '0') {
                    this.warnIfAnyType(node, rightType.flags,leftSide, "indexOf");
                    if (this.isStringType(rightType.flags)) {
                        return this.getIden(identation) + "mb_strpos(" + leftSide + ", " + parsedArg + ") !== false";
                    } else {
                        return this.getIden(identation) + "in_array(" + parsedArg + ", " + leftSide + ")";
                    }
                }
            }
        }
        return undefined;
    }

    printFunctionDeclaration(node, identation) {
        let functionDef = this.printFunctionDefinition(node, identation);
        const funcBody = this.printFunctionBody(node, identation);
        functionDef += funcBody;

        return this.printNodeCommentsIfAny(node, identation, functionDef);
    }

    printFunctionBody(node, identation) {

        if (this.asyncTranspiling && this.isAsyncFunction(node)) {
            const blockOpen = this.getBlockOpen(identation);
            const blockClose = this.getBlockClose(identation);

            const parsedArgs = node.parameters.map(param => this.printParameter(param, false)).join(", ");
            const params = parsedArgs ? " use (" + parsedArgs + ")" : "";

            const bodyStms = [...node.body.statements];
            const firstBodyStm = this.printNode(bodyStms[0], identation+2);
            bodyStms.shift();
            const funcBody = bodyStms.map((s) => this.printNode(s, identation+2)).join("\n");

            // reformat first comment
            const bodyParts = firstBodyStm.split("\n");
            const commentPart = bodyParts.filter(line => this.isComment(line));
            const isComment = commentPart.length > 0;
            let header = this.getIden(identation+1) +  "return Async\\async(function ()" + params + " {\n";
            if (isComment) {
                const commentPartString = commentPart.map((c) => this.getIden(identation+1) + c.trim()).join("\n");
                const firstStmNoComment = bodyParts.filter(line => !this.isComment(line)).join("\n");
                header = commentPartString + "\n" + header + firstStmNoComment + "\n";
            } else {
                header += firstBodyStm + "\n";
            }

            const result = header
            + funcBody + "\n"
            + this.getIden(identation+1) + "}) ();";

            return blockOpen + result + blockClose;
        }
        return super.printFunctionBody(node, identation);
    }

    printPropertyAccessModifiers(node) {
        const modifiers = super.printPropertyAccessModifiers(node);
        return modifiers ? modifiers : "public "; // default to public
    }

    transformLeadingComment(comment) {
        const commentRegex = [
            [ /\{([\]\[\|a-zA-Z0-9_-]+?)\}/g, '~$1~' ], // eslint-disable-line -- resolve the "arrays vs url params" conflict (both are in {}-brackets)
            [ /\[([^\]\[]*)\]\{(@link .*)\}/g, '~$2 $1~' ], // eslint-disable-line -- docstring item with link
            [ /\s+\* @method/g, '' ], // docstring @method
            [ /(\s+)\* @description (.*)/g, '$1\* $2' ], // eslint-disable-line
            [ /\s+\* @name .*/g, '' ], // docstring @name
            [ /(\s+)\* @returns/g, '$1\* @return' ], // eslint-disable-line
            [ /\~([\]\[\|@\.\s+\:\/#\-a-zA-Z0-9_-]+?)\~/g, '{$1}' ], // eslint-disable-line -- resolve the "arrays vs url params" conflict (both are in {}-brackets)
            [ /(\s+ \* @(param|return) {[^}]*)object([^}]*}.*)/g, '$1array$3' ], // docstring type conversion
        ];

        const transformed = regexAll(comment, commentRegex);

        return transformed;
    }

    initConfig() {
        this.LeftPropertyAccessReplacements = {
            'this': '$this',
        };

        this.RightPropertyAccessReplacements = {

        };

        this.FullPropertyAccessReplacements = {
            'Number.MAX_SAFE_INTEGER': 'PHP_INT_MAX',
            'JSON.stringify': 'json_encode',
            'console.log': 'var_dump',
            'process.exit': 'exit',
            'Math.log': 'log',
            'Math.abs': 'abs',
            'Math.floor': '(int) floor',
            'Math.ceil': '(int) ceil',
            'Math.round': '(int) round',
            'Math.pow': 'pow',
            'Math.min': 'min',
            'Math.max': 'max',
            // 'Promise.all': 'Promise\\all',
        };

        this.CallExpressionReplacements = {
            'parseFloat': 'floatval',
            'parseInt': 'intval',
        };

        this.PropertyAccessRequiresParenthesisRemoval = [
            // 'length',
            // 'toString',
            // 'toUpperCase',
            // 'toLowerCase',
            // 'pop',
            // 'reverse',
            // 'shift',
        ];
    }

}
