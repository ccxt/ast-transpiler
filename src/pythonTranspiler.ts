import { BaseTranspiler } from "./baseTranspiler.js";
import { regexAll } from "./utils.js";
import ts from 'typescript';

const SyntaxKind = ts.SyntaxKind;

const parserConfig = {
    'STATIC_TOKEN': '', // to do static decorator
    'PUBLIC_KEYWORD': '',
    'UNDEFINED_TOKEN': 'None',
    'IF_TOKEN': 'if',
    'ELSE_TOKEN': 'else',
    'ELSEIF_TOKEN': 'elif',
    'THIS_TOKEN': 'self',
    'AMPERSTAND_APERSAND_TOKEN': 'and',
    'BAR_BAR_TOKEN': 'or',
    'SPACE_DEFAULT_PARAM': '',
    'BLOCK_OPENING_TOKEN': ':',
    'BLOCK_CLOSING_TOKEN': '',
    'SPACE_BEFORE_BLOCK_OPENING': '',
    'CONDITION_OPENING': '',
    'CONDITION_CLOSE': '',
    'TRUE_KEYWORD': 'True',
    'FALSE_KEYWORD': 'False',
    'THROW_TOKEN': 'raise',
    'NOT_TOKEN': 'not ',
    'PLUS_PLUS_TOKEN': ' += 1',
    'MINUS_MINUS_TOKEN': ' -= 1',
    'CONSTRUCTOR_TOKEN': 'def __init__',
    'SUPER_CALL_TOKEN': 'super().__init__',
    'PROPERTY_ASSIGNMENT_TOKEN': ':',
    'FUNCTION_TOKEN': 'def',
    'SUPER_TOKEN': 'super()',
    'NEW_TOKEN': '',
    'STRING_QUOTE_TOKEN': '\'',
    'LINE_TERMINATOR': '',
    'METHOD_TOKEN': 'def',
    'CATCH_TOKEN': 'except',
    'CATCH_DECLARATION': 'Exception as',
    'METHOD_DEFAULT_ACCESS': '',
    'SPREAD_TOKEN': '*',
    'NULL_TOKEN': 'None',
};
export class PythonTranspiler extends BaseTranspiler {
    constructor(config = {}) {

        config['parser'] = Object.assign ({}, parserConfig, config['parser'] ?? {});

        super(config);
        this.id = "python";

        this.initConfig();
        this.asyncTranspiling = config['async'] ?? true;
        this.uncamelcaseIdentifiers = config['uncamelcaseIdentifiers'] ?? true;

        // user overrides
        this.applyUserOverrides(config);
    }

    initConfig() {
        this.LeftPropertyAccessReplacements = {
            'this': 'self'
        };
        this.RightPropertyAccessReplacements = {
            'push': 'append',
            'toUpperCase': 'upper',
            'toLowerCase': 'lower',
            // 'parseFloat': 'float',
            // 'parseInt': 'int',
            'indexOf': 'find',
            'padEnd': 'ljust',
            'padStart': 'rjust'
        };
        this.FullPropertyAccessReplacements = {
            'console.log': 'print',
            'JSON.stringify': 'json.dumps',
            'JSON.parse': 'json.loads',
            'Math.log': 'math.log',
            'Math.abs': 'abs',
            'Math.min': 'min',
            'Math.max': 'max',
            'Math.ceil': 'math.ceil',
            'Math.round': 'math.round',
            'Math.floor': 'math.floor',
            'Math.pow': 'math.pow',
            'process.exit': 'sys.exit',
            'Number.MAX_SAFE_INTEGER': 'float(\'inf\')',
        };
        this.CallExpressionReplacements = {
            'parseInt': 'int',
            'parseFloat': 'float',
        };

        this.PropertyAccessRequiresParenthesisRemoval = [
            // 'length',
            // 'toString',
        ];
    }

    printArrayIsArrayCall(node, identation, parsedArg = undefined) {
        return  `isinstance(${parsedArg}, list)`;
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        return  `list(${parsedArg}.keys())`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        return  `list(${parsedArg}.values())`;
    }

    printPromiseAllCall(node, identation, parsedArg) {
        return `asyncio.gather(*${parsedArg})`;
    }

    printMathFloorCall(node, identation, parsedArg = undefined) {
        return `int(math.floor(${parsedArg}))`;
    }

    printMathCeilCall(node, identation, parsedArg = undefined) {
        return `int(math.ceil(${parsedArg}))`;
    }

    printNumberIsIntegerCall(node, identation , parsedArg = undefined) {
        return `isinstance(${parsedArg}, int)`;
    }

    printMathRoundCall(node, identation, parsedArg = undefined) {
        return `int(round(${parsedArg}))`;
    }

