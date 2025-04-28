// rustTranspiler.ts
import { BaseTranspiler } from "./baseTranspiler.js";
import ts from 'typescript';
import { regexAll, unCamelCase, isUpperCase } from "./utils.js";

const SyntaxKind = ts.SyntaxKind;
const parserConfig = {
    NUM_LINES_BETWEEN_CLASS_MEMBERS: 1,
    LINES_BETWEEN_FILE_MEMBERS: 0,
    NUM_LINES_END_FILE: 1,
    SPACE_DEFAULT_PARAM: " ",
    BLOCK_OPENING_TOKEN: '{',
    BLOCK_CLOSING_TOKEN: '}',
    SPACE_BEFORE_BLOCK_OPENING: ' ',
    CONDITION_OPENING: '(',
    CONDITION_CLOSE: ')',
    DEFAULT_IDENTATION: "    ",
    STRING_QUOTE_TOKEN: '"',
    UNDEFINED_TOKEN: "None",       // Rust 用 None 替代 undefined
    NULL_TOKEN: "None",            // Rust 用 None 替代 null
    IF_TOKEN: "if",
    ELSE_TOKEN: "else",
    ELSEIF_TOKEN: "else if",
    THIS_TOKEN: "self",            // Rust 用 self 替代 this
    SLASH_TOKEN: "/",
    ASTERISK_TOKEN: "*",
    PLUS_TOKEN: "+",
    MINUS_TOKEN: "-",
    EQUALS_TOKEN: "=",
    EQUALS_EQUALS_TOKEN: "==",
    EXCLAMATION_EQUALS_TOKEN: "!=",
    EXCLAMATION_EQUALS_EQUALS_TOKEN: "!=", // TS !== → Rust !=
    EQUALS_EQUALS_EQUALS_TOKEN: "==",      // TS === → Rust ==
    AMPERSTAND_APERSAND_TOKEN: "&&",
    PLUS_EQUALS: "+=",
    BAR_BAR_TOKEN: "||",
    PERCENT_TOKEN: "%",
    RETURN_TOKEN: "return",
    OBJECT_OPENING: "{",
    OBJECT_CLOSING: "}",
    LEFT_PARENTHESIS: "(",
    RIGHT_PARENTHESIS: ")",
    ARRAY_OPENING_TOKEN: "[",
    ARRAY_CLOSING_TOKEN: "]",
    TRUE_KEYWORD: "true",
    FALSE_KEYWORD: "false",
    NEW_CORRESPODENT: "new",
    THROW_TOKEN: "panic!",          // Rust 用 panic! 替代 throw
    AWAIT_TOKEN: "await",           // Rust 的 await 语法不同（后缀）
    STATIC_TOKEN: "static",
    CONTINUE_TOKEN: "continue",
    EXTENDS_TOKEN: ":",             // 用于 trait 约束（如 `<T: Trait>`）
    NOT_TOKEN: "!",
    SUPER_TOKEN: "super",           // 模块路径中的父级
    PROPERTY_ACCESS_TOKEN: ".",
    TRY_TOKEN: "",                  // Rust 无 try 关键字
    CATCH_TOKEN: "",                // Rust 无 catch 关键字
    CATCH_DECLARATION: "Error",     // 基础错误类型
    BREAK_TOKEN: "break",
    IN_TOKEN: "in",
    LESS_THAN_TOKEN: "<",
    GREATER_THAN_TOKEN: ">",
    GREATER_THAN_EQUALS_TOKEN: ">=",
    LESS_THAN_EQUALS_TOKEN: "<=",
    PLUS_PLUS_TOKEN: "+=1",            // Rust 不支持 ++
    MINUS_MINUS_TOKEN: "-=1",          // Rust 不支持 --
    CONSTRUCTOR_TOKEN: "fn new",    // Rust 的构造函数惯例
    SUPER_CALL_TOKEN: "",           // Rust 无继承机制
    WHILE_TOKEN: "while",
    FOR_TOKEN: "for",
    VAR_TOKEN: "let",               // Rust 用 let 声明变量

    METHOD_DEFAULT_ACCESS: "pub",   // Rust 的公有标记

    PROPERTY_ASSIGNMENT_TOKEN: ":",
    PROPERTY_ASSIGNMENT_OPEN: "",
    PROPERTY_ASSIGNMENT_CLOSE: "",

    LINE_TERMINATOR: ";",

    FUNCTION_TOKEN: "fn",            // Rust 函数关键字
    METHOD_TOKEN: "fn",
    ASYNC_TOKEN: "async",
    PROMISE_TYPE_KEYWORD: "Future", // Rust 的 Future 类型

    NEW_TOKEN: "new",

    STRING_LITERAL_KEYWORD: "&str",  // 字符串字面值类型
    STRING_KEYWORD: "String",        // 动态字符串类型
    NUMBER_KEYWORD: "f64",           // 默认浮点类型
    INTEGER_KEYWORD: "i64",          // 默认整型

    PUBLIC_KEYWORD: "pub",
    PRIVATE_KEYWORD: "",             // Rust 默认私有，无需关键字
    VOID_KEYWORD: "()",              // 空元组表示 void
    BOOLEAN_KEYWORD: "bool",

    ARRAY_KEYWORD: "vec!",
    OBJECT_KEYWORD: "Box<dyn Any>",
    DEFAULT_RETURN_TYPE: "()",       // 默认返回空元组
    DEFAULT_PARAMETER_TYPE: "",
    DEFAULT_TYPE: "Default_Type",

    // 以下包装器均为空（Rust 不需要特殊语法包装）
    FALSY_WRAPPER_OPEN: "",
    FALSY_WRAPPER_CLOSE: "",
    ELEMENT_ACCESS_WRAPPER_OPEN: "",
    ELEMENT_ACCESS_WRAPPER_CLOSE: "",
    COMPARISON_WRAPPER_OPEN: "",
    COMPARISON_WRAPPER_CLOSE: "",
    UKNOWN_PROP_WRAPPER_OPEN: "",
    UNKOWN_PROP_WRAPPER_CLOSE: "",
    UKNOWN_PROP_ASYNC_WRAPPER_OPEN: "",
    UNKOWN_PROP_ASYNC_WRAPPER_CLOSE: "",
    EQUALS_EQUALS_WRAPPER_OPEN: "",
    EQUALS_EQUALS_WRAPPER_CLOSE: "",
    DIFFERENT_WRAPPER_OPEN: "",
    DIFFERENT_WRAPPER_CLOSE: "",
    GREATER_THAN_WRAPPER_OPEN: "",
    GREATER_THAN_WRAPPER_CLOSE: "",
    LESS_THAN_WRAPPER_OPEN: "",
    LESS_THAN_WRAPPER_CLOSE: "",
    GREATER_THAN_EQUALS_WRAPPER_OPEN: "",
    GREATER_THAN_EQUALS_WRAPPER_CLOSE: "",
    LESS_THAN_EQUALS_WRAPPER_OPEN: "",
    LESS_THAN_EQUALS_WRAPPER_CLOSE: "",
    DIVIDE_WRAPPER_OPEN: "",
    DIVIDE_WRAPPER_CLOSE: "",
    PLUS_WRAPPER_OPEN: "",
    PLUS_WRAPPER_CLOSE: "",
    MINUS_WRAPPER_OPEN: "",
    MINUS_WRAPPER_CLOSE: "",
    MOD_WRAPPER_OPEN: "",
    MOD_WRAPPER_CLOSE: "",
    ARRAY_LENGTH_WRAPPER_OPEN: "",
    ARRAY_LENGTH_WRAPPER_CLOSE: "",
    MULTIPLY_WRAPPER_OPEN: "",
    MULTIPLY_WRAPPER_CLOSE: "",
    INDEXOF_WRAPPER_OPEN: "",
    INDEXOF_WRAPPER_CLOSE: "",
    PARSEINT_WRAPPER_OPEN: "",
    PARSEINT_WRAPPER_CLOSE: "",
    DYNAMIC_CALL_OPEN: "",
    SPREAD_TOKEN: "..",              // Rust 的范围语法（如 `..` 用于切片）
};


