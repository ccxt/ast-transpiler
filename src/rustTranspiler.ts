// rustTranspiler.ts
import { BaseTranspiler } from "./baseTranspiler.js";
import ts from 'typescript';
import { regexAll, unCamelCase,isUpperCase } from "./utils.js";

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
    PLUS_PLUS_TOKEN: "",            // Rust 不支持 ++
    MINUS_MINUS_TOKEN: "",          // Rust 不支持 --
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

    ARRAY_KEYWORD: "Vec<Object>",
    OBJECT_KEYWORD: "HashMap<String, Object>",
    DEFAULT_RETURN_TYPE: "()",       // 默认返回空元组
    DEFAULT_PARAMETER_TYPE: "Object",
    DEFAULT_TYPE: "Object",

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
    currentStruct: string | null = null;

    constructor(config = {}) {
        super(Object.assign({}, parserConfig, config));
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
            'object':'Box<dyn Any>'
          

        };
    }
    printWhileStatement(node, identation) {
        const loopExpression = node.expression;
        let whileStm =''
        const expression = this.printNode(loopExpression, 0);
        if (expression === this.TRUE_KEYWORD){
            whileStm = this.getIden(identation) +
                    "loop " +
                    this.printBlock(node.statement, identation);
        }
        else{
            whileStm = this.getIden(identation) +
                    this.WHILE_TOKEN + " " +
                    this.CONDITION_OPENING + expression + this.CONDITION_CLOSE +
                    this.printBlock(node.statement, identation);}
        return this.printNodeCommentsIfAny(node, identation, whileStm);
    }
    
    printClassDefinition(node: any, identation: any): string {
        const className = node.name.escapedText;
        this.currentStruct = className;
        return `struct ${className} {\n${node.members
            .filter((m: any) => ts.isPropertyDeclaration(m))
            .map((m: any) => this.printNode(m, identation + 1))
            .join("\n")}\n}\n\nimpl ${className} {`;
    }

    printMethodParameters(node: any) {
        const params = super.printMethodParameters(node)
            .replace(/self, /, '')
            .replace(/: object/g, ': &self');
        return params;
    }

    printVariableStatement(node: any, identation: any) {
        const declarations = node.declarationList.declarations
            .map((d: any) => {
                const typeText = this.getType(d);
                // if (typeText === this.DEFAULT_TYPE){
                //     return `${this.getIden(identation)}let ${d.name.escapedText} = ${d.initializer ? this.printNode(d.initializer, 0) : 'Value::Null'
                //     };`;
                // }
                return `${this.getIden(identation)}let ${d.name.escapedText}${typeText ? `: ${typeText}` : ''} = ${d.initializer ? this.printNode(d.initializer, 0) : 'Value::Null'
                    };`;
            });
        return declarations.join('\n');
    }
    printFunctionDeclaration(node, identation) {
        const name = this.printNode(node.name, 0);
        const parameters = node.parameters.map((param) => this.printParameter(param)).join(', ');
        const returnType = node.type
            ? ` -> ${this.printNode(node.type, 0)}`
            : '';
        const body = this.printFunctionBody(node.body, identation + 1);
        return `${this.getIden(identation)}fn ${name}(${parameters})${returnType} ${parserConfig.BLOCK_OPENING_TOKEN}\n${body}\n${this.getIden(identation)}${parserConfig.BLOCK_CLOSING_TOKEN}`;
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

    getType(node: any): string | null {
        const type = super.getType(node);
        return type ? this.VariableTypeReplacements[type] || type : null;
    }
    printVariableDeclarationList(node, identation) {
        const declarations = node.declarations;
        const result = [];
        declarations.forEach((declaration) => {
            const name = this.printNode(declaration.name, 0);
            const initializer = declaration.initializer
                ? ` = ${this.printNode(declaration.initializer, 0)}`
                : '';
            result.push(`${this.getIden(identation)}let ${name}${initializer};`);
        });
        return result.join('\n');
    }



    printParameter(node, defaultValue = true) {
        const name = this.printNode(node.name, 0);
        const type = node.type
            ? `: ${this.printNode(node.type, 0)}`
            : '';
        return `${name}${type}`;
    }

    printFunctionBody(node, identation) {
        if (!node) return '';
        const statements = node.statements.map((statement) => this.printNode(statement, identation)).join('\n');
        return statements;
    }

    transformPropertyAcessExpressionIfNeeded(node) {
        const expression = node.expression;
        const leftSide = this.printNode(expression, 0);
        const rightSide = node.name.escapedText;

        let rawExpression = undefined;

        switch (rightSide) {
            case 'length':
                rawExpression = `${leftSide}.len()`;
                break;
        }

        return rawExpression;
    }

  

    capitalizeFirstLetter(l) {
        return l.charAt(0).toUpperCase() + l.slice(1);
    }

    isUndefined(node) {

        return node.type === 'Identifier' && node.name === 'undefined';
    }

    uncapitalizeFirstLetter(l) {
        return l.charAt(0).toLowerCase() + l.slice(1);
    }

    functionIsAsync(node) {
        return this.isAsyncFunction(node)
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

    getFunctionNameFromCallee(node) {
        switch (node.type) {
            case "MemberExpression":
                if (node.property.type !== 'Identifier') {
                    throw new Error("Unexpected MemberExpression");
                }
                return node.property.name;
            case "Identifier":
                return node.name;
            default:
                throw new Error("Unexpected callee type");
        }
    }

    transformIdentifier(name) {
        switch (name) {
            case 'type':
                return "r#type";

            default:
                return this.unCamelCamelCase(name);
        }
    }

    quoteString(str) {
        return str.includes('"') ? `r#"${str}"#` : `"${str}"`;
    }

    getCalleeFunctionName(node) {
        if (node.type !== 'CallExpression') {
            throw new Error("Unexpected node type");
        }
        switch (node.callee.type) {
            case "MemberExpression":
                if (node.callee.property.type !== 'Identifier') {
                    throw new Error("Unexpected MemberExpression");
                }
                return node.callee.property.name;
            case "Identifier":
                return node.callee.name;
            default:
                throw new Error("Unexpected callee type");
        }
    }

    getReturnType(node) {
        if (node.type !== 'CallExpression') {
            throw new Error("Unexpected node type");
        }

        const fname = this.getCalleeFunctionName(node);
        switch (fname) {
            case 'stringEquals':
            case 'stringEq':
            case 'stringGt':
            case 'stringGe':
            case 'stringLt':
            case 'stringLe':
                return 'bool';

            default:
                return 'value';
        }
    }

    
}