    printIncludesCall(node, identation, name?, parsedArg?) {
        return `${parsedArg} in ${name}`;
    }

    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any) {
        return `${parsedArg}.join(${name})`;
    }

    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any) {
        return `${name}.split(${parsedArg})`;
    }

    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any) {
        return `${name} + ${parsedArg}`;
    }

    printPopCall(node: any, identation: any, name?: any) {
        return `${name}.pop()`;
    }

    printShiftCall(node: any, identation: any, name?: any) {
        return `${name}.pop(0)`;
    }

    printReverseCall(node, identation, name = undefined) {
        return `${name}.reverse()`;
    }

    printArrayPushCall(node, identation, name, parsedArg) {
        return `${name}.append(${parsedArg})`;
    }

    printToStringCall(node, identation, name = undefined) {
        return `str(${name})`;
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        return `${name}.find(${parsedArg})`;
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `${name}.startswith(${parsedArg})`;
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `${name}.endswith(${parsedArg})`;
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return `${name}.ljust(${parsedArg}, ${parsedArg2})`;
    }

    printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
        return `${name}.rjust(${parsedArg}, ${parsedArg2})`;
    }

    printTrimCall(node, identation, name = undefined) {
        return `${name}.strip()`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        return `${name}.upper()`;
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        return `${name}.lower()`;
    }

    printJsonParseCall(node: any, identation: any, parsedArg?: any) {
        return `json.loads(${parsedArg})`;
    }

    printJsonStringifyCall(node: any, identation: any, parsedArg?: any) {
        return `json.dumps(${parsedArg})`;
    }

    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any) {
        return `${name}.replace(${parsedArg}, ${parsedArg2})`;
    }

    printElementAccessExpressionExceptionIfAny(node) {
        if (node.expression.kind === SyntaxKind.ThisKeyword) {
            return "getattr(self, " + this.printNode(node.argumentExpression, 0) + ")";
        }
    }

    printAssertCall(node, identation, parsedArgs) {
        return `assert ${parsedArgs}`;
    }

    printDateNowCall(node, identation) {
        return "int(time.time() * 1000)";
    }


    printForStatement(node, identation) {
        const varName = node.initializer.declarations[0].name.escapedText;
        const initValue = this.printNode(node.initializer.declarations[0].initializer, 0);
        const roofValue = this.printNode(node.condition.right,0);

        const forStm =  this.getIden(identation) + this.FOR_TOKEN +  " " + varName + " in range(" + initValue + ", " + roofValue + "):\n" + node.statement.statements.map(st => this.printNode(st, identation+1)).join("\n");
        return this.printNodeCommentsIfAny(node, identation, forStm);
    }

    transformLeadingComment(comment) {
        const commentRegex = [
            [ /(^|\s)\/\//g, '$1#' ], // regular comments
                [ /\/\*\*/, '\"\"\"' ], // eslint-disable-line
                [ / \*\//, '\"\"\"' ], // eslint-disable-line
                [ /\[([^\[\]]*)\]\{@link (.*)\}/g, '`$1 <$2>`' ], // eslint-disable-line
            [ /\s+\* @method/g, '' ], // docstring @method
            [ /(\s+) \* @description (.*)/g, '$1$2' ], // docstring description
            [ /\s+\* @name .*/g, '' ], // docstring @name
            [ /(\s+) \* @see( .*)/g, '$1see$2' ], // docstring @see
            [ /(\s+ \* @(param|returns) {[^}]*)string([^}]*}.*)/g, '$1str$3' ], // docstring type conversion
            [ /(\s+ \* @(param|returns) {[^}]*)object([^}]*}.*)/g, '$1dict$3' ], // doctstrubg type conversion
                [ /(\s+) \* @returns ([^\{])/g, '$1:returns: $2' ], // eslint-disable-line
            [ /(\s+) \* @returns \{(.+)\}/g, '$1:returns $2:' ], // docstring return
                [ /(\s+ \* @param \{[\]\[\|a-zA-Z]+\} )([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+) (.*)/g, '$1$2[\'$3\'] $4' ], // eslint-disable-line
                [ /(\s+) \* @([a-z]+) \{([\]\[a-zA-Z\|]+)\} ([a-zA-Z0-9_\-\.\[\]\']+)/g, '$1:$2 $3 $4:' ],  // eslint-disable-line
        ];

        const transformed = regexAll(comment, commentRegex);
        return transformed;
    }

    transformTrailingComment(comment) {
        const commentRegex = [
            [ /(^|\s)\/\//g, '$1#' ], // regular comments
        ];

        const transformed = regexAll(comment, commentRegex);
        return " " + transformed;
    }

    transformPropertyAcessExpressionIfNeeded(node: any) {
        const expression = node.expression;
        const leftSide = this.printNode(expression, 0);
        const rightSide = node.name.escapedText;

        let rawExpression = undefined;

        if (rightSide === "length") {
            rawExpression =  "len(" + leftSide + ")";
        } else if (rightSide === "toString") {
            rawExpression = "str(" + leftSide + ")";
        }
        return rawExpression;
    }

    printClassDefinition(node: any, identation: any): string {
        const className = node.name.escapedText;
        const heritageClauses = node.heritageClauses;

        let classInit = "";
        if (heritageClauses !== undefined) {
            const classExtends = heritageClauses[0].types[0].expression.escapedText;
            classInit = this.getIden(identation) + "class " + className + "(" + classExtends + "):\n";
        } else {
            classInit = this.getIden(identation) + "class " + className + ":\n";
        }
        return classInit;
    }

    printMethodParameters(node) {
        let parsedArgs = super.printMethodParameters(node);
        parsedArgs = parsedArgs ? "self, " + parsedArgs : "self";
        return parsedArgs;
    }

    printInstanceOfExpression(node, identation) {
        const left = this.printNode(node.left, 0);
        const right = this.printNode(node.right, 0);
        return this.getIden(identation) + `isinstance(${left}, ${right})`;
    }

    handleTypeOfInsideBinaryExpression(node, identation) {
        const expression = node.left.expression;
        const right = node.right.text;

        const op = node.operatorToken.kind;
        const isDifferentOperator = op === SyntaxKind.ExclamationEqualsEqualsToken || op === SyntaxKind.ExclamationEqualsToken;
        const notOperator = isDifferentOperator ? this.NOT_TOKEN : "";

        switch (right) {
        case "string":
            return this.getIden(identation) + notOperator + "isinstance(" + this.printNode(expression, 0) + ", str)";
        case "number":
            return this.getIden(identation) + notOperator + "isinstance(" + this.printNode(expression, 0) + ", numbers.Real)";
        case "boolean":
            return this.getIden(identation) + notOperator + "isinstance(" + this.printNode(expression, 0) + ", bool)";
        case "object":
            return this.getIden(identation) + notOperator + "isinstance(" + this.printNode(expression, 0) + ", dict)";
        case "undefined":
            return this.getIden(identation) + this.printNode(expression, 0) + " is " + notOperator + "None";
        }

        return undefined;

    }

    printCustomBinaryExpressionIfAny(node, identation) {
        const left = node.left;
        const right = node.right.text;

        const op = node.operatorToken.kind;

        // Fix E712 comparison: if cond == True -> if cond:
        if ((op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsEqualsToken) && node.right.kind === ts.SyntaxKind.TrueKeyword) {
            return this.getIden(identation) + this.printNode(node.left, 0);
        }

        if (left.kind === SyntaxKind.TypeOfExpression) {
            const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
            if (typeOfExpression) {
                return typeOfExpression;
            }
        }

        const prop = node?.left?.expression?.name?.text;

        if (prop) {
            const args = left.arguments;
            const parsedArg =  (args && args.length > 0) ? this.printNode(args[0], 0): undefined;
            const leftSideOfIndexOf = left.expression.expression;  // myString in myString.indexOf
            const leftSide = this.printNode(leftSideOfIndexOf, 0);
            // const rightType = global.checker.getTypeAtLocation(leftSideOfIndexOf); // type of myString in myString.indexOf ("b") >= 0;

            switch(prop) {
            case 'indexOf':
                if (op === SyntaxKind.GreaterThanEqualsToken && right === '0') {
                    return this.getIden(identation) + `${parsedArg} in ${leftSide}`;
                }
            }
        }
        return undefined;
    }

    printConditionalExpression(node, identation) {
        const condition = this.printNode(node.condition, 0);
        const whenTrue = this.printNode(node.whenTrue, 0);
        const whenFalse = this.printNode(node.whenFalse, 0);

        return this.getIden(identation) + whenTrue + " if " + condition + " else " + whenFalse;
    }

    printDeleteExpression(node, identation) {
        const expression = this.printNode (node.expression);
        return `del ${expression}`;
    }

    getCustomOperatorIfAny(left, right, operator) {
        const rightText = right.getText();
        const isUndefined = rightText === "undefined";
        if (isUndefined) {
            switch (operator.kind) {
            case ts.SyntaxKind.EqualsEqualsToken:
                return "is";
            case ts.SyntaxKind.ExclamationEqualsToken:
                return "is not";
            case ts.SyntaxKind.ExclamationEqualsEqualsToken:
                return "is not";
            case ts.SyntaxKind.EqualsEqualsEqualsToken:
                return "is";
            }
        }
    }
}