export class RustTranspiler extends BaseTranspiler {

    nextLine = "\n";
    className: string | null = null;
    heritageClauses = null;
    constructor(config = {}) {
        super({ "parser": Object.assign({}, parserConfig, config['parser']) });
        this.id = "rust";
        this.initConfig();
    }

    initConfig() {
        this.LeftPropertyAccessReplacements = {
            'this': 'self'
        };

        this.RightPropertyAccessReplacements = {
            'push': 'push',
            'length': 'len',
            'toString': 'to_string',
        };

        this.FullPropertyAccessReplacements = {
            'console.log': 'println!',
            'Math.floor': 'f64::floor',
            'Math.abs': 'f64::abs',
            'JSON.stringify': 'serde_json::to_string',
        };

        this.VariableTypeReplacements = {
            'number': 'f64',
            'string': 'String',
            'boolean': 'bool',
            'object': 'Box<dyn Any>'

        };

    }
    getType(node: any): string | null {
        let t = super.getType(node);
        t=t ? this.VariableTypeReplacements[t] || t : null;
        const initializer = node.initializer;
        if (initializer && t === this.DEFAULT_TYPE && ts.isNumericLiteral(initializer)) {
            const num = Number(initializer.text);
            if (Number.isInteger(num)) {
                if (Number(initializer) < -2147483648 || Number(initializer) > 2147483647) {
                    return "i64";
                }
                else {
                    return 'i32';
                }
            }
            return "f64";
        }
        return t;
    }


