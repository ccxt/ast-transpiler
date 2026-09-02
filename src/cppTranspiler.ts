import { BaseTranspiler } from "./baseTranspiler.js";
import ts, { TypeChecker } from 'typescript';

const parserConfig = {
    'ELSEIF_TOKEN': 'else if',
    'OBJECT_OPENING': 'std::unordered_map<std::string, std::any> {',
    'OBJECT_CLOSING': '}',
    'ARRAY_OPENING_TOKEN': 'std::vector<std::any>{',
    'ARRAY_CLOSING_TOKEN': '}',
    'PROPERTY_ASSIGNMENT_TOKEN': ',',
    'VAR_TOKEN': 'std::any', // object
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
    'DEFAULT_PARAMETER_TYPE': 'std::any',
    'INFER_VAR_TYPE': false,
    'INFER_ARG_TYPE': false,
    'UNDEFINED_TOKEN': 'std::any{}',
    // qualified with :: so class methods with the same name never shadow the helper
    'ELEMENT_ACCESS_WRAPPER_OPEN': '::getValue(',
    'ELEMENT_ACCESS_WRAPPER_CLOSE': ')',
    'DEFAULT_RETURN_TYPE': 'std::any',
    'THIS_TOKEN': 'this',
    'NEW_TOKEN': '',
    'CATCH_DECLARATION': 'const std::exception&',
};

export class CppTranspiler extends BaseTranspiler {

    binaryExpressionsWrappers;

    constructor(config = {}) {
        config['parser'] = Object.assign ({}, parserConfig, config['parser'] ?? {});

        super(config);

        this.requiresParameterType = true;
        this.requiresReturnType = true;
        this.asyncTranspiling = true;
        this.supportsFalsyOrTruthyValues = false;
        this.requiresCallExpressionCast = false;
        this.id = "c++";

        this.initConfig();

        // user overrides
        this.applyUserOverrides(config);
    }

    initConfig() {
        this.LeftPropertyAccessReplacements = {
        };

        this.RightPropertyAccessReplacements = {
        };

        this.FullPropertyAccessReplacements = {
            'JSON.parse': 'parseJson',
            'JSON.stringify': 'jsonStringify',
            'console.log': 'consoleLog',
            'Number.MAX_SAFE_INTEGER': 'INT_MAX',
            'Math.min': 'mathMin',
            'Math.max': 'mathMax',
            'Math.log': 'mathLog',
            'Math.abs': 'mathAbs',
            'Math.floor': 'mathFloor',
            'Math.pow': 'mathPow',
        };

        this.CallExpressionReplacements = {
        };

        this.ReservedKeywordsReplacements = {
            'union': 'unionVar',
            'char': 'charVar',
            'default': 'defaultVar',
            'operator': 'operatorVar',
            'new': 'newVar',
            'delete': 'deleteVar',
            'template': 'templateVar',
        };

        this.VariableTypeReplacements = {
        };

        this.ArgTypeReplacements = {
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
        return ""; // c++ initializes the base class in the member initializer list
    }

    printStringLiteral(node) {
        // wrap in std::string so std::any always holds std::string, never const char*
        return `std::string(${super.printStringLiteral(node)})`;
    }

    printClass(node, identation) {
        const classDefinition = this.printClassDefinition(node, identation);
        const classBody = this.printClassBody(node, identation);
        const classClosing = this.getBlockClose(identation);
        return classDefinition + classBody + classClosing + ';';
    }

    printClassDefinition(node, identation) {
        const className = node.name.escapedText;
        const heritageClauses = node.heritageClauses;

        let classInit = "";
        if (heritageClauses !== undefined) {
            const classExtends = heritageClauses[0].types[0].expression.escapedText;
            classInit = this.getIden(identation) + "class " + className + " : public " + classExtends;
        } else {
            classInit = this.getIden(identation) + "class " + className;
        }
        return classInit + "\n" + this.getIden(identation) + this.BLOCK_OPENING_TOKEN + "\n" +
            this.getIden(identation) + "public:\n";
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
            const parentClassName = classNode.heritageClauses[0].types[0].expression.escapedText;
            return this.getIden(identation) + className +
                `(${args}) : ${parentClassName}(${superCallParams})` +
                constructorBody;
        }

        return this.getIden(identation) +
                className +
                "(" + args + ")" +
                constructorBody;
    }

    printThisElementAccesssIfNeeded(node, identation) {
        return undefined; // dynamic this[method]() calls are not supported yet
    }

    printDynamicCall(node, identation) {
        return undefined; // dynamic calls are not supported yet
    }

    printAwaitExpression(node, identation) {
        // no async transpilation yet: await is stripped and the expression is
        // evaluated synchronously
        return this.printNode(node.expression, identation);
    }

    printWrappedUnknownThisProperty(node) {
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
                    return `mathAbs(${parsedArg})`;
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
                    return `mathPow(${parsedArg1}, ${parsedArg2})`;
                }
            }
        }

        return undefined;
    }

    handleTypeOfInsideBinaryExpression(node, identation) {
        const right = node.right.text;
        const op = node.operatorToken.kind;
        const expression = node.left.expression;

        const isDifferentOperator = op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
        const notOperator = isDifferentOperator ? this.NOT_TOKEN : "";

        const target = this.printNode(expression, 0);
        switch (right) {
        case "string":
            return notOperator + `isString(${target})`;
        case "number":
            return notOperator + `isNumber(${target})`;
        case "boolean":
            return notOperator + `isBool(${target})`;
        case "object":
            return notOperator + `isDictionary(${target})`;
        case "function":
            return notOperator + `isFunction(${target})`;
        }

        return undefined;
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

            let arrayBindingStatement = `std::any ${syntheticName} = ${this.printNode(right, 0)};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                const statement = this.getIden(identation) + `${e} = ::getValue(${syntheticName}, ${index})`;
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

        if (op === ts.SyntaxKind.EqualsToken) {
            // handle dict['a'] = 3 and list[0] = 3
            if (left.kind === ts.SyntaxKind.ElementAccessExpression) {
                const elementAccess = left;
                const target = this.printNode(elementAccess.expression, 0);
                const propName = this.printNode(elementAccess.argumentExpression, 0);
                return `::setValue(${target}, ${propName}, ${rightText})`;
            }
        }

        if (op in this.binaryExpressionsWrappers) {
            const wrapper = this.binaryExpressionsWrappers[op];
            const open = wrapper[0];
            const close = wrapper[1];
            return `${open}${leftText}, ${rightText}${close}`;
        }

        return undefined;
    }

    printVariableDeclarationList(node,identation) {
        const declaration = node.declarations[0];

        // handle array binding : input: const [a,b] = this.method()
        // output: std::any abVariable = this.method(); std::any a = getValue(abVariable, 0); ...
        if (declaration?.name.kind === ts.SyntaxKind.ArrayBindingPattern) {
            const arrayBindingPattern = declaration.name;
            const arrayBindingPatternElements = arrayBindingPattern.elements;
            const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e.name, 0));
            const syntheticName = parsedArrayBindingElements.join("") + "Variable";

            let arrayBindingStatement =  `${this.getIden(identation)}std::any ${syntheticName} = ${this.printNode(declaration.initializer, 0)};\n`;

            parsedArrayBindingElements.forEach((e, index) => {
                const statement = this.getIden(identation) + `std::any ${e} = ::getValue(${syntheticName}, ${index})`;
                if (index < parsedArrayBindingElements.length - 1) {
                    arrayBindingStatement += statement + ";\n";
                } else {
                    // printStatement adds the last ;
                    arrayBindingStatement += statement;
                }
            });

            return arrayBindingStatement;
        }

        const isNew = declaration.initializer && (declaration.initializer.kind === ts.SyntaxKind.NewExpression);
        let className = undefined;
        if (isNew) {
            className = declaration.initializer.expression.escapedText;
        }
        const varToken = isNew ? className + ' ' : this.VAR_TOKEN + ' ' ;

        // handle default undefined initialization: let id: Str;
        if (declaration.initializer === undefined) {
            return this.getIden(identation) + this.VAR_TOKEN + ' ' + this.printNode(declaration.name) + " = " + this.UNDEFINED_TOKEN;
        }
        const parsedValue = this.printNode(declaration.initializer, identation).trimStart();
        return this.getIden(identation) + varToken + this.printNode(declaration.name) + " = " + parsedValue;
    }

    printFunctionDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.transformFunctionNameIfNeeded(name);

        const parsedArgs = node.parameters.map(param => this.printParameter(param)).join(", ");

        let returnType = this.printFunctionType(node);
        returnType = returnType ? returnType + " " : returnType;

        const functionDef = this.getIden(identation) + returnType + name
            + "(" + parsedArgs + ")";

        return functionDef;
    }

    printInstanceOfExpression(node, identation) {
        const left = this.printNode(node.left, 0);
        const right = node.right.escapedText;
        return this.getIden(identation) + `(dynamic_cast<const ${right}*>(&(${left})) != nullptr)`;
    }

    printAsExpression(node, identation) {
        return this.printNode(node.expression, identation);
    }

    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        const initializer = node.initializer;

        if (defaultValue) {
            if (initializer) {
                return this.DEFAULT_PARAMETER_TYPE + " " + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + this.printNode(initializer, 0);
            }
            return this.DEFAULT_PARAMETER_TYPE + " " + name;
        }
        return name;
    }

    printFunctionType(node){
        if (!this.requiresReturnType) {
            return "";
        }

        const typeText = this.getFunctionType(node);
        if (typeText === this.VOID_KEYWORD) {
            return this.VOID_KEYWORD;
        }
        return this.DEFAULT_RETURN_TYPE;
    }

    printMethodDefinition(node, identation) {
        let name = node.name.escapedText;
        name = this.transformMethodNameIfNeeded(name);

        let returnType = this.printFunctionType(node);

        const methodOverride = this.getMethodOverride(node) as any;
        const isOverride = methodOverride !== undefined;
        const virtualPrefix = isOverride ? "" : "virtual ";
        const overrideSuffix = isOverride ? " override" : "";

        // keep the overridden method's return type so the signatures match
        if (isOverride) {
            returnType = this.printFunctionType(methodOverride);
        }

        const parsedArgs = this.printMethodParameters(node);

        returnType = returnType ? returnType + " " : returnType;

        const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
        const methodDef = this.getIden(identation) + virtualPrefix + returnType + methodToken + name
            + "(" + parsedArgs + ")" + overrideSuffix;

        return this.printNodeCommentsIfAny(node, identation, methodDef);
    }

    printPropertyDeclaration(node, identation) {
        const name = this.printNode(node.name, 0);
        if (node.initializer) {
            const initializer = this.printNode(node.initializer, 0);
            return this.getIden(identation) + 'std::any ' + name + " = " + initializer + this.LINE_TERMINATOR;
        }
        return this.getIden(identation) + 'std::any ' + name + this.LINE_TERMINATOR;
    }

    printArrayLiteralExpression(node) {
        const elements = node.elements.map((e) => {
            return this.printNode(e);
        }).join(", ");
        return this.ARRAY_OPENING_TOKEN + elements + this.ARRAY_CLOSING_TOKEN;
    }

    printArrayIsArrayCall(node, identation, parsedArg = undefined) {
        return `isArray(${parsedArg})`;
    }

    printObjectKeysCall(node, identation, parsedArg = undefined) {
        return `getObjectKeys(${parsedArg})`;
    }

    printObjectValuesCall(node, identation, parsedArg = undefined) {
        return `getObjectValues(${parsedArg})`;
    }

    printJsonParseCall(node, identation, parsedArg = undefined) {
        return `parseJson(${parsedArg})`;
    }

    printJsonStringifyCall(node, identation, parsedArg = undefined) {
        return `jsonStringify(${parsedArg})`;
    }

    printPromiseAllCall(node, identation, parsedArg = undefined) {
        return `promiseAll(${parsedArg})`;
    }

    printMathFloorCall(node, identation, parsedArg = undefined) {
        return `mathFloor(${parsedArg})`;
    }

    printMathRoundCall(node, identation, parsedArg = undefined) {
        return `mathRound(${parsedArg})`;
    }

    printMathCeilCall(node, identation, parsedArg = undefined) {
        return `mathCeil(${parsedArg})`;
    }

    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any) {
        return `isInteger(${parsedArg})`;
    }

    printArrayPushCall(node, identation, name = undefined, parsedArg = undefined) {
        return  `arrayPush(${name}, ${parsedArg})`;
    }

    printIncludesCall(node, identation, name = undefined, parsedArg = undefined) {
        return `includes(${name}, ${parsedArg})`;
    }

    printIndexOfCall(node, identation, name = undefined, parsedArg = undefined) {
        return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
    }

    printStartsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `startsWith(${name}, ${parsedArg})`;
    }

    printEndsWithCall(node, identation, name = undefined, parsedArg = undefined) {
        return `endsWith(${name}, ${parsedArg})`;
    }

    printTrimCall(node, identation, name = undefined) {
        return `trim(${name})`;
    }

    printJoinCall(node, identation, name = undefined, parsedArg = undefined) {
        return `join(${name}, ${parsedArg})`;
    }

    printSplitCall(node, identation, name = undefined, parsedArg = undefined) {
        return `split(${name}, ${parsedArg})`;
    }

    printConcatCall(node, identation, name = undefined, parsedArg = undefined) {
        return `concat(${name}, ${parsedArg})`;
    }

    printToFixedCall(node, identation, name = undefined, parsedArg = undefined) {
        return `toFixed(${name}, ${parsedArg})`;
    }

    printToStringCall(node, identation, name = undefined) {
        return `toString(${name})`;
    }

    printToUpperCaseCall(node, identation, name = undefined) {
        return `toUpperCase(${name})`;
    }

    printToLowerCaseCall(node, identation, name = undefined) {
        return `toLowerCase(${name})`;
    }

    printShiftCall(node, identation, name = undefined) {
        return `shift(${name})`;
    }

    printReverseCall(node, identation, name = undefined) {
        return `reverse(${name})`;
    }

    printPopCall(node, identation, name = undefined) {
        return `pop(${name})`;
    }

    printAssertCall(node, identation, parsedArgs) {
        return `assertTrue(${parsedArgs})`;
    }

    printSliceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        if (parsedArg2 === undefined){
            parsedArg2 = this.UNDEFINED_TOKEN;
        }
        return `slice(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printReplaceCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `replace(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printReplaceAllCall(node, identation, name = undefined, parsedArg = undefined, parsedArg2 = undefined) {
        return `replaceAll(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
        return `padEnd(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
        return `padStart(${name}, ${parsedArg}, ${parsedArg2})`;
    }

    printDateNowCall(node, identation) {
        return "getCurrentTimestamp()";
    }

    printLengthProperty(node, identation, name = undefined) {
        const leftSide = this.printNode(node.expression, 0);
        const type = (this.getChecker() as TypeChecker).getTypeAtLocation(node.expression); // eslint-disable-line
        this.warnIfAnyType(node, type.flags, leftSide, "length");
        return this.isStringType(type.flags) ? `getStringLength(${leftSide})` : `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`;
    }

    printPostFixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        if (operand.kind === ts.SyntaxKind.NumericLiteral) {
            return super.printPostFixUnaryExpression(node, identation);
        }
        const leftSide = this.printNode(operand, 0);
        const op = this.PostFixOperators[operator];
        if (op === '--') {
            return `postFixDecrement(${leftSide})`;
        }
        return `postFixIncrement(${leftSide})`;
    }

    printPrefixUnaryExpression(node, identation) {
        const {operand, operator} = node;
        if (operand.kind === ts.SyntaxKind.NumericLiteral) {
            return super.printPrefixUnaryExpression(node, identation);
        }
        if (operator === ts.SyntaxKind.ExclamationToken) {
            // not branch check falsy/truthy values if needed;
            return  this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
        }
        const leftSide = this.printNode(operand, 0);
        if (operator === ts.SyntaxKind.PlusToken) {
            return `prefixUnaryPlus(${leftSide})`;
        } else {
            return `prefixUnaryNeg(${leftSide})`;
        }
    }

    printConditionalExpression(node, identation) {
        const condition = this.printCondition(node.condition, 0);
        const whenTrue = this.printNode(node.whenTrue, 0);
        const whenFalse = this.printNode(node.whenFalse, 0);

        // wrap both branches in std::any so the ternary has one common type
        return `(${condition} ? std::any(${whenTrue}) : std::any(${whenFalse}))`;
    }

    printDeleteExpression(node, identation) {
        const object = this.printNode (node.expression.expression, 0);
        const key = this.printNode (node.expression.argumentExpression, 0);
        return `deleteKey(${object}, ${key})`;
    }

    printThrowStatement(node, identation) {
        if (node.expression.kind === ts.SyntaxKind.Identifier) {
            return this.getIden(identation) + this.THROW_TOKEN + ' ' + this.printNode(node.expression, 0) + this.LINE_TERMINATOR;
        }
        if (node.expression.kind === ts.SyntaxKind.NewExpression) {
            const expression = node.expression;
            // handle throw new Error (message) and throw new x[a] (message)
            const argumentsExp = expression?.arguments ?? [];
            const parsedArg = argumentsExp.map(n => this.printNode(n, 0)).join(", ") ?? '';
            const newExpression =  this.printNode(expression.expression, 0);
            if (expression.expression.kind === ts.SyntaxKind.Identifier) {
                const id = expression.expression;
                const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
                if (symbol) {
                    const declarations = this.getChecker().getDeclaredTypeOfSymbol(symbol).symbol?.declarations ?? [];
                    const isClassDeclaration = declarations.find(l => l.kind === ts.SyntaxKind.InterfaceDeclaration ||  l.kind === ts.SyntaxKind.ClassDeclaration);
                    if (isClassDeclaration){
                        return this.getIden(identation) + `${this.THROW_TOKEN} ${id.escapedText}(toString(${parsedArg}))${this.LINE_TERMINATOR}`;
                    }
                    return this.getIden(identation) + `throwDynamicException(${id.escapedText}, ${parsedArg})${this.LINE_TERMINATOR}`;
                }
                return this.getIden(identation) + `${this.THROW_TOKEN} ${newExpression}(${parsedArg})${this.LINE_TERMINATOR}`;
            } else if (expression.expression.kind === ts.SyntaxKind.ElementAccessExpression) {
                return this.getIden(identation) + `throwDynamicException(${newExpression}, ${parsedArg})${this.LINE_TERMINATOR}`;
            }
            return super.printThrowStatement(node, identation);
        }
        return super.printThrowStatement(node, identation);
    }

    getExceptionalAccessTokenIfAny(node) {
        const leftSide = node.expression;
        const leftSideText = this.printNode(leftSide, 0);
        if (leftSideText === this.THIS_TOKEN) {
            return '->';
        }
        return undefined;
    }
}