    printVariableDeclarationList(node, identation) {
        const declarationList = node;
        const is_const = (declarationList.flags & ts.NodeFlags.Const) !== 0; // 关键修改点[1,3](@ref)
        const is_let = (declarationList.flags & ts.NodeFlags.Let) !== 0;
        const declarations = declarationList.declarations
            .map((d: any) => {
                const typeText = this.getType(d);
                if (is_const) {
                    return `${this.getIden(identation)}let ${d.name.escapedText}${typeText ? `: ${typeText}` : ''} = ${d.initializer ? this.printNode(d.initializer, 0) : 'Value::Null'};`;
                }
                else {
                    return `${this.getIden(identation)}let mut ${d.name.escapedText}${typeText ? `: ${typeText}` : ''} = ${d.initializer ? this.printNode(d.initializer, 0) : 'Value::Null'};`;
                }

            });
        return declarations.join('\n');
    }
    printVariableStatement(node: any, identation: any) {
        return this.printVariableDeclarationList(node.declarationList, identation);
    }
    printWhileStatement(node, identation) {
        const loopExpression = node.expression;
        let whileStm = '';
        const expression = this.printNode(loopExpression, 0);
        if (expression === this.TRUE_KEYWORD) {
            whileStm = this.getIden(identation) +
                "loop " + this.printBlock(node.statement, identation);
        }
        else {
            whileStm = this.getIden(identation) +
                this.WHILE_TOKEN + " " +
                this.CONDITION_OPENING + expression + this.CONDITION_CLOSE +
                this.printBlock(node.statement, identation);
        }
        return this.printNodeCommentsIfAny(node, identation, whileStm);
    }
    printForStatement(node, identation) {
        const initializer = this.printNode(node.initializer, identation);
        const condition = this.printNode(node.condition, 0);
        const incrementor = this.printNode(node.incrementor, identation + 1);
        const blockOpen = this.getBlockOpen(identation);
        const blockClose = this.getBlockClose(identation);
        const statements_ary = node.statement.statements.map((s) => this.printNode(s, identation + 1));
        statements_ary.push(incrementor);
        const statements = statements_ary.join("\n");

        const forStm = this.getIden(identation) + initializer + "\n" + this.getIden(identation) +
            this.WHILE_TOKEN + " " + condition + blockOpen + statements + blockClose;

        return this.printNodeCommentsIfAny(node, identation, forStm);
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

            const insideTypes = type.resolvedTypeArguments.map(type => this.getTypeFromRawType(type));
            if (insideTypes.length === 1) {
                if (async) {
                    return insideTypes[0];
                } else {
                    return insideTypes[0];
                }
            }
            else if (insideTypes.length > 1) {
                return `(${insideTypes.join(', ')})`;
            }
            else{
                return undefined;
            }
        }
        return parsedTtype;
    }
    printFunctionDefinition(node, identation) {
        let name = node.name?.escapedText ?? "";
        name = this.transformFunctionNameIfNeeded(name);

        const parsedArgs = node.parameters.map(param => this.printParameter(param)).join(", ");

        let modifiers = this.printModifiers(node);
        modifiers = modifiers ? modifiers + " " : modifiers;

        let returnType = this.printFunctionType(node);
        returnType = returnType ? returnType + " " : returnType;

        const fnKeyword = this.FUNCTION_TOKEN ? this.FUNCTION_TOKEN + " " : "";
        if (ts.isFunctionDeclaration(node)){
            modifiers = modifiers + "pub ";
        }
        let functionDef = `${this.getIden(identation)}${modifiers} `;
        if (this.includeFunctionNameInFunctionExpressionDeclaration ||  !ts.isFunctionExpression(node)) {
            functionDef += `${fnKeyword}${name}`;
        }
        if(returnType){
            functionDef +=` (${parsedArgs})->${returnType}`;
        }
        else{
            functionDef +=` (${parsedArgs})`;
        }

        return functionDef;
    }
    printFunctionBody(node, identation) {
        return this.printBlock(node.body, identation);
    }

    printFunctionDeclaration(node, identation) {
        if (ts.isArrowFunction(node)) {
            const parameters = node.parameters.map(param => this.printParameter(param)).join(", ");
            const body = this.printNode(node.body);
            return `|${parameters}| -> ${body}`;
        }
        let functionDef = this.printFunctionDefinition(node, identation);
        const funcBody = this.printFunctionBody(node.body, identation);
        functionDef += funcBody;

        return this.printNodeCommentsIfAny(node, identation, functionDef);
    }


    printMethodDeclaration(node, identation) {

        let methodDef = this.printFunctionDefinition(node, identation);

        const funcBody = this.printFunctionBody(node, identation);

        methodDef += funcBody;

        return methodDef;
    }
    printStruct(node, indentation) {
        const className = node.name.escapedText;

        // check if we have heritage
        let structDefindName = `${this.getIden(indentation)}struct`;
        if (node?.heritageClauses?.length > 0) {
            const heritageNames = node.heritageClauses.map(heritage => {
                const heritageType = heritage.types[0];
                return heritageType.expression.escapedText;
            }).join(', ');
            structDefindName = `${this.getIden(indentation)}#[inherit((${heritageNames})]\n`+structDefindName;

        }

        const propDeclarations = node.members.filter(member => member.kind === SyntaxKind.PropertyDeclaration);
        return `${structDefindName} ${className}{\n${propDeclarations.map(member => this.printNode(member, indentation + 1)).join("\n")}\n}`;
    }

    printStructMethod(node,identation) {
        const className = node.name.escapedText;
        const method_nodes = node.members.filter(member => member.kind === SyntaxKind.MethodDeclaration);
        const methods = method_nodes.map(method => this.printMethodDeclaration(method, identation+1)).join("\n");
        const structmethoddef = `${this.getIden(identation)}impl ${className} {\n${methods}\n}\n`;
        return structmethoddef;
    }

    printClass(node, identation) {

        const structdef = this.printStruct(node, identation);

        const methoddef = this.printStructMethod(node,identation);

        return structdef + "\n" + methoddef +"\n";
    }


    printPropertyAccessExpression(node: any, identation: any) {
        const left = this.printNode(node.expression, 0);
        const right = node.name.escapedText;

        if (right === 'length') {
            return `${left}.len()`;
        }

        return `${left}.${right}`;
    }

    printArrayLiteralExpression(node: any, identation: any) {
        const elements = node.elements.map((e: any) => this.printNode(e, 0));
        return `vec![${elements.join(", ")}]`;
    }

    printStringLiteral(node: any) {
        return `String::from("${node.text}")`;
    }

    printNumberLiteral(node: any) {

        return `${node.text}f64`;
    }

    printIfStatement(node: any, identation: any) {
        const condition = this.printNode(node.expression, 0);
        const thenBlock = this.printBlock(node.thenStatement, identation + 1);
        const elseBlock = node.elseStatement
            ? ` else ${this.printBlock(node.elseStatement, identation + 1)}`
            : '';

        return `${this.getIden(identation)}if ${condition} ${thenBlock}${elseBlock}`;
    }


   



    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        const type = node.type
            ? `: ${this.printNode(node.type, 0)}`
            : '';
        return `${name}${type}`;
    }

  


    uncapitalizeFirstLetter(l) {
        return l.charAt(0).toLowerCase() + l.slice(1);
    }

    isAllCaps(x) {
        if (!x) {
            return false;
        }
        for (let i = 0; i < x.length; i++) {
            if (x[i] !== x[i].toUpperCase()) {
                return false;
            }
        }
        return true;
    }

    unCamelCamelCase(x) {
        return !x || x.length === 0 || isUpperCase(x) ? x : unCamelCase(x);
    }

}









