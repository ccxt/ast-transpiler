"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { newObj[key] = obj[key]; } } } newObj.default = obj; return newObj; } } function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; } function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } } function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../ast-transpiler/node_modules/tsup/assets/cjs_shims.js
var init_cjs_shims = __esm({
  "../../../ast-transpiler/node_modules/tsup/assets/cjs_shims.js"() {
  }
});

// src/dirname.cjs
var require_dirname = __commonJS({
  "src/dirname.cjs"(exports, module) {
    init_cjs_shims();
    module.exports = __dirname;
  }
});

// src/transpiler.ts
init_cjs_shims();
var import_dirname = __toESM(require_dirname(), 1);
var _typescript = require('typescript'); var _typescript2 = _interopRequireDefault(_typescript);

// src/pythonTranspiler.ts
init_cjs_shims();

// src/baseTranspiler.ts
init_cjs_shims();


// src/types.ts
init_cjs_shims();
var TranspilationError = class extends Error {
  constructor(id, message, nodeText, start, end) {
    const parsedMessage = `Lang: ${id} Error: ${message} at ${start}:${end} node: "${nodeText}"`;
    super(parsedMessage);
    this.name = "TranspilationError";
  }
};

// src/utils.ts
init_cjs_shims();
function regexAll(text, array) {
  for (const i in array) {
    let regex = array[i][0];
    const flags = typeof regex === "string" ? "g" : void 0;
    regex = new RegExp(regex, flags);
    text = text.replace(regex, array[i][1]);
  }
  return text;
}
function unCamelCase(s) {
  return s.match(/[A-Z]/) ? s.replace(/[a-z0-9][A-Z]/g, (x) => x[0] + "_" + x[1]).replace(/[A-Z0-9][A-Z0-9][a-z][^$]/g, (x) => x[0] + "_" + x[1] + x[2] + x[3]).replace(/[a-z][0-9]$/g, (x) => x[0] + "_" + x[1]).toLowerCase() : void 0;
}

// src/logger.ts
init_cjs_shims();
var _colorette = require('colorette');
var Logger = class {
  // static createInstanceIfNeeded(): void {
  //     if (!this._instance) {
  //         this._instance = new Logger();
  //       }
  // }
  static setVerboseMode(verbose) {
    this.verbose = verbose;
  }
  static log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }
  static success(message) {
    this.log(_colorette.green.call(void 0, `[SUCCESS]: ${message}`));
  }
  static warning(message) {
    this.log(_colorette.yellow.call(void 0, `[WARNING]: ${message}`));
  }
  static error(message) {
    this.log(_colorette.red.call(void 0, `[ERROR]: ${message}`));
  }
};
Logger.verbose = true;

// src/baseTranspiler.ts
var NO_CONTEXT_ERROR = "No transpilation context set: the typescript program must be created before printing nodes.";
var BaseTranspiler = class {
  constructor(config) {
    this.NUM_LINES_BETWEEN_CLASS_MEMBERS = 1;
    this.LINES_BETWEEN_FILE_MEMBERS = 0;
    this.NUM_LINES_END_FILE = 1;
    this.SPACE_DEFAULT_PARAM = " ";
    this.BLOCK_OPENING_TOKEN = "{";
    this.BLOCK_CLOSING_TOKEN = "}";
    this.SPACE_BEFORE_BLOCK_OPENING = " ";
    this.CONDITION_OPENING = "(";
    this.CONDITION_CLOSE = ")";
    this.DEFAULT_IDENTATION = "    ";
    this.STRING_QUOTE_TOKEN = '"';
    this.UNDEFINED_TOKEN = "null";
    this.NULL_TOKEN = "null";
    this.IF_TOKEN = "if";
    this.ELSE_TOKEN = "else";
    this.ELSEIF_TOKEN = "else if";
    this.THIS_TOKEN = "this";
    this.SLASH_TOKEN = "/";
    this.ASTERISK_TOKEN = "*";
    this.PLUS_TOKEN = "+";
    this.MINUS_TOKEN = "-";
    this.EQUALS_TOKEN = "=";
    this.EQUALS_EQUALS_TOKEN = "==";
    this.EXCLAMATION_EQUALS_TOKEN = "!=";
    this.EXCLAMATION_EQUALS_EQUALS_TOKEN = "!=";
    this.EQUALS_EQUALS_EQUALS_TOKEN = "==";
    this.AMPERSTAND_APERSAND_TOKEN = "&&";
    this.PLUS_EQUALS = "+=";
    this.BAR_BAR_TOKEN = "||";
    this.PERCENT_TOKEN = "%";
    this.RETURN_TOKEN = "return";
    this.OBJECT_OPENING = "{";
    this.OBJECT_CLOSING = "}";
    this.LEFT_PARENTHESIS = "(";
    this.RIGHT_PARENTHESIS = ")";
    this.ARRAY_OPENING_TOKEN = "[";
    this.ARRAY_CLOSING_TOKEN = "]";
    this.TRUE_KEYWORD = "true";
    this.FALSE_KEYWORD = "false";
    this.NEW_CORRESPODENT = "new";
    this.THROW_TOKEN = "throw";
    this.AWAIT_TOKEN = "await";
    this.STATIC_TOKEN = "static";
    this.CONTINUE_TOKEN = "continue";
    this.EXTENDS_TOKEN = ":";
    this.NOT_TOKEN = "!";
    this.SUPER_TOKEN = "super";
    this.PROPERTY_ACCESS_TOKEN = ".";
    this.TRY_TOKEN = "try";
    this.CATCH_TOKEN = "catch";
    this.CATCH_DECLARATION = "Exception";
    this.BREAK_TOKEN = "break";
    this.IN_TOKEN = "in";
    this.LESS_THAN_TOKEN = "<";
    this.GREATER_THAN_TOKEN = ">";
    this.GREATER_THAN_EQUALS_TOKEN = ">=";
    this.LESS_THAN_EQUALS_TOKEN = "<=";
    this.PLUS_PLUS_TOKEN = "++";
    this.MINUS_MINUS_TOKEN = "--";
    this.CONSTRUCTOR_TOKEN = "def __init__";
    this.SUPER_CALL_TOKEN = "super().__init__";
    this.WHILE_TOKEN = "while";
    this.FOR_TOKEN = "for";
    this.VAR_TOKEN = "";
    this.METHOD_DEFAULT_ACCESS = "public";
    this.PROPERTY_ASSIGNMENT_TOKEN = ":";
    this.PROPERTY_ASSIGNMENT_OPEN = "";
    this.PROPERTY_ASSIGNMENT_CLOSE = "";
    this.LINE_TERMINATOR = ";";
    this.FUNCTION_TOKEN = "function";
    this.METHOD_TOKEN = "function";
    this.ASYNC_TOKEN = "async";
    this.PROMISE_TYPE_KEYWORD = "Task";
    this.NEW_TOKEN = "new";
    this.STRING_LITERAL_KEYWORD = "StringLiteral";
    this.STRING_KEYWORD = "string";
    this.NUMBER_KEYWORD = "float";
    this.PUBLIC_KEYWORD = "public";
    this.PRIVATE_KEYWORD = "private";
    this.VOID_KEYWORD = "void";
    this.BOOLEAN_KEYWORD = "bool";
    this.ARRAY_KEYWORD = "List<object>";
    this.OBJECT_KEYWORD = "Dictionary<string, object>";
    this.INTEGER_KEYWORD = "int";
    this.DEFAULT_RETURN_TYPE = "object";
    this.DEFAULT_PARAMETER_TYPE = "object";
    this.DEFAULT_TYPE = "object";
    this.FALSY_WRAPPER_OPEN = "";
    this.FALSY_WRAPPER_CLOSE = "";
    this.ELEMENT_ACCESS_WRAPPER_OPEN = "";
    this.ELEMENT_ACCESS_WRAPPER_CLOSE = "";
    this.COMPARISON_WRAPPER_OPEN = "";
    this.COMPARISON_WRAPPER_CLOSE = "";
    this.UKNOWN_PROP_WRAPPER_OPEN = "";
    this.UNKOWN_PROP_WRAPPER_CLOSE = "";
    this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN = "";
    this.UNKOWN_PROP_ASYNC_WRAPPER_CLOSE = "";
    this.EQUALS_EQUALS_WRAPPER_OPEN = "";
    this.EQUALS_EQUALS_WRAPPER_CLOSE = "";
    this.DIFFERENT_WRAPPER_OPEN = "";
    this.DIFFERENT_WRAPPER_CLOSE = "";
    this.GREATER_THAN_WRAPPER_OPEN = "";
    this.GREATER_THAN_WRAPPER_CLOSE = "";
    this.LESS_THAN_WRAPPER_OPEN = "";
    this.LESS_THAN_WRAPPER_CLOSE = "";
    this.GREATER_THAN_EQUALS_WRAPPER_OPEN = "";
    this.GREATER_THAN_EQUALS_WRAPPER_CLOSE = "";
    this.LESS_THAN_EQUALS_WRAPPER_OPEN = "";
    this.LESS_THAN_EQUALS_WRAPPER_CLOSE = "";
    this.DIVIDE_WRAPPER_OPEN = "";
    this.DIVIDE_WRAPPER_CLOSE = "";
    this.PLUS_WRAPPER_OPEN = "";
    this.PLUS_WRAPPER_CLOSE = "";
    this.MINUS_WRAPPER_OPEN = "";
    this.MINUS_WRAPPER_CLOSE = "";
    this.MOD_WRAPPER_OPEN = "";
    this.MOD_WRAPPER_CLOSE = "";
    this.ARRAY_LENGTH_WRAPPER_OPEN = "";
    this.ARRAY_LENGTH_WRAPPER_CLOSE = "";
    this.MULTIPLY_WRAPPER_OPEN = "";
    this.MULTIPLY_WRAPPER_CLOSE = "";
    this.INDEXOF_WRAPPER_OPEN = "";
    this.INDEXOF_WRAPPER_CLOSE = "";
    this.PARSEINT_WRAPPER_OPEN = "";
    this.PARSEINT_WRAPPER_CLOSE = "";
    this.DYNAMIC_CALL_OPEN = "";
    this.SPREAD_TOKEN = "...";
    this.INFER_VAR_TYPE = false;
    this.INFER_ARG_TYPE = false;
    this.SupportedKindNames = {};
    this.PostFixOperators = {};
    this.PrefixFixOperators = {};
    this.FunctionDefSupportedKindNames = {};
    this.LeftPropertyAccessReplacements = {};
    this.RightPropertyAccessReplacements = {};
    this.FullPropertyAccessReplacements = {};
    this.StringLiteralReplacements = {};
    this.CallExpressionReplacements = {};
    this.ReservedKeywordsReplacements = {};
    this.ReassignedVars = {};
    this.PropertyAccessRequiresParenthesisRemoval = [];
    this.VariableTypeReplacements = {};
    this.ArgTypeReplacements = {};
    this.FuncModifiers = {};
    this.defaultPropertyAccess = "public";
    this.currentClassName = "";
    this.className = "undefined";
    Object.assign(this, config["parser"] || {});
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
  setContext(context) {
    this.context = context;
  }
  getSrc() {
    if (this.context === void 0)
      throw new Error(NO_CONTEXT_ERROR);
    return this.context.src;
  }
  getChecker() {
    if (this.context === void 0)
      throw new Error(NO_CONTEXT_ERROR);
    return this.context.checker;
  }
  getProgram() {
    if (this.context === void 0)
      throw new Error(NO_CONTEXT_ERROR);
    return this.context.program;
  }
  initOperators() {
    this.SupportedKindNames = {
      [_typescript2.default.SyntaxKind.StringLiteral]: this.STRING_LITERAL_KEYWORD,
      [_typescript2.default.SyntaxKind.StringKeyword]: this.STRING_KEYWORD,
      // [ts.SyntaxKind.NumberKeyword]: this.NUMBER_KEYWORD,
      [_typescript2.default.SyntaxKind.NumberKeyword]: this.DEFAULT_TYPE,
      [_typescript2.default.SyntaxKind.MinusMinusToken]: this.MINUS_MINUS_TOKEN,
      [_typescript2.default.SyntaxKind.MinusToken]: this.MINUS_TOKEN,
      [_typescript2.default.SyntaxKind.SlashToken]: this.SLASH_TOKEN,
      [_typescript2.default.SyntaxKind.AsteriskToken]: this.ASTERISK_TOKEN,
      [_typescript2.default.SyntaxKind.InKeyword]: this.IN_TOKEN,
      [_typescript2.default.SyntaxKind.PlusToken]: this.PLUS_TOKEN,
      [_typescript2.default.SyntaxKind.PercentToken]: this.PERCENT_TOKEN,
      [_typescript2.default.SyntaxKind.LessThanToken]: this.LESS_THAN_TOKEN,
      [_typescript2.default.SyntaxKind.LessThanEqualsToken]: this.LESS_THAN_EQUALS_TOKEN,
      [_typescript2.default.SyntaxKind.GreaterThanToken]: this.GREATER_THAN_TOKEN,
      [_typescript2.default.SyntaxKind.GreaterThanEqualsToken]: this.GREATER_THAN_EQUALS_TOKEN,
      [_typescript2.default.SyntaxKind.EqualsEqualsToken]: this.EQUALS_EQUALS_TOKEN,
      [_typescript2.default.SyntaxKind.EqualsEqualsEqualsToken]: this.EQUALS_EQUALS_EQUALS_TOKEN,
      [_typescript2.default.SyntaxKind.EqualsToken]: this.EQUALS_TOKEN,
      [_typescript2.default.SyntaxKind.PlusEqualsToken]: this.PLUS_EQUALS,
      [_typescript2.default.SyntaxKind.BarBarToken]: this.BAR_BAR_TOKEN,
      [_typescript2.default.SyntaxKind.AmpersandAmpersandToken]: this.AMPERSTAND_APERSAND_TOKEN,
      [_typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken]: this.EXCLAMATION_EQUALS_EQUALS_TOKEN,
      [_typescript2.default.SyntaxKind.ExclamationEqualsToken]: this.EXCLAMATION_EQUALS_TOKEN,
      [_typescript2.default.SyntaxKind.AsyncKeyword]: this.ASYNC_TOKEN,
      [_typescript2.default.SyntaxKind.AwaitKeyword]: this.AWAIT_TOKEN,
      [_typescript2.default.SyntaxKind.StaticKeyword]: this.STATIC_TOKEN,
      [_typescript2.default.SyntaxKind.PublicKeyword]: this.PUBLIC_KEYWORD,
      [_typescript2.default.SyntaxKind.PrivateKeyword]: this.PRIVATE_KEYWORD,
      [_typescript2.default.SyntaxKind.VoidKeyword]: this.VOID_KEYWORD,
      [_typescript2.default.SyntaxKind.BooleanKeyword]: this.BOOLEAN_KEYWORD
    };
    this.PostFixOperators = {
      [_typescript2.default.SyntaxKind.PlusPlusToken]: this.PLUS_PLUS_TOKEN,
      [_typescript2.default.SyntaxKind.MinusMinusToken]: this.MINUS_MINUS_TOKEN
    };
    this.PrefixFixOperators = {
      [_typescript2.default.SyntaxKind.ExclamationToken]: this.NOT_TOKEN,
      [_typescript2.default.SyntaxKind.MinusToken]: this.MINUS_TOKEN
    };
    this.FunctionDefSupportedKindNames = {
      [_typescript2.default.SyntaxKind.StringKeyword]: this.STRING_KEYWORD
    };
    this.FuncModifiers = {
      [_typescript2.default.SyntaxKind.AsyncKeyword]: this.ASYNC_TOKEN,
      [_typescript2.default.SyntaxKind.PublicKeyword]: this.PUBLIC_KEYWORD,
      [_typescript2.default.SyntaxKind.PrivateKeyword]: this.PRIVATE_KEYWORD,
      [_typescript2.default.SyntaxKind.StaticKeyword]: this.STATIC_TOKEN
    };
  }
  capitalize(str) {
    return str[0].toUpperCase() + str.slice(1);
  }
  applyUserOverrides(config) {
    this.LeftPropertyAccessReplacements = Object.assign({}, this.LeftPropertyAccessReplacements, _nullishCoalesce(config["LeftPropertyAccessReplacements"], () => ( {})));
    this.RightPropertyAccessReplacements = Object.assign({}, this.RightPropertyAccessReplacements, _nullishCoalesce(config["RightPropertyAccessReplacements"], () => ( {})));
    this.FullPropertyAccessReplacements = Object.assign({}, this.FullPropertyAccessReplacements, _nullishCoalesce(config["FullPropertyAccessReplacements"], () => ( {})));
    this.CallExpressionReplacements = Object.assign({}, this.CallExpressionReplacements, _nullishCoalesce(config["CallExpressionReplacements"], () => ( {})));
    this.StringLiteralReplacements = Object.assign({}, this.StringLiteralReplacements, _nullishCoalesce(config["StringLiteralReplacements"], () => ( {})));
  }
  getLineAndCharacterOfNode(node) {
    const { line, character } = this.getSrc().getLineAndCharacterOfPosition(node.getStart());
    return [line + 1, character];
  }
  isComment(line) {
    line = line.trim();
    return line.startsWith("//") || line.startsWith("/*") || line.startsWith("*");
  }
  isStringType(flags) {
    return flags === _typescript2.default.TypeFlags.String || flags === _typescript2.default.TypeFlags.StringLiteral;
  }
  isAnyType(flags) {
    return flags === _typescript2.default.TypeFlags.Any;
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
    return (_nullishCoalesce(node.modifiers, () => ( []))).some((mod) => mod.kind === _typescript2.default.SyntaxKind.AsyncKeyword);
  }
  isPromiseType(type) {
    return type !== void 0 && this.getTypeFromRawType(type) === this.PROMISE_TYPE_KEYWORD;
  }
  isImplicitAsyncFunction(node) {
    if (!this.implicitAsyncTranspiling || !_typescript2.default.isFunctionLike(node) || this.hasAsyncModifier(node)) {
      return false;
    }
    const signature = this.getChecker().getSignatureFromDeclaration(node);
    return signature !== void 0 && this.isPromiseType(this.getChecker().getReturnTypeOfSignature(signature));
  }
  isAsyncFunction(node) {
    return this.hasAsyncModifier(node) || this.isImplicitAsyncFunction(node);
  }
  getMethodOverride(node) {
    if (node === void 0) {
      return void 0;
    }
    if (!_typescript2.default.isClassDeclaration(node.parent)) {
      return void 0;
    }
    const classDeclaration = node.parent;
    if (!classDeclaration.heritageClauses) {
      return void 0;
    }
    let method = void 0;
    let parentClass = _typescript2.default.getAllSuperTypeNodes(node.parent)[0];
    while (parentClass !== void 0) {
      const parentClassType = this.getChecker().getTypeAtLocation(parentClass);
      const parentClassDecl = _optionalChain([parentClassType, 'optionalAccess', _ => _.symbol, 'optionalAccess', _2 => _2.valueDeclaration]);
      if (parentClassDecl === void 0) {
        this.warn(node, "Parent class", "Parent class not found");
        return void 0;
      }
      const parentClassMembers = _nullishCoalesce(parentClassDecl.members, () => ( []));
      parentClassMembers.forEach((elem) => {
        if (_typescript2.default.isMethodDeclaration(elem)) {
          const name = elem.name.getText().trim();
          if (node.name.escapedText === name) {
            method = elem;
          }
        }
      });
      parentClass = _nullishCoalesce(_typescript2.default.getAllSuperTypeNodes(parentClassDecl)[0], () => ( void 0));
    }
    return method;
  }
  getIden(num) {
    return this.DEFAULT_IDENTATION.repeat(parseInt(num));
  }
  getBlockOpen(identation) {
    return this.SPACE_BEFORE_BLOCK_OPENING + this.BLOCK_OPENING_TOKEN + "\n";
  }
  getBlockClose(identation, chainBlock = false) {
    if (chainBlock) {
      return this.BLOCK_CLOSING_TOKEN ? "\n" + this.getIden(identation) + this.BLOCK_CLOSING_TOKEN + this.SPACE_BEFORE_BLOCK_OPENING : "\n" + this.getIden(identation) + this.BLOCK_CLOSING_TOKEN;
    }
    return this.BLOCK_CLOSING_TOKEN ? "\n" + this.getIden(identation) + this.BLOCK_CLOSING_TOKEN : "";
  }
  startsWithUpperCase(str) {
    return str.charAt(0) === str.charAt(0).toUpperCase();
  }
  unCamelCaseIfNeeded(name) {
    if (this.uncamelcaseIdentifiers && !this.startsWithUpperCase(name)) {
      return _nullishCoalesce(unCamelCase(name), () => ( name));
    }
    return name;
  }
  transformIdentifier(node, identifier) {
    return this.unCamelCaseIfNeeded(identifier);
  }
  transformCallExpressionName(name, nameNode = void 0) {
    return name;
  }
  transformPropertyAccessExpressionName(name, nameNode = void 0) {
    return name;
  }
  printIdentifier(node) {
    let idValue = _nullishCoalesce(node.text, () => ( node.escapedText));
    if (this.ReservedKeywordsReplacements[idValue]) {
      idValue = this.ReservedKeywordsReplacements[idValue];
    }
    if (idValue === "undefined") {
      return this.UNDEFINED_TOKEN;
    }
    return this.transformIdentifier(node, idValue);
  }
  shouldRemoveParenthesisFromCallExpression(node) {
    if (node.expression.kind === _typescript2.default.SyntaxKind.PropertyAccessExpression) {
      return this.PropertyAccessRequiresParenthesisRemoval.includes(node.expression.name.text);
    }
    return false;
  }
  printInstanceOfExpression(node, identation) {
    const left = node.left.escapedText;
    const right = node.right.escapedText;
    return this.getIden(identation) + `${left} instanceof ${right}`;
  }
  getCustomOperatorIfAny(left, right, operator) {
    return void 0;
  }
  printCustomBinaryExpressionIfAny(node, identation) {
    return void 0;
  }
  printBinaryExpression(node, identation) {
    const { left, right, operatorToken } = node;
    const customBinaryExp = this.printCustomBinaryExpressionIfAny(node, identation);
    if (customBinaryExp) {
      return customBinaryExp;
    }
    if (operatorToken.kind == _typescript2.default.SyntaxKind.InstanceOfKeyword) {
      return this.printInstanceOfExpression(node, identation);
    }
    let operator = this.SupportedKindNames[operatorToken.kind];
    let leftVar = void 0;
    let rightVar = void 0;
    if (operatorToken.kind === _typescript2.default.SyntaxKind.EqualsEqualsToken || operatorToken.kind === _typescript2.default.SyntaxKind.EqualsEqualsEqualsToken) {
      if (this.COMPARISON_WRAPPER_OPEN) {
        leftVar = this.printNode(left, 0);
        rightVar = this.printNode(right, identation);
        return `${this.COMPARISON_WRAPPER_OPEN}${leftVar}, ${rightVar}${this.COMPARISON_WRAPPER_CLOSE}`;
      }
    }
    let prefixes = "";
    if (operatorToken.kind === _typescript2.default.SyntaxKind.BarBarToken || operatorToken.kind === _typescript2.default.SyntaxKind.AmpersandAmpersandToken) {
      leftVar = this.printCondition(left, 0);
      rightVar = this.printCondition(right, identation);
    } else {
      leftVar = this.printNode(left, 0);
      prefixes = _nullishCoalesce(this.getBinaryExpressionPrefixes(node, identation), () => ( ""));
      rightVar = this.printNode(right, identation);
    }
    const customOperator = this.getCustomOperatorIfAny(left, right, operatorToken);
    operator = customOperator ? customOperator : operator;
    return prefixes + leftVar + " " + operator + " " + rightVar.trim();
  }
  getBinaryExpressionPrefixes(node, identation) {
    return void 0;
  }
  transformPropertyAcessExpressionIfNeeded(node) {
    return void 0;
  }
  transformPropertyAcessRightIdentifierIfNeeded(name) {
    return this.unCamelCaseIfNeeded(name);
  }
  getExceptionalAccessTokenIfAny(node) {
    return void 0;
  }
  printLengthProperty(node, identation, name = void 0) {
    return void 0;
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
    if (this.FullPropertyAccessReplacements.hasOwnProperty(rawExpression)) {
      return this.FullPropertyAccessReplacements[rawExpression];
    }
    leftSide = this.LeftPropertyAccessReplacements.hasOwnProperty(leftSide) ? this.LeftPropertyAccessReplacements[leftSide] : this.printNode(expression, 0);
    rightSide = this.RightPropertyAccessReplacements.hasOwnProperty(rightSide) ? (
      // eslint-disable-line
      this.RightPropertyAccessReplacements[rightSide]
    ) : _nullishCoalesce(this.transformPropertyAcessRightIdentifierIfNeeded(rightSide), () => ( rightSide));
    const accessToken = _nullishCoalesce(this.getExceptionalAccessTokenIfAny(node), () => ( this.PROPERTY_ACCESS_TOKEN));
    rawExpression = leftSide + accessToken + this.transformPropertyAccessExpressionName(rightSide, node.name);
    return rawExpression;
  }
  printCustomDefaultValueIfNeeded(node) {
    return void 0;
  }
  printParameteCustomName(node, name, defaultValue = true) {
    const initializer = node.initializer;
    let type = this.printParameterType(node);
    type = type ? type + " " : "";
    if (defaultValue) {
      if (initializer) {
        const customDefaultValue = this.printCustomDefaultValueIfNeeded(initializer);
        const defaultValue2 = customDefaultValue ? customDefaultValue : this.printNode(initializer, 0);
        return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + defaultValue2;
      }
      return type + name;
    }
    return name;
  }
  printParameter(node, defaultValue = true) {
    const name = this.printNode(node.name, 0);
    const initializer = node.initializer;
    let type = this.printParameterType(node);
    type = type ? type + " " : "";
    if (defaultValue) {
      if (initializer) {
        const customDefaultValue = this.printCustomDefaultValueIfNeeded(initializer);
        const defaultValue2 = customDefaultValue ? customDefaultValue : this.printNode(initializer, 0);
        if (type) {
          type = defaultValue2 === "null" && type !== "object" ? type + "? " : type + " ";
        }
        return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + defaultValue2;
      }
      if (type === "") {
        return name;
      }
      return type + " " + name;
    }
    return name;
  }
  printModifiers(node) {
    let modifiers = _nullishCoalesce(node.modifiers, () => ( []));
    modifiers = modifiers.filter((mod) => this.FuncModifiers[mod.kind]);
    if (!this.asyncTranspiling) {
      modifiers = modifiers.filter((mod) => mod.kind !== _typescript2.default.SyntaxKind.AsyncKeyword);
    }
    let res = modifiers.map((modifier) => this.FuncModifiers[modifier.kind]).join(" ");
    if (this.asyncTranspiling && this.ASYNC_TOKEN && this.isImplicitAsyncFunction(node)) {
      res = res ? res + " " + this.ASYNC_TOKEN : this.ASYNC_TOKEN;
    }
    return res;
  }
  transformLeadingComment(comment) {
    return comment;
  }
  transformTrailingComment(comment) {
    return comment;
  }
  printLeadingComments(node, identation) {
    const fullText = this.getSrc().getFullText();
    const commentsRangeList = _typescript2.default.getLeadingCommentRanges(fullText, node.pos);
    const commentsRange = commentsRangeList ? commentsRangeList : void 0;
    let res = "";
    if (commentsRange) {
      for (const commentRange of commentsRange) {
        const commentText = fullText.slice(commentRange.pos, commentRange.end);
        if (commentText !== void 0) {
          const formatted = commentText.split("\n").map((line) => line.trim()).map((line) => !line.trim().startsWith("*") ? this.getIden(identation) + line : this.getIden(identation) + " " + line).join("\n");
          res += this.transformLeadingComment(formatted) + "\n";
        }
      }
    }
    return res;
  }
  printTraillingComment(node, identation) {
    const fullText = this.getSrc().getFullText();
    const commentsRangeList = _typescript2.default.getTrailingCommentRanges(fullText, node.end);
    const commentsRange = commentsRangeList ? commentsRangeList : void 0;
    let res = "";
    if (commentsRange) {
      for (const commentRange of commentsRange) {
        const commentText = fullText.slice(commentRange.pos, commentRange.end);
        if (commentText !== void 0) {
          res += " " + this.transformTrailingComment(commentText);
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
    const type = node.type;
    if (type) {
      if (type.kind === _typescript2.default.SyntaxKind.TypeReference) {
        const typeRef = type.typeName.escapedText;
        if (typeRef === "Promise") {
          const typeArgs = type.typeArguments.filter((t) => t.kind !== _typescript2.default.SyntaxKind.VoidKeyword);
          const insideTypes = typeArgs.map((type2) => {
            if (this.SupportedKindNames.hasOwnProperty(type2.kind)) {
              return this.SupportedKindNames[type2.kind];
            } else {
              return type2.escapedText;
            }
          }).join(",");
          if (insideTypes.length > 0) {
            return `${this.PROMISE_TYPE_KEYWORD}<${insideTypes}>`;
          }
          return this.PROMISE_TYPE_KEYWORD;
        }
        return type.typeName.escapedText;
      } else if (this.SupportedKindNames.hasOwnProperty(type.kind)) {
        return this.SupportedKindNames[type.kind];
      }
    }
    const initializer = node.initializer;
    if (initializer) {
      if (_typescript2.default.isArrayLiteralExpression(initializer)) {
        return this.ARRAY_KEYWORD;
      }
      if (_typescript2.default.isBooleanLiteral(initializer)) {
        return this.BOOLEAN_KEYWORD;
      }
      if (_typescript2.default.isObjectLiteralExpression(initializer)) {
        return this.OBJECT_KEYWORD;
      }
      if (_typescript2.default.isNumericLiteral(initializer)) {
        return this.DEFAULT_TYPE;
      }
      if (_typescript2.default.isStringLiteralLike(initializer)) {
        return this.STRING_KEYWORD;
      }
    }
    return void 0;
  }
  getTypeFromRawType(type) {
    if (type.flags === _typescript2.default.TypeFlags.Any) {
      return void 0;
    }
    if (type.flags === _typescript2.default.TypeFlags.Void) {
      return this.VOID_KEYWORD;
    }
    if (type.flags === _typescript2.default.TypeFlags.Number) {
      return this.DEFAULT_TYPE;
    }
    if (type.flags === _typescript2.default.TypeFlags.String) {
      return this.STRING_KEYWORD;
    }
    if (_optionalChain([type, 'optionalAccess', _3 => _3.symbol, 'optionalAccess', _4 => _4.escapedName]) === "Array") {
      return this.ARRAY_KEYWORD;
    }
    if (_optionalChain([type, 'optionalAccess', _5 => _5.symbol, 'optionalAccess', _6 => _6.escapedName]) === "__object") {
      return this.OBJECT_KEYWORD;
    }
    if (_optionalChain([type, 'optionalAccess', _7 => _7.symbol, 'optionalAccess', _8 => _8.escapedName]) === "__type") {
      return this.OBJECT_KEYWORD;
    }
    if (_optionalChain([type, 'optionalAccess', _9 => _9.symbol, 'optionalAccess', _10 => _10.escapedName]) === "Promise") {
      return this.PROMISE_TYPE_KEYWORD;
    }
    if (_optionalChain([type, 'optionalAccess', _11 => _11.intrinsicName]) === "object") {
      return this.OBJECT_KEYWORD;
    }
    if (_optionalChain([type, 'optionalAccess', _12 => _12.intrinsicName]) === "boolean") {
      return this.BOOLEAN_KEYWORD;
    }
    return void 0;
  }
  getFunctionType(node, async = true) {
    const type = this.getChecker().getReturnTypeOfSignature(this.getChecker().getSignatureFromDeclaration(node));
    const parsedTtype = this.getTypeFromRawType(type);
    if (parsedTtype === this.PROMISE_TYPE_KEYWORD) {
      const resolvedTypeArguments = type.resolvedTypeArguments;
      if (resolvedTypeArguments.length === 0) {
        return this.PROMISE_TYPE_KEYWORD;
      }
      if (resolvedTypeArguments.length === 1 && resolvedTypeArguments[0].flags === _typescript2.default.TypeFlags.Void) {
        return this.PROMISE_TYPE_KEYWORD;
      }
      const insideTypes = resolvedTypeArguments.map((type2) => this.getTypeFromRawType(type2)).join(",");
      if (insideTypes.length > 0) {
        if (async) {
          return `${this.PROMISE_TYPE_KEYWORD}<${insideTypes}>`;
        } else {
          return insideTypes;
        }
      }
      return void 0;
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
    const type = this.getChecker().typeToString(this.getChecker().getTypeAtLocation(node));
    if (this.ArgTypeReplacements[type]) {
      return this.ArgTypeReplacements[type];
    }
    return this.DEFAULT_PARAMETER_TYPE;
  }
  printFunctionType(node) {
    if (!this.requiresReturnType) {
      return "";
    }
    const typeText = this.getFunctionType(node);
    if (typeText === void 0 || typeText !== this.VOID_KEYWORD && typeText !== this.PROMISE_TYPE_KEYWORD) {
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
    let name = _nullishCoalesce(_optionalChain([node, 'access', _13 => _13.name, 'optionalAccess', _14 => _14.escapedText]), () => ( ""));
    name = this.transformFunctionNameIfNeeded(name);
    const parsedArgs = this.printMethodParameters(node);
    let modifiers = this.printModifiers(node);
    modifiers = modifiers ? modifiers + " " : modifiers;
    let returnType = this.printFunctionType(node);
    if (returnType === "java.util.concurrent.CompletableFuture") {
      returnType = "java.util.concurrent.CompletableFuture<Void>";
    }
    returnType = returnType ? returnType + " " : returnType;
    const fnKeyword = this.FUNCTION_TOKEN ? this.FUNCTION_TOKEN + " " : "";
    if (!fnKeyword && _typescript2.default.isFunctionDeclaration(node)) {
      modifiers = modifiers + "public ";
    }
    let functionDef = this.getIden(identation) + modifiers + returnType + fnKeyword;
    if (this.includeFunctionNameInFunctionExpressionDeclaration || !_typescript2.default.isFunctionExpression(node)) {
      functionDef += name;
    }
    functionDef += "(" + parsedArgs + ")";
    return functionDef;
  }
  transformFunctionNameIfNeeded(name) {
    return this.unCamelCaseIfNeeded(name);
  }
  printFunctionDeclaration(node, identation) {
    if (_typescript2.default.isArrowFunction(node)) {
      const parameters = node.parameters.map((param) => this.printParameter(param)).join(", ");
      const body = this.printNode(node.body);
      return `(${parameters}) => ${body}`;
    }
    const funcBody = this.printFunctionBody(node, identation);
    let functionDef = this.printFunctionDefinition(node, identation);
    functionDef += funcBody;
    return this.printNodeCommentsIfAny(node, identation, functionDef);
  }
  printMethodParameters(node) {
    return node.parameters.map((param) => this.printParameter(param)).join(", ");
  }
  transformMethodNameIfNeeded(name) {
    return this.unCamelCaseIfNeeded(name);
  }
  printMethodDefinition(node, identation) {
    let name = node.name.escapedText;
    name = this.transformMethodNameIfNeeded(name);
    let returnType = this.printFunctionType(node);
    let modifiers = this.printModifiers(node);
    const defaultAccess = this.METHOD_DEFAULT_ACCESS ? this.METHOD_DEFAULT_ACCESS + " " : "";
    modifiers = modifiers ? modifiers + " " : defaultAccess;
    const parsedArgs = this.printMethodParameters(node);
    returnType = returnType ? returnType + " " : returnType;
    const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
    const methodDef = this.getIden(identation) + modifiers + returnType + methodToken + name + "(" + parsedArgs + ")";
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
    const backslashPlaceholder = "\0";
    text = text.replaceAll("\\", backslashPlaceholder);
    text = text.replaceAll("\b", "\\b");
    text = text.replaceAll("\f", "\\f");
    text = text.replaceAll("\n", "\\n");
    text = text.replaceAll("\r", "\\r");
    text = text.replaceAll("	", "\\t");
    text = text.replaceAll(backslashPlaceholder, "\\\\");
    if (token === "'") {
      text = text.replaceAll("'", "\\'");
    } else if (token === '"') {
      text = text.replaceAll('"', '\\"');
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
    return this.ARRAY_OPENING_TOKEN + elements + this.ARRAY_CLOSING_TOKEN;
  }
  printVariableDeclarationList(node, identation) {
    const declaration = node.declarations[0];
    const varToken = this.VAR_TOKEN ? this.VAR_TOKEN + " " : "";
    if (this.removeVariableDeclarationForFunctionExpression && _optionalChain([declaration, 'optionalAccess', _15 => _15.initializer]) && (_typescript2.default.isFunctionExpression(declaration.initializer) || _typescript2.default.isArrowFunction(declaration.initializer))) {
      return this.printNode(declaration.initializer, identation).trimEnd();
    }
    const parsedValue = declaration.initializer ? this.printNode(declaration.initializer, identation) : this.NULL_TOKEN;
    return this.getIden(identation) + varToken + this.printNode(declaration.name) + " = " + parsedValue.trim();
  }
  printVariableStatement(node, identation) {
    if (this.isCJSRequireStatement(node)) {
      return "";
    }
    const decList = node.declarationList;
    const varStatement = this.printVariableDeclarationList(decList, identation) + this.LINE_TERMINATOR;
    return this.printNodeCommentsIfAny(node, identation, varStatement);
  }
  printOutOfOrderCallExpressionIfAny(node, identation) {
    return void 0;
  }
  printSuperCallInsideConstructor(node, identation) {
    const args = node.arguments;
    const parsedArgs = args.map((a) => {
      return this.printNode(a, identation).trim();
    }).join(",");
    return this.SUPER_CALL_TOKEN + "(" + parsedArgs + ")";
  }
  isBuiltInFunctionCall(node) {
    const symbol = this.getChecker().getSymbolAtLocation(node);
    const isInLibFiles = _nullishCoalesce(_optionalChain([symbol, 'optionalAccess', _16 => _16.getDeclarations, 'call', _17 => _17(), 'optionalAccess', _18 => _18.some, 'call', _19 => _19((s) => s.getSourceFile().fileName.includes("/node_modules/typescript/lib/"))]), () => ( false));
    return isInLibFiles;
  }
  getTypesFromCallExpressionParameters(node) {
    const resolvedParams = this.getChecker().getResolvedSignature(node).parameters;
    const parsedTypes = [];
    resolvedParams.forEach((p) => {
      const decl = p.declarations[0];
      const type = this.getChecker().getTypeAtLocation(decl);
      const parsedType = this.getTypeFromRawType(type);
      parsedTypes.push(parsedType);
    });
    return parsedTypes;
  }
  printArgsForCallExpression(node, identation) {
    const args = node.arguments;
    const argsList = args.length > 0 ? args : [];
    const parsedArgs = argsList.map((a) => {
      return this.printNode(a, identation).trim();
    }).join(", ");
    return parsedArgs;
  }
  // builtin functions override
  printArrayIsArrayCall(node, identation, parsedArg = void 0) {
    return void 0;
  }
  printObjectKeysCall(node, identation, parsedArg = void 0) {
    return void 0;
  }
  printObjectValuesCall(node, identation, parsedArg = void 0) {
    return void 0;
  }
  printJsonParseCall(node, identation, parsedArg = void 0) {
    return void 0;
  }
  printJsonStringifyCall(node, identation, parsedArg = void 0) {
    return void 0;
  }
  printPromiseAllCall(node, identation, parsedArg = void 0) {
    return void 0;
  }
  printMathFloorCall(node, identation, parsedArg = void 0) {
    return void 0;
  }
  printMathRoundCall(node, identation, parsedArg = void 0) {
    return void 0;
  }
  printMathCeilCall(node, identation, parsedArg = void 0) {
    return void 0;
  }
  printNumberIsIntegerCall(node, identation, parsedArg = void 0) {
    return void 0;
  }
  printArrayPushCall(node, identation, name = void 0, parsedArg = void 0) {
    return void 0;
  }
  printIncludesCall(node, identation, name = void 0, parsedArg = void 0) {
    return void 0;
  }
  printIndexOfCall(node, identation, name = void 0, parsedArg = void 0) {
    return void 0;
  }
  printStartsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return void 0;
  }
  printEndsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return void 0;
  }
  printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
    return void 0;
  }
  printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
    return void 0;
  }
  printTrimCall(node, identation, name = void 0) {
    return void 0;
  }
  printJoinCall(node, identation, name = void 0, parsedArg = void 0) {
    return void 0;
  }
  printSplitCall(node, identation, name = void 0, parsedArg = void 0) {
    return void 0;
  }
  printConcatCall(node, identation, name = void 0, parsedArg = void 0) {
    return void 0;
  }
  printToFixedCall(node, identation, name = void 0, parsedArg = void 0) {
    return void 0;
  }
  printSearchCall(node, identation, name = void 0, parsedArg = void 0) {
    return void 0;
  }
  printSliceCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return void 0;
  }
  printReplaceCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return void 0;
  }
  printReplaceAllCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return void 0;
  }
  printToStringCall(node, identation, name = void 0) {
    return void 0;
  }
  printToUpperCaseCall(node, identation, name = void 0) {
    return void 0;
  }
  printToLowerCaseCall(node, identation, name = void 0) {
    return void 0;
  }
  printShiftCall(node, identation, name = void 0) {
    return void 0;
  }
  printReverseCall(node, identation, name = void 0) {
    return void 0;
  }
  printPopCall(node, identation, name = void 0) {
    return void 0;
  }
  printAssertCall(node, identation, parsedArgs) {
    return `assert(${parsedArgs})`;
  }
  printDateNowCall(node, identation) {
    return void 0;
  }
  printCallExpression(node, identation) {
    const expression = node.expression;
    const parsedArgs = this.printArgsForCallExpression(node, identation);
    const removeParenthesis = this.shouldRemoveParenthesisFromCallExpression(node);
    const finalExpression = this.printOutOfOrderCallExpressionIfAny(node, identation);
    if (finalExpression) {
      return finalExpression;
    }
    if (node.expression.kind === _typescript2.default.SyntaxKind.PropertyAccessExpression) {
      const expressionText = node.expression.getText().trim();
      const args = _nullishCoalesce(node.arguments, () => ( []));
      if (args.length === 0) {
        switch (expressionText) {
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
      const rightSide = _optionalChain([node, 'access', _20 => _20.expression, 'access', _21 => _21.name, 'optionalAccess', _22 => _22.escapedText]);
      const leftSide = _optionalChain([node, 'access', _23 => _23.expression, 'optionalAccess', _24 => _24.expression]);
      if (args.length === 0 && rightSide !== void 0 && leftSide !== void 0) {
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
      const arg = args && args.length > 0 ? args[0] : void 0;
      if (leftSide && rightSide && arg) {
        const parsedArg = this.printNode(arg, identation).trimStart();
        const secondParsedArg = args[1] ? this.printNode(args[1], identation).trimStart() : void 0;
        const name = this.printNode(leftSide, 0);
        switch (rightSide) {
          case "push":
            return this.printArrayPushCall(node, identation, name, parsedArg);
          case "includes":
            return this.printIncludesCall(node, identation, name, parsedArg);
          case "indexOf":
            return this.printIndexOfCall(node, identation, name, parsedArg);
          case "join":
            return this.printJoinCall(node, identation, name, parsedArg);
          case "split":
            return this.printSplitCall(node, identation, name, parsedArg);
          case "toFixed":
            return this.printToFixedCall(node, identation, name, parsedArg);
          case "concat":
            return this.printConcatCall(node, identation, name, parsedArg);
          case "search":
            return this.printSearchCall(node, identation, name, parsedArg);
          case "endsWith":
            return this.printEndsWithCall(node, identation, name, parsedArg);
          case "startsWith":
            return this.printStartsWithCall(node, identation, name, parsedArg);
          case "padEnd":
            return this.printPadEndCall(node, identation, name, parsedArg, secondParsedArg);
          case "padStart":
            return this.printPadStartCall(node, identation, name, parsedArg, secondParsedArg);
        }
        if (args.length === 1 || args.length === 2) {
          const parsedArg2 = args[1] ? this.printNode(args[1], identation).trimStart() : void 0;
          switch (rightSide) {
            case "slice":
              return this.printSliceCall(node, identation, name, parsedArg, parsedArg2);
            case "replace":
              return this.printReplaceCall(node, identation, name, parsedArg, parsedArg2);
            case "replaceAll":
              return this.printReplaceAllCall(node, identation, name, parsedArg, parsedArg2);
          }
        }
      }
    } else {
      const args = _nullishCoalesce(node.arguments, () => ( []));
      if (args.length === 2) {
        if (expression.escapedText === "assert") {
          return this.printAssertCall(node, identation, parsedArgs);
        }
        if (expression.escapedText === "padEnd") {
        }
      }
    }
    if (expression.kind === _typescript2.default.SyntaxKind.SuperKeyword) {
      return this.printSuperCallInsideConstructor(node, identation);
    }
    let parsedExpression = void 0;
    if (this.CallExpressionReplacements.hasOwnProperty(expression.getText())) {
      parsedExpression = this.CallExpressionReplacements[expression.getText()];
    } else {
      if (expression.kind === _typescript2.default.SyntaxKind.Identifier) {
        const idValue = _nullishCoalesce(expression.text, () => ( expression.escapedText));
        parsedExpression = this.transformCallExpressionName(this.unCamelCaseIfNeeded(idValue), expression);
      } else {
        parsedExpression = this.printNode(expression, 0);
      }
    }
    let parsedCall = parsedExpression;
    if (!removeParenthesis) {
      parsedCall += "(" + parsedArgs + ")";
    }
    return parsedCall;
  }
  printClassBody(node, identation) {
    const parsedMembers = [];
    node.members.forEach((m, index) => {
      const parsedNode = this.printNode(m, identation + 1);
      if (m.kind === _typescript2.default.SyntaxKind.PropertyDeclaration || index === 0) {
        parsedMembers.push(parsedNode);
      } else {
        parsedMembers.push("\n".repeat(this.NUM_LINES_BETWEEN_CLASS_MEMBERS) + parsedNode);
      }
    });
    return parsedMembers.join("\n");
  }
  getCustomClassName(node) {
    return node.name.escapedText;
  }
  getClassModifier(node) {
    return "";
  }
  printClassDefinition(node, identation) {
    const className = this.getCustomClassName(node);
    this.currentClassName = className;
    const heritageClauses = node.heritageClauses;
    const classModifier = this.getClassModifier(node);
    let classInit = "";
    const classOpening = this.getBlockOpen(identation);
    if (heritageClauses !== void 0) {
      const classExtends = heritageClauses[0].types[0].expression.escapedText;
      classInit = this.getIden(identation) + classModifier + "class " + className + " " + this.EXTENDS_TOKEN + " " + classExtends + classOpening;
    } else {
      classInit = this.getIden(identation) + classModifier + "class " + className + classOpening;
    }
    return classInit;
  }
  printClass(node, identation) {
    const classDefinition = this.printClassDefinition(node, identation);
    const classBody = this.printClassBody(node, identation);
    const classClosing = this.getBlockClose(identation);
    return classDefinition + classBody + classClosing;
  }
  printConstructorDeclaration(node, identation) {
    const args = this.printMethodParameters(node);
    const constructorBody = this.printFunctionBody(node, identation);
    return this.getIden(identation) + this.CONSTRUCTOR_TOKEN + "(" + args + ")" + constructorBody;
  }
  printWhileStatement(node, identation) {
    const loopExpression = node.expression;
    const expression = this.printNode(loopExpression, 0);
    const whileStm = this.getIden(identation) + this.WHILE_TOKEN + " " + this.CONDITION_OPENING + expression + this.CONDITION_CLOSE + this.printBlock(node.statement, identation);
    return this.printNodeCommentsIfAny(node, identation, whileStm);
  }
  printForStatement(node, identation) {
    const initializer = this.printNode(node.initializer, 0);
    const condition = this.printNode(node.condition, 0);
    const incrementor = this.printNode(node.incrementor, 0);
    const forStm = this.getIden(identation) + this.FOR_TOKEN + " " + this.CONDITION_OPENING + initializer + "; " + condition + "; " + incrementor + this.CONDITION_CLOSE + this.printBlock(node.statement, identation);
    return this.printNodeCommentsIfAny(node, identation, forStm);
  }
  printBreakStatement(node, identation) {
    const breakStm = this.getIden(identation) + this.BREAK_TOKEN + this.LINE_TERMINATOR;
    return this.printNodeCommentsIfAny(node, identation, breakStm);
  }
  printPostFixUnaryExpression(node, identation) {
    const { operand, operator } = node;
    return this.getIden(identation) + this.printNode(operand, 0) + this.PostFixOperators[operator];
  }
  printPrefixUnaryExpression(node, identation) {
    const { operand, operator } = node;
    if (operator === _typescript2.default.SyntaxKind.ExclamationToken) {
      return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
    }
    return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printNode(operand, 0);
  }
  printObjectLiteralBody(node, identation) {
    let body = node.properties.map((p) => this.printNode(p, identation + 1)).join(",\n");
    body = body ? body + "," : body;
    return body;
  }
  printObjectLiteralExpression(node, identation) {
    const objectBody = this.printObjectLiteralBody(node, identation);
    const formattedObjectBody = objectBody ? "\n" + objectBody + "\n" + this.getIden(identation) : objectBody;
    return this.OBJECT_OPENING + formattedObjectBody + this.OBJECT_CLOSING;
  }
  printCustomRightSidePropertyAssignment(node, identation) {
    return void 0;
  }
  printPropertyAssignment(node, identation) {
    const { name, initializer } = node;
    const nameAsString = this.printNode(name, 0);
    const customRightSide = this.printCustomRightSidePropertyAssignment(initializer, identation);
    const valueAsString = customRightSide ? customRightSide : this.printNode(initializer, identation);
    let trailingComment = this.printTraillingComment(node, identation);
    trailingComment = trailingComment ? " " + trailingComment : trailingComment;
    const propOpen = this.PROPERTY_ASSIGNMENT_OPEN ? this.PROPERTY_ASSIGNMENT_OPEN + " " : "";
    const propClose = this.PROPERTY_ASSIGNMENT_CLOSE ? " " + this.PROPERTY_ASSIGNMENT_CLOSE : "";
    return this.getIden(identation) + propOpen + nameAsString + this.PROPERTY_ASSIGNMENT_TOKEN + " " + valueAsString.trim() + propClose + trailingComment;
  }
  printElementAccessExpressionExceptionIfAny(node) {
    return void 0;
  }
  printElementAccessExpression(node, identation) {
    const { expression, argumentExpression } = node;
    const exception = this.printElementAccessExpressionExceptionIfAny(node);
    if (exception) {
      return exception;
    }
    const isLeftSideOfAssignment = _optionalChain([node, 'access', _25 => _25.parent, 'optionalAccess', _26 => _26.kind]) === _typescript2.default.SyntaxKind.BinaryExpression && (node.parent.operatorToken.kind === _typescript2.default.SyntaxKind.EqualsToken || node.parent.operatorToken.kind === _typescript2.default.SyntaxKind.PlusEqualsToken) && _optionalChain([node, 'access', _27 => _27.parent, 'optionalAccess', _28 => _28.left]) === node;
    const expressionAsString = this.printNode(expression, 0);
    const argumentAsString = this.printNode(argumentExpression, 0);
    if (!isLeftSideOfAssignment && this.ELEMENT_ACCESS_WRAPPER_OPEN && this.ELEMENT_ACCESS_WRAPPER_CLOSE) {
      return `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${expressionAsString}, ${argumentAsString}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
    }
    if (isLeftSideOfAssignment && this.ELEMENT_ACCESS_WRAPPER_OPEN && this.ELEMENT_ACCESS_WRAPPER_CLOSE) {
      const type = this.getChecker().getTypeAtLocation(argumentExpression);
      const isString = this.isStringType(type.flags);
      let isUnionString = false;
      if (type.flags === _typescript2.default.TypeFlags.Union) {
        isUnionString = this.isStringType(_optionalChain([type, 'optionalAccess', _29 => _29.types, 'access', _30 => _30[0], 'access', _31 => _31.flags]));
      }
      if (isString || isUnionString || type.flags === _typescript2.default.TypeFlags.Any) {
        if (this.id === "C#") {
          const cast = _typescript2.default.isStringLiteralLike(argumentExpression) ? "" : "(string)";
          return `((IDictionary<string,object>)${expressionAsString})[${cast}${argumentAsString}]`;
        } else if (this.id === "Java") {
          return `((java.util.HashMap<String, Object>)${expressionAsString}).get(${argumentAsString})`;
        }
      }
      if (this.id === "C#") {
        return `((${this.ARRAY_KEYWORD})${expressionAsString})[Convert.ToInt32(${argumentAsString})]`;
      } else if (this.id === "Java") {
        return `((java.util.List<Object>)${expressionAsString}).get(Helpers.toInt(${argumentAsString}))`;
      }
    }
    return expressionAsString + "[" + argumentAsString + "]";
  }
  printCondition(node, identation) {
    if (this.supportsFalsyOrTruthyValues) {
      return this.printNode(node, identation);
    }
    if (node.kind === _typescript2.default.SyntaxKind.PrefixUnaryExpression && node.operator === _typescript2.default.SyntaxKind.ExclamationToken) {
      return this.printPrefixUnaryExpression(node, identation);
    }
    const expression = `${this.FALSY_WRAPPER_OPEN}${this.printNode(node, 0)}${this.FALSY_WRAPPER_CLOSE}`;
    return `${this.getIden(identation)}${expression}`;
  }
  printIfStatement(node, identation) {
    const expression = this.printCondition(node.expression, 0);
    const elseExists = node.elseStatement !== void 0;
    const isElseIf = node.parent.kind === _typescript2.default.SyntaxKind.IfStatement;
    const needChainBlock = elseExists;
    const ifBody = this.printBlock(node.thenStatement, identation, needChainBlock);
    let ifComplete = this.CONDITION_OPENING + expression + this.CONDITION_CLOSE + ifBody;
    if (isElseIf) {
      ifComplete = this.ELSEIF_TOKEN + " " + ifComplete;
    } else {
      ifComplete = this.getIden(identation) + this.IF_TOKEN + " " + ifComplete;
    }
    const elseStatement = node.elseStatement;
    if (_optionalChain([elseStatement, 'optionalAccess', _32 => _32.kind]) === _typescript2.default.SyntaxKind.Block) {
      const elseBody = this.printBlock(elseStatement, identation);
      const elseBlock = this.ELSE_TOKEN + elseBody;
      ifComplete += elseBlock;
    } else if (_optionalChain([elseStatement, 'optionalAccess', _33 => _33.kind]) === _typescript2.default.SyntaxKind.IfStatement) {
      const elseBody = this.printIfStatement(elseStatement, identation);
      ifComplete += elseBody;
    }
    return this.printNodeCommentsIfAny(node, identation, ifComplete);
  }
  printParenthesizedExpression(node, identation) {
    if (node.expression.kind === _typescript2.default.SyntaxKind.AsExpression) {
      return this.getIden(identation) + this.printNode(node.expression, 0);
    }
    if (node.expression.kind === _typescript2.default.SyntaxKind.ArrowFunction) {
      return "";
    }
    return this.getIden(identation) + this.LEFT_PARENTHESIS + this.printNode(node.expression, 0) + this.RIGHT_PARENTHESIS;
  }
  printBooleanLiteral(node) {
    if (_typescript2.default.SyntaxKind.TrueKeyword === node.kind) {
      return this.TRUE_KEYWORD;
    }
    return this.FALSE_KEYWORD;
  }
  printTryStatement(node, identation) {
    const tryBody = this.printBlock(node.tryBlock, identation, true);
    const catchBody = this.printBlock(node.catchClause.block, identation);
    const catchDeclaration = this.CATCH_DECLARATION + " " + this.printNode(node.catchClause.variableDeclaration.name, 0);
    const catchCondOpen = this.CONDITION_OPENING ? this.CONDITION_OPENING : " ";
    return this.getIden(identation) + this.TRY_TOKEN + tryBody + this.CATCH_TOKEN + catchCondOpen + catchDeclaration + this.CONDITION_CLOSE + catchBody;
  }
  printNewExpression(node, identation) {
    let expression = _optionalChain([node, 'access', _34 => _34.expression, 'optionalAccess', _35 => _35.escapedText]);
    expression = expression ? expression : this.printNode(node.expression);
    const args = node.arguments.map((n) => this.printNode(n, identation)).join(", ");
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
  wrapSyntheticNode(synthetic, original) {
    synthetic.pos = original.pos;
    synthetic.end = original.end;
    synthetic.parent = original.parent;
    original.parent = synthetic;
    return synthetic;
  }
  wrapImplicitReturnAwait(node) {
    let exp = node.expression;
    if (!exp || _typescript2.default.isAwaitExpression(exp) || !this.isImplicitAsyncFunction(_typescript2.default.findAncestor(node, _typescript2.default.isFunctionLike)) || !this.isPromiseType(this.getChecker().getTypeAtLocation(exp))) {
      return node;
    }
    if (_typescript2.default.isConditionalExpression(exp) || _typescript2.default.isBinaryExpression(exp)) {
      exp = this.wrapSyntheticNode(_typescript2.default.factory.createParenthesizedExpression(exp), exp);
    }
    node.expression = this.wrapSyntheticNode(_typescript2.default.factory.createAwaitExpression(exp), exp);
    return node;
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
      if (parent.kind === _typescript2.default.SyntaxKind.FunctionDeclaration || parent.kind === _typescript2.default.SyntaxKind.MethodDeclaration) {
        return parent;
      }
      parent = parent.parent;
    }
    return void 0;
  }
  printReturnStatement(node, identation) {
    const leadingComment = this.printLeadingComments(node, identation);
    let trailingComment = this.printTraillingComment(node, identation);
    trailingComment = trailingComment ? " " + trailingComment : trailingComment;
    const exp = node.expression;
    let rightPart = exp ? " " + this.printNode(exp, identation) : "";
    rightPart = rightPart.trim();
    rightPart = rightPart ? " " + rightPart + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
    return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + rightPart + trailingComment;
  }
  printArrayBindingPattern(node, identation) {
    const elements = node.elements.map((e) => this.printNode(e.name, identation)).join(", ");
    return this.getIden(identation) + this.ARRAY_OPENING_TOKEN + elements + this.ARRAY_CLOSING_TOKEN;
  }
  printBlock(node, identation, chainBlock = false) {
    const blockOpen = this.getBlockOpen(identation);
    const blockClose = this.getBlockClose(identation, chainBlock);
    const statements = node.statements.map((s) => this.printNode(s, identation + 1)).join("\n");
    return blockOpen + statements + blockClose;
  }
  printExpressionStatement(node, identation) {
    if (this.isCJSModuleExportsExpressionStatement(node)) {
      return "";
    }
    const expressionStatementPrefixes = _nullishCoalesce(this.getExpressionStatementPrefixesIfAny(node, identation), () => ( ""));
    const exprStm = this.printNode(node.expression, identation);
    if (exprStm.length === 0) {
      return "";
    }
    const expStatement = expressionStatementPrefixes + this.getIden(identation) + exprStm + this.LINE_TERMINATOR;
    return this.printNodeCommentsIfAny(node, identation, expStatement);
  }
  getExpressionStatementPrefixesIfAny(node, identation) {
    return void 0;
  }
  printPropertyDeclaration(node, identation) {
    const modifiers = this.printPropertyAccessModifiers(node);
    const name = this.printNode(node.name, 0);
    if (node.initializer) {
      const initializer = this.printNode(node.initializer, 0);
      return this.getIden(identation) + modifiers + name + " = " + initializer + this.LINE_TERMINATOR;
    }
    return this.getIden(identation) + modifiers + name + this.LINE_TERMINATOR;
  }
  printPropertyAccessModifiers(node) {
    let modifiers = this.printModifiers(node);
    modifiers = modifiers ? modifiers + " " : modifiers;
    return modifiers;
  }
  printSpreadElement(node, identation) {
    const expression = this.printNode(node.expression, 0);
    return this.getIden(identation) + this.SPREAD_TOKEN + expression;
  }
  printNullKeyword(node, identation) {
    return this.getIden(identation) + this.NULL_TOKEN;
  }
  printContinueStatement(node, identation) {
    return this.getIden(identation) + this.CONTINUE_TOKEN + this.LINE_TERMINATOR;
  }
  printDeleteExpression(node, identation) {
    return void 0;
  }
  printThisKeyword(node, identation) {
    return this.THIS_TOKEN;
  }
  printNode(node, identation = 0) {
    try {
      switch (node.kind) {
        case _typescript2.default.SyntaxKind.ExpressionStatement:
          return this.printExpressionStatement(node, identation);
        case _typescript2.default.SyntaxKind.Block:
          return this.printBlock(node, identation);
        case _typescript2.default.SyntaxKind.FunctionDeclaration:
        case _typescript2.default.SyntaxKind.FunctionExpression:
        case _typescript2.default.SyntaxKind.ArrowFunction:
          return this.printFunctionDeclaration(node, identation);
        case _typescript2.default.SyntaxKind.ClassDeclaration:
          return this.printClass(node, identation);
        case _typescript2.default.SyntaxKind.VariableStatement:
          return this.printVariableStatement(node, identation);
        case _typescript2.default.SyntaxKind.MethodDeclaration:
          return this.printMethodDeclaration(node, identation);
        case _typescript2.default.SyntaxKind.StringLiteral:
          return this.printStringLiteral(node);
        case _typescript2.default.SyntaxKind.NumericLiteral:
          return this.printNumericLiteral(node);
        case _typescript2.default.SyntaxKind.PropertyAccessExpression:
          return this.printPropertyAccessExpression(node, identation);
        case _typescript2.default.SyntaxKind.ArrayLiteralExpression:
          return this.printArrayLiteralExpression(node, identation);
        case _typescript2.default.SyntaxKind.CallExpression:
          return this.printCallExpression(node, identation);
        case _typescript2.default.SyntaxKind.WhileStatement:
          return this.printWhileStatement(node, identation);
        case _typescript2.default.SyntaxKind.BinaryExpression:
          return this.printBinaryExpression(node, identation);
        case _typescript2.default.SyntaxKind.BreakStatement:
          return this.printBreakStatement(node, identation);
        case _typescript2.default.SyntaxKind.ForStatement:
          return this.printForStatement(node, identation);
        case _typescript2.default.SyntaxKind.PostfixUnaryExpression:
          return this.printPostFixUnaryExpression(node, identation);
        case _typescript2.default.SyntaxKind.VariableDeclarationList:
          return this.printVariableDeclarationList(node, identation);
        case _typescript2.default.SyntaxKind.ObjectLiteralExpression:
          return this.printObjectLiteralExpression(node, identation);
        case _typescript2.default.SyntaxKind.PropertyAssignment:
          return this.printPropertyAssignment(node, identation);
        case _typescript2.default.SyntaxKind.Identifier:
          return this.printIdentifier(node);
        case _typescript2.default.SyntaxKind.ElementAccessExpression:
          return this.printElementAccessExpression(node, identation);
        case _typescript2.default.SyntaxKind.IfStatement:
          return this.printIfStatement(node, identation);
        case _typescript2.default.SyntaxKind.ParenthesizedExpression:
          return this.printParenthesizedExpression(node, identation);
        case _typescript2.default.SyntaxKind.TrueKeyword:
        case _typescript2.default.SyntaxKind.FalseKeyword:
          return this.printBooleanLiteral(node);
        case _typescript2.default.SyntaxKind.ThisKeyword:
          return this.printThisKeyword(node, identation);
        case _typescript2.default.SyntaxKind.SuperKeyword:
          return this.SUPER_TOKEN;
        case _typescript2.default.SyntaxKind.TryStatement:
          return this.printTryStatement(node, identation);
        case _typescript2.default.SyntaxKind.PrefixUnaryExpression:
          return this.printPrefixUnaryExpression(node, identation);
        case _typescript2.default.SyntaxKind.ThrowStatement:
          return this.printThrowStatement(node, identation);
        case _typescript2.default.SyntaxKind.NewExpression:
          return this.printNewExpression(node, identation);
        case _typescript2.default.SyntaxKind.AwaitExpression:
          return this.printAwaitExpression(node, identation);
        case _typescript2.default.SyntaxKind.ConditionalExpression:
          return this.printConditionalExpression(node, identation);
        case _typescript2.default.SyntaxKind.AsExpression:
          return this.printAsExpression(node, identation);
        case _typescript2.default.SyntaxKind.ReturnStatement:
          return this.printReturnStatement(this.wrapImplicitReturnAwait(node), identation);
        case _typescript2.default.SyntaxKind.ArrayBindingPattern:
          return this.printArrayBindingPattern(node, identation);
        case _typescript2.default.SyntaxKind.Parameter:
          return this.printParameter(node);
        case _typescript2.default.SyntaxKind.Constructor:
          return this.printConstructorDeclaration(node, identation);
        case _typescript2.default.SyntaxKind.PropertyDeclaration:
          return this.printPropertyDeclaration(node, identation);
        case _typescript2.default.SyntaxKind.SpreadElement:
          return this.printSpreadElement(node, identation);
        case _typescript2.default.SyntaxKind.NullKeyword:
          return this.printNullKeyword(node, identation);
        case _typescript2.default.SyntaxKind.ContinueStatement:
          return this.printContinueStatement(node, identation);
        case _typescript2.default.SyntaxKind.DeleteExpression:
          return this.printDeleteExpression(node, identation);
      }
      if (node.statements) {
        if (_typescript2.default.isSourceFile(node)) {
          this.className = "undefined";
        }
        const transformedStatements = node.statements.map((m) => {
          return this.printNode(m, identation + 1);
        });
        return transformedStatements.filter((st) => st.length > 0).join("\n" + "\n".repeat(this.LINES_BETWEEN_FILE_MEMBERS)) + "\n".repeat(this.NUM_LINES_END_FILE);
      }
      return "";
    } catch (e) {
      if (!(e instanceof TranspilationError)) {
        console.error("[ast-transpiler] underlying error:", e && (e.stack || e.message || e));
      }
      throw new TranspilationError(this.id, _nullishCoalesce((e && (_nullishCoalesce(e.messageText, () => ( e.message)))), () => ( String(e))), node.getFullText(), node.pos, node.end);
    }
  }
  getFileESMImports(node) {
    const result = [];
    const importStatements = node.statements.filter((s) => _typescript2.default.isImportDeclaration(s));
    importStatements.forEach((node2) => {
      const importPath = node2.moduleSpecifier.text;
      const importClause = node2.importClause;
      const namedImports = importClause.namedBindings;
      if (namedImports) {
        if (namedImports.elements) {
          namedImports.elements.forEach((elem) => {
            const name = elem.name.text;
            const fileImport = {
              name,
              path: importPath,
              isDefault: false
            };
            result.push(fileImport);
          });
        } else {
          const name = namedImports.name.escapedText;
          const fileImport = {
            name,
            path: importPath,
            isDefault: false
          };
          result.push(fileImport);
        }
      } else {
        const name = importClause.name.text;
        const fileImport = {
          name,
          path: importPath,
          isDefault: true
        };
        result.push(fileImport);
      }
    });
    return result;
  }
  isCJSRequireStatement(node) {
    const dec = node.declarationList.declarations[0];
    return dec.initializer && _typescript2.default.isCallExpression(dec.initializer) && dec.initializer.expression.getText() === "require";
  }
  isCJSModuleExportsExpressionStatement(node) {
    if (node.expression && node.expression.kind === _typescript2.default.SyntaxKind.BinaryExpression) {
      if (node.expression.left.kind === _typescript2.default.SyntaxKind.PropertyAccessExpression) {
        const left = node.expression.left;
        return left.expression.getText() === "module" && left.name.getText() === "exports";
      }
    }
    return false;
  }
  getCJSImports(node) {
    const result = [];
    const varStatements = node.statements.filter((s) => _typescript2.default.isVariableStatement(s));
    const decList = varStatements.map((s) => s.declarationList);
    const dec = decList.map((d) => d.declarations[0]);
    dec.forEach((decNode) => {
      if (decNode.initializer && decNode.initializer.kind === _typescript2.default.SyntaxKind.CallExpression) {
        const callExpression = decNode.initializer.expression.getText();
        if (callExpression === "require") {
          const isDefault = decNode.name.kind === _typescript2.default.SyntaxKind.Identifier;
          const importPath = decNode.initializer.arguments[0].text;
          if (isDefault) {
            const name = decNode.name.text;
            const fileImport = {
              name,
              path: importPath,
              isDefault
            };
            result.push(fileImport);
          } else {
            const elems = decNode.name.elements;
            elems.forEach((elem) => {
              const name = elem.name.text;
              const fileImport = {
                name,
                path: importPath,
                isDefault: false
              };
              result.push(fileImport);
            });
          }
        }
      }
    });
    return result;
  }
  getFileImports(node) {
    const esmImports = this.getFileESMImports(node);
    if (esmImports.length > 0) {
      return esmImports;
    }
    const cjsImports = this.getCJSImports(node);
    return cjsImports;
  }
  getESMExports(node) {
    const result = [];
    const namedExports = node.statements.filter((s) => _typescript2.default.isExportDeclaration(s));
    const defaultExport = node.statements.filter((s) => _typescript2.default.isExportAssignment(s));
    namedExports.forEach((node2) => {
      const namedExports2 = node2.exportClause;
      if (namedExports2) {
        namedExports2.elements.forEach((elem) => {
          const name = elem.name.text;
          const fileExport = {
            name,
            isDefault: false
          };
          result.push(fileExport);
        });
      }
    });
    defaultExport.forEach((node2) => {
      const name = node2.expression.getText();
      const fileExport = {
        name,
        isDefault: true
      };
      result.push(fileExport);
    });
    return result;
  }
  getCJSExports(node) {
    const result = [];
    const moduleExports = node.statements.filter((s) => this.isCJSModuleExportsExpressionStatement(s)).map((s) => s.expression);
    moduleExports.forEach((node2) => {
      const right = node2.right;
      if (right.kind === _typescript2.default.SyntaxKind.ObjectLiteralExpression) {
        const props = right.properties;
        props.forEach((prop) => {
          const name = prop.name.getText();
          const fileExport = {
            name,
            isDefault: false
          };
          result.push(fileExport);
        });
      }
      if (right.kind === _typescript2.default.SyntaxKind.Identifier) {
        const name = right.getText();
        const fileExport = {
          name,
          isDefault: true
        };
        result.push(fileExport);
      }
    });
    return result;
  }
  getExportDeclarations(node) {
    const result = [];
    const classDeclarations = node.statements.filter((s) => _typescript2.default.isClassDeclaration(s));
    const functionDeclarations = node.statements.filter((s) => _typescript2.default.isFunctionDeclaration(s));
    const both = classDeclarations.concat(functionDeclarations);
    both.forEach((classNode) => {
      const modifiers = classNode.modifiers;
      if (modifiers) {
        const isDefault = modifiers.some((m) => m.kind === _typescript2.default.SyntaxKind.DefaultKeyword);
        if (isDefault) {
          const name = classNode.name.text;
          const fileExport = {
            name,
            isDefault: true
          };
          result.push(fileExport);
        }
      }
    });
    return result;
  }
  getFileExports(node) {
    const defaultClassAndFunctionsExports = this.getExportDeclarations(node);
    const esmExports = this.getESMExports(node).concat(defaultClassAndFunctionsExports);
    if (esmExports.length > 0) {
      return esmExports;
    }
    return this.getCJSExports(node);
  }
  getReturnTypeFromMethod(node) {
    const bType = this.getChecker().getTypeAtLocation(node);
    const func2Type = this.getChecker().getTypeOfSymbolAtLocation(bType.symbol, bType.symbol.valueDeclaration);
    const func2Signature = this.getChecker().getSignaturesOfType(func2Type, _typescript2.default.SignatureKind.Call)[0];
    const rawType = func2Signature.getReturnType();
    const res = this.getChecker().typeToString(rawType);
    if (res === void 0) {
      const name = _optionalChain([node, 'access', _36 => _36.type, 'optionalAccess', _37 => _37.typeName, 'optionalAccess', _38 => _38.escapedText]);
      if (name) {
        return name;
      }
    }
    return res;
  }
  getParameterType(node) {
    const isOptional = node.questionToken !== void 0;
    const result = {
      name: node.name.getText(),
      isOptional,
      type: void 0
    };
    if (node.initializer !== void 0) {
      result.initializer = node.initializer.getText();
    }
    if (node.type === void 0) {
      if (node.initializer !== void 0) {
        const type = this.getChecker().getTypeAtLocation(node.initializer);
        const res = this.getChecker().typeToString(type);
        result.type = _typescript2.default.TypeFlags[type.flags];
        return result;
      }
    }
    const name = _optionalChain([node, 'access', _39 => _39.type, 'optionalAccess', _40 => _40.typeName, 'optionalAccess', _41 => _41.escapedText]);
    if (name) {
      result.type = name;
      if (node.initializer !== void 0) {
        result.initializer = node.initializer.text;
      }
      return result;
    }
    if (node.type != void 0) {
      const type = this.getChecker().getTypeAtLocation(node.type);
      const res = this.getChecker().typeToString(type);
      result.type = res;
      return result;
    }
    return result;
  }
  getMethodTypes(file) {
    const result = [];
    if (!file.statements) {
      return result;
    }
    const classDeclarations = file.statements.filter((s) => _typescript2.default.isClassDeclaration(s));
    classDeclarations.forEach((node) => {
      const methods = node.members.filter((m) => _typescript2.default.isMethodDeclaration(m));
      methods.forEach((m) => {
        const isAsync = this.isAsyncFunction(m);
        const name = m.name.getText();
        const returnType = this.getReturnTypeFromMethod(m);
        const parameters = m.parameters;
        const paramTypes = [];
        parameters.forEach((p) => {
          const res = this.getParameterType(p);
          paramTypes.push(res);
        });
        result.push({
          name,
          async: isAsync,
          returnType,
          parameters: paramTypes
        });
      });
    });
    return result;
  }
};

// src/pythonTranspiler.ts

var SyntaxKind = _typescript2.default.SyntaxKind;
var parserConfig = {
  "STATIC_TOKEN": "",
  // to do static decorator
  "PUBLIC_KEYWORD": "",
  "UNDEFINED_TOKEN": "None",
  "IF_TOKEN": "if",
  "ELSE_TOKEN": "else",
  "ELSEIF_TOKEN": "elif",
  "THIS_TOKEN": "self",
  "AMPERSTAND_APERSAND_TOKEN": "and",
  "BAR_BAR_TOKEN": "or",
  "SPACE_DEFAULT_PARAM": "",
  "BLOCK_OPENING_TOKEN": ":",
  "BLOCK_CLOSING_TOKEN": "",
  "SPACE_BEFORE_BLOCK_OPENING": "",
  "CONDITION_OPENING": "",
  "CONDITION_CLOSE": "",
  "TRUE_KEYWORD": "True",
  "FALSE_KEYWORD": "False",
  "THROW_TOKEN": "raise",
  "NOT_TOKEN": "not ",
  "PLUS_PLUS_TOKEN": " += 1",
  "MINUS_MINUS_TOKEN": " -= 1",
  "CONSTRUCTOR_TOKEN": "def __init__",
  "SUPER_CALL_TOKEN": "super().__init__",
  "PROPERTY_ASSIGNMENT_TOKEN": ":",
  "FUNCTION_TOKEN": "def",
  "SUPER_TOKEN": "super()",
  "NEW_TOKEN": "",
  "STRING_QUOTE_TOKEN": "'",
  "LINE_TERMINATOR": "",
  "METHOD_TOKEN": "def",
  "CATCH_TOKEN": "except",
  "CATCH_DECLARATION": "Exception as",
  "METHOD_DEFAULT_ACCESS": "",
  "SPREAD_TOKEN": "*",
  "NULL_TOKEN": "None"
};
var PythonTranspiler = class extends BaseTranspiler {
  constructor(config = {}) {
    config["parser"] = Object.assign({}, parserConfig, _nullishCoalesce(config["parser"], () => ( {})));
    super(config);
    this.id = "python";
    this.initConfig();
    this.asyncTranspiling = _nullishCoalesce(config["async"], () => ( true));
    this.uncamelcaseIdentifiers = _nullishCoalesce(config["uncamelcaseIdentifiers"], () => ( true));
    this.removeVariableDeclarationForFunctionExpression = _nullishCoalesce(config["removeVariableDeclarationForFunctionExpression"], () => ( true));
    this.includeFunctionNameInFunctionExpressionDeclaration = _nullishCoalesce(config["includeFunctionNameInFunctionExpressionDeclaration"], () => ( true));
    this.applyUserOverrides(config);
  }
  initConfig() {
    this.LeftPropertyAccessReplacements = {
      "this": "self"
    };
    this.RightPropertyAccessReplacements = {
      "push": "append",
      "toUpperCase": "upper",
      "toLowerCase": "lower",
      // 'parseFloat': 'float',
      // 'parseInt': 'int',
      "indexOf": "find",
      "padEnd": "ljust",
      "padStart": "rjust"
    };
    this.FullPropertyAccessReplacements = {
      "console.log": "print",
      "JSON.stringify": "json.dumps",
      "JSON.parse": "json.loads",
      "Math.log": "math.log",
      "Math.abs": "abs",
      "Math.min": "min",
      "Math.max": "max",
      "Math.ceil": "math.ceil",
      "Math.round": "math.round",
      "Math.floor": "math.floor",
      "Math.pow": "math.pow",
      "process.exit": "sys.exit",
      "Number.MAX_SAFE_INTEGER": "float('inf')"
    };
    this.CallExpressionReplacements = {
      "parseInt": "int",
      "parseFloat": "float"
    };
    this.PropertyAccessRequiresParenthesisRemoval = [
      // 'length',
      // 'toString',
    ];
  }
  printArrayIsArrayCall(node, identation, parsedArg = void 0) {
    return `isinstance(${parsedArg}, list)`;
  }
  printObjectKeysCall(node, identation, parsedArg = void 0) {
    return `list(${parsedArg}.keys())`;
  }
  printObjectValuesCall(node, identation, parsedArg = void 0) {
    return `list(${parsedArg}.values())`;
  }
  printPromiseAllCall(node, identation, parsedArg) {
    return `asyncio.gather(*${parsedArg})`;
  }
  printMathFloorCall(node, identation, parsedArg = void 0) {
    return `int(math.floor(${parsedArg}))`;
  }
  printMathCeilCall(node, identation, parsedArg = void 0) {
    return `int(math.ceil(${parsedArg}))`;
  }
  printNumberIsIntegerCall(node, identation, parsedArg = void 0) {
    return `isinstance(${parsedArg}, int)`;
  }
  printMathRoundCall(node, identation, parsedArg = void 0) {
    return `int(round(${parsedArg}))`;
  }
  printIncludesCall(node, identation, name, parsedArg) {
    return `${parsedArg} in ${name}`;
  }
  printJoinCall(node, identation, name, parsedArg) {
    return `${parsedArg}.join(${name})`;
  }
  printSplitCall(node, identation, name, parsedArg) {
    return `${name}.split(${parsedArg})`;
  }
  printConcatCall(node, identation, name, parsedArg) {
    return `${name} + ${parsedArg}`;
  }
  printPopCall(node, identation, name) {
    return `${name}.pop()`;
  }
  printShiftCall(node, identation, name) {
    return `${name}.pop(0)`;
  }
  printReverseCall(node, identation, name = void 0) {
    return `${name}.reverse()`;
  }
  printArrayPushCall(node, identation, name, parsedArg) {
    return `${name}.append(${parsedArg})`;
  }
  printToStringCall(node, identation, name = void 0) {
    return `str(${name})`;
  }
  printIndexOfCall(node, identation, name = void 0, parsedArg = void 0) {
    return `${name}.find(${parsedArg})`;
  }
  printSearchCall(node, identation, name = void 0, parsedArg = void 0) {
    return `${name}.find(${parsedArg})`;
  }
  printStartsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `${name}.startswith(${parsedArg})`;
  }
  printEndsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `${name}.endswith(${parsedArg})`;
  }
  printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
    return `${name}.ljust(${parsedArg}, ${parsedArg2})`;
  }
  printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
    return `${name}.rjust(${parsedArg}, ${parsedArg2})`;
  }
  printTrimCall(node, identation, name = void 0) {
    return `${name}.strip()`;
  }
  printToUpperCaseCall(node, identation, name = void 0) {
    return `${name}.upper()`;
  }
  printToLowerCaseCall(node, identation, name = void 0) {
    return `${name}.lower()`;
  }
  printJsonParseCall(node, identation, parsedArg) {
    return `json.loads(${parsedArg})`;
  }
  printJsonStringifyCall(node, identation, parsedArg) {
    return `json.dumps(${parsedArg})`;
  }
  printReplaceCall(node, identation, name, parsedArg, parsedArg2) {
    return `${name}.replace(${parsedArg}, ${parsedArg2})`;
  }
  printReplaceAllCall(node, identation, name, parsedArg, parsedArg2) {
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
    const roofValue = this.printNode(node.condition.right, 0);
    const forStm = this.getIden(identation) + this.FOR_TOKEN + " " + varName + " in range(" + initValue + ", " + roofValue + "):\n" + node.statement.statements.map((st) => this.printNode(st, identation + 1)).join("\n");
    return this.printNodeCommentsIfAny(node, identation, forStm);
  }
  printPropertyAccessModifiers(node) {
    return "";
  }
  transformLeadingComment(comment) {
    const commentRegex = [
      [/(^|\s)\/\//g, "$1#"],
      // regular comments
      [/\/\*\*/, '"""'],
      // eslint-disable-line
      [/ \*\//, '"""'],
      // eslint-disable-line
      [/\[([^\[\]]*)\]\{@link (.*)\}/g, "`$1 <$2>`"],
      // eslint-disable-line
      [/\s+\* @method/g, ""],
      // docstring @method
      [/(\s+) \* @description (.*)/g, "$1$2"],
      // docstring description
      [/\s+\* @name .*/g, ""],
      // docstring @name
      [/(\s+) \* @see( .*)/g, "$1see$2"],
      // docstring @see
      [/(\s+ \* @(param|returns) {[^}]*)string([^}]*}.*)/g, "$1str$3"],
      // docstring type conversion
      [/(\s+ \* @(param|returns) {[^}]*)object([^}]*}.*)/g, "$1dict$3"],
      // doctstrubg type conversion
      [/(\s+) \* @returns ([^\{])/g, "$1:returns: $2"],
      // eslint-disable-line
      [/(\s+) \* @returns \{(.+)\}/g, "$1:returns $2:"],
      // docstring return
      [/(\s+ \* @param \{[\]\[\|a-zA-Z]+\} )([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+) (.*)/g, "$1$2['$3'] $4"],
      // eslint-disable-line
      [/(\s+) \* @([a-z]+) \{([\]\[a-zA-Z\|]+)\} ([a-zA-Z0-9_\-\.\[\]\']+)/g, "$1:$2 $3 $4:"]
      // eslint-disable-line
    ];
    const transformed = regexAll(comment, commentRegex);
    return transformed;
  }
  transformTrailingComment(comment) {
    const commentRegex = [
      [/(^|\s)\/\//g, "$1#"]
      // regular comments
    ];
    const transformed = regexAll(comment, commentRegex);
    return " " + transformed;
  }
  transformPropertyAcessExpressionIfNeeded(node) {
    const expression = node.expression;
    const leftSide = this.printNode(expression, 0);
    const rightSide = node.name.escapedText;
    let rawExpression = void 0;
    if (rightSide === "length") {
      rawExpression = "len(" + leftSide + ")";
    } else if (rightSide === "toString") {
      rawExpression = "str(" + leftSide + ")";
    }
    return rawExpression;
  }
  printClassDefinition(node, identation) {
    const className = node.name.escapedText;
    const heritageClauses = node.heritageClauses;
    let classInit = "";
    if (heritageClauses !== void 0) {
      const classExtends = heritageClauses[0].types[0].expression.escapedText;
      classInit = this.getIden(identation) + "class " + className + "(" + classExtends + "):\n";
    } else {
      classInit = this.getIden(identation) + "class " + className + ":\n";
    }
    return classInit;
  }
  isFunctionOutSideClass(node) {
    return !(node.parent && node.parent.kind === SyntaxKind.ClassDeclaration);
  }
  printMethodParameters(node) {
    let parsedArgs = super.printMethodParameters(node);
    const shouldAddSelf = !this.isFunctionOutSideClass(node);
    parsedArgs = shouldAddSelf ? parsedArgs ? "self, " + parsedArgs : "self" : parsedArgs;
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
    return void 0;
  }
  printCustomBinaryExpressionIfAny(node, identation) {
    const left = node.left;
    const right = node.right.text;
    const op = node.operatorToken.kind;
    if ((op === _typescript2.default.SyntaxKind.EqualsEqualsToken || op === _typescript2.default.SyntaxKind.EqualsEqualsEqualsToken) && node.right.kind === _typescript2.default.SyntaxKind.TrueKeyword) {
      return this.getIden(identation) + this.printNode(node.left, 0);
    }
    if (left.kind === SyntaxKind.TypeOfExpression) {
      const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
      if (typeOfExpression) {
        return typeOfExpression;
      }
    }
    const prop = _optionalChain([node, 'optionalAccess', _42 => _42.left, 'optionalAccess', _43 => _43.expression, 'optionalAccess', _44 => _44.name, 'optionalAccess', _45 => _45.text]);
    if (prop) {
      const args = left.arguments;
      const parsedArg = args && args.length > 0 ? this.printNode(args[0], 0) : void 0;
      const leftSideOfIndexOf = left.expression.expression;
      const leftSide = this.printNode(leftSideOfIndexOf, 0);
      switch (prop) {
        case "indexOf":
          if (op === SyntaxKind.GreaterThanEqualsToken && right === "0") {
            return this.getIden(identation) + `${parsedArg} in ${leftSide}`;
          }
      }
    }
    return void 0;
  }
  printConditionalExpression(node, identation) {
    const condition = this.printNode(node.condition, 0);
    const whenTrue = this.printNode(node.whenTrue, 0);
    const whenFalse = this.printNode(node.whenFalse, 0);
    return this.getIden(identation) + whenTrue + " if " + condition + " else " + whenFalse;
  }
  printDeleteExpression(node, identation) {
    const expression = this.printNode(node.expression);
    return `del ${expression}`;
  }
  getCustomOperatorIfAny(left, right, operator) {
    const rightText = right.getText();
    const isUndefined = rightText === "undefined";
    if (isUndefined) {
      switch (operator.kind) {
        case _typescript2.default.SyntaxKind.EqualsEqualsToken:
          return "is";
        case _typescript2.default.SyntaxKind.ExclamationEqualsToken:
          return "is not";
        case _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken:
          return "is not";
        case _typescript2.default.SyntaxKind.EqualsEqualsEqualsToken:
          return "is";
      }
    }
  }
};

// src/phpTranspiler.ts
init_cjs_shims();

var SyntaxKind2 = _typescript2.default.SyntaxKind;
var parserConfig2 = {
  "ELSEIF_TOKEN": "elseif",
  "THIS_TOKEN": "$this",
  "PROPERTY_ACCESS_TOKEN": "->",
  "UNDEFINED_TOKEN": "null",
  "NOT_TOKEN": "!",
  "LINE_TERMINATOR": ";",
  "ARRAY_OPENING_TOKEN": "[",
  "ARRAY_CLOSING_TOKEN": "]",
  "OBJECT_OPENING": "array(",
  "OBJECT_CLOSING": ")",
  "FUNCTION_TOKEN": "function",
  "ASYNC_TOKEN": "",
  "PROPERTY_ASSIGNMENT_TOKEN": " =>",
  "NEW_TOKEN": "new",
  "THROW_TOKEN": "throw",
  "SUPER_TOKEN": "parent",
  "CONSTRUCTOR_TOKEN": "function __construct",
  "SUPER_CALL_TOKEN": "parent::__construct",
  "CATCH_DECLARATION": "Exception",
  "CATCH_TOKEN": "catch",
  "BLOCK_OPENING_TOKEN": "{",
  "BLOCK_CLOSING_TOKEN": "}",
  "CONDITION_OPENING": "(",
  "CONDITION_CLOSE": ")",
  "PLUS_PLUS_TOKEN": "++",
  "MINUS_MINUS_TOKEN": "--",
  "SPACE_DEFAULT_PARAM": " ",
  "EXCLAMATION_EQUALS_EQUALS_TOKEN": "!==",
  "EQUALS_EQUALS_EQUALS_TOKEN": "===",
  "STRING_QUOTE_TOKEN": "'",
  "EXTENDS_TOKEN": "extends"
};
var PhpTranspiler = class extends BaseTranspiler {
  constructor(config = {}) {
    config["parser"] = Object.assign({}, parserConfig2, _nullishCoalesce(config["parser"], () => ( {})));
    super(config);
    this.ASYNC_FUNCTION_WRAPPER_OPEN = "";
    this.id = "php";
    this.asyncTranspiling = _nullishCoalesce(config["async"], () => ( true));
    this.uncamelcaseIdentifiers = _nullishCoalesce(config["uncamelcaseIdentifiers"], () => ( false));
    this.removeVariableDeclarationForFunctionExpression = _nullishCoalesce(config["removeFunctionAssignToVariable"], () => ( false));
    this.includeFunctionNameInFunctionExpressionDeclaration = _nullishCoalesce(config["includeFunctionNameInFunctionExpressionDeclaration"], () => ( false));
    this.propRequiresScopeResolutionOperator = ["super"] + (_nullishCoalesce(config["ScopeResolutionProps"], () => ( [])));
    this.initConfig();
    this.applyUserOverrides(config);
    this.AWAIT_WRAPPER_OPEN = _nullishCoalesce(config["AWAIT_WRAPPER_OPEN"], () => ( "\\React\\Async\\await("));
    this.AWAIT_WRAPPER_CLOSE = _nullishCoalesce(config["AWAIT_WRAPPER_CLOSE"], () => ( ")"));
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
    const symbol = this.getChecker().getSymbolAtLocation(node);
    if (symbol && symbol.valueDeclaration) {
      const valueDecl = symbol.valueDeclaration;
      if (_typescript2.default.isFunctionDeclaration(valueDecl) || _typescript2.default.isFunctionExpression(valueDecl) || _typescript2.default.isArrowFunction(valueDecl)) {
        if (node.parent && _typescript2.default.isCallExpression(node.parent) && node.parent.arguments.includes(node)) {
          return `'${identifier}'`;
        }
      }
    }
    if (!this.startsWithUpperCase(identifier)) {
      return "$" + identifier;
    }
    return identifier;
  }
  getCustomOperatorIfAny(left, right, operator) {
    const STRING_CONCAT = ".";
    const PLUS_EQUALS_TOKEN = ".=";
    if (operator.kind == SyntaxKind2.PlusToken || operator.kind == SyntaxKind2.PlusEqualsToken) {
      const TOKEN = operator.kind == SyntaxKind2.PlusToken ? STRING_CONCAT : PLUS_EQUALS_TOKEN;
      if (left.kind == SyntaxKind2.StringLiteral || right.kind == SyntaxKind2.StringLiteral) {
        return TOKEN;
      }
      const leftType = this.getChecker().getTypeAtLocation(left);
      const rightType = this.getChecker().getTypeAtLocation(right);
      if (leftType.flags === _typescript2.default.TypeFlags.String || rightType.flags === _typescript2.default.TypeFlags.String) {
        return TOKEN;
      }
      if (leftType.flags === _typescript2.default.TypeFlags.StringLiteral || rightType.flags === _typescript2.default.TypeFlags.StringLiteral) {
        return TOKEN;
      }
    }
    return void 0;
  }
  printLengthProperty(node, identation, name = void 0) {
    const leftSide = this.printNode(node.expression, 0);
    const type = this.getChecker().getTypeAtLocation(node.expression);
    this.warnIfAnyType(node, type.flags, leftSide, "length");
    return this.isStringType(type.flags) ? `strlen(${leftSide})` : `count(${leftSide})`;
  }
  printPopCall(node, identation, name = void 0) {
    return `array_pop(${name})`;
  }
  printReverseCall(node, identation, name = void 0) {
    return `${name} = array_reverse(${name})`;
  }
  printShiftCall(node, identation, name = void 0) {
    return `array_shift(${name})`;
  }
  printToLowerCaseCall(node, identation, name = void 0) {
    return `strtolower(${name})`;
  }
  printToUpperCaseCall(node, identation, name = void 0) {
    return `strtoupper(${name})`;
  }
  printToStringCall(node, identation, name = void 0) {
    return `((string) ${name})`;
  }
  printArrayIsArrayCall(node, identation, parsedArg = void 0) {
    return `gettype(${parsedArg}) === 'array' && array_is_list(${parsedArg})`;
  }
  printObjectKeysCall(node, identation, parsedArg = void 0) {
    return `is_array(${parsedArg}) ? array_keys(${parsedArg}) : array()`;
  }
  printObjectValuesCall(node, identation, parsedArg = void 0) {
    return `is_array(${parsedArg}) ? array_values(${parsedArg}) : array()`;
  }
  printJsonParseCall(node, identation, parsedArg) {
    return `json_decode(${parsedArg}, $as_associative_array = true)`;
  }
  printJsonStringifyCall(node, identation, parsedArg) {
    return `json_encode(${parsedArg})`;
  }
  printArrayPushCall(node, identation, name = void 0, parsedArg = void 0) {
    return `${name}[] = ${parsedArg}`;
  }
  printPromiseAllCall(node, identation, parsedArg = void 0) {
    return `\\React\\Promise\\all(${parsedArg})`;
  }
  printMathCeilCall(node, identation, parsedArg = void 0) {
    return `((int) ceil(${parsedArg}))`;
  }
  printNumberIsIntegerCall(node, identation, parsedArg) {
    return `is_int(${parsedArg})`;
  }
  printMathRoundCall(node, identation, parsedArg = void 0) {
    return `((int) round(${parsedArg}))`;
  }
  printMathFloorCall(node, identation, parsedArg) {
    return `((int) floor(${parsedArg}))`;
  }
  printReplaceCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return `str_replace(${parsedArg}, ${parsedArg2}, ${name})`;
  }
  printReplaceAllCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return `str_replace(${parsedArg}, ${parsedArg2}, ${name})`;
  }
  printIncludesCall(node, identation, name = void 0, parsedArg = void 0) {
    const leftSide = _optionalChain([node, 'access', _46 => _46.expression, 'optionalAccess', _47 => _47.expression]);
    const leftSideText = this.printNode(leftSide, 0);
    const type = this.getChecker().getTypeAtLocation(leftSide);
    this.warnIfAnyType(node, type.flags, leftSideText, "includes");
    this.warnIfAnyType(node, type.flags, leftSideText, "includes");
    if (this.isStringType(type.flags)) {
      return `str_contains(${name}, ${parsedArg})`;
    } else {
      return `in_array(${parsedArg}, ${name})`;
    }
  }
  printIndexOfCall(node, identation, name = void 0, parsedArg = void 0) {
    const leftSide = _optionalChain([node, 'access', _48 => _48.expression, 'optionalAccess', _49 => _49.expression]);
    const leftSideText = this.printNode(leftSide, 0);
    const type = this.getChecker().getTypeAtLocation(leftSide);
    this.warnIfAnyType(node, type.flags, leftSideText, "indexOf");
    if (this.isStringType(type.flags)) {
      return `mb_strpos(${name}, ${parsedArg})`;
    } else {
      return `array_search(${parsedArg}, ${name})`;
    }
  }
  printSearchCall(node, identation, name = void 0, parsedArg = void 0) {
    return `mb_strpos(${name}, ${parsedArg})`;
  }
  printStartsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `str_starts_with(${name}, ${parsedArg})`;
  }
  printEndsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `str_ends_with(${name}, ${parsedArg})`;
  }
  printTrimCall(node, identation, name = void 0) {
    return `trim(${name})`;
  }
  printJoinCall(node, identation, name = void 0, parsedArg = void 0) {
    return `implode(${parsedArg}, ${name})`;
  }
  printSplitCall(node, identation, name = void 0, parsedArg = void 0) {
    return `explode(${parsedArg}, ${name})`;
  }
  printConcatCall(node, identation, name, parsedArg) {
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
    const left = node.left.escapedText;
    const right = node.right.escapedText;
    return this.getIden(identation) + "$" + left + " instanceof " + right;
  }
  printDeleteExpression(node, identation) {
    const expression = this.printNode(node.expression, 0);
    return `unset(${expression})`;
  }
  printNewExpression(node, identation) {
    let expression = _optionalChain([node, 'access', _50 => _50.expression, 'optionalAccess', _51 => _51.escapedText]);
    expression = expression ? expression : this.printNode(node.expression);
    if (expression === "Error") {
      expression = "Exception";
    }
    const args = node.arguments.map((n) => this.printNode(n, identation)).join(", ");
    const newToken = this.NEW_TOKEN ? this.NEW_TOKEN + " " : "";
    return newToken + expression + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
  }
  getExceptionalAccessTokenIfAny(node) {
    const leftSide = _nullishCoalesce(node.expression.escapedText, () => ( node.expression.getFullText().trim()));
    if (!leftSide) {
      return void 0;
    }
    if (this.propRequiresScopeResolutionOperator.includes(leftSide)) {
      return "::";
    }
    return void 0;
  }
  handleTypeOfInsideBinaryExpression(node, identation) {
    const left = node.left;
    const right = node.right.text;
    const op = node.operatorToken.kind;
    const expression = left.expression;
    const isDifferentOperator = op === SyntaxKind2.ExclamationEqualsEqualsToken || op === SyntaxKind2.ExclamationEqualsToken;
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
    return void 0;
  }
  printCustomBinaryExpressionIfAny(node, identation) {
    const left = node.left;
    const right = node.right.text;
    const op = node.operatorToken.kind;
    if (left.kind === SyntaxKind2.TypeOfExpression) {
      const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
      if (typeOfExpression) {
        return typeOfExpression;
      }
    }
    if (op === _typescript2.default.SyntaxKind.InKeyword) {
      const rightSide = this.printNode(node.right, 0);
      const leftSide = this.printNode(node.left, 0);
      return `${this.getIden(identation)}is_array(${rightSide}) && array_key_exists(${leftSide}, ${rightSide})`;
    }
    const prop = _optionalChain([node, 'optionalAccess', _52 => _52.left, 'optionalAccess', _53 => _53.expression, 'optionalAccess', _54 => _54.name, 'optionalAccess', _55 => _55.text]);
    if (prop) {
      const args = left.arguments;
      const parsedArg = args && args.length > 0 ? this.printNode(args[0], 0) : void 0;
      const leftSideOfIndexOf = left.expression.expression;
      const leftSide = this.printNode(leftSideOfIndexOf, 0);
      const rightType = this.getChecker().getTypeAtLocation(leftSideOfIndexOf);
      switch (prop) {
        case "indexOf":
          if (op === SyntaxKind2.GreaterThanEqualsToken && right === "0") {
            this.warnIfAnyType(node, rightType.flags, leftSide, "indexOf");
            if (this.isStringType(rightType.flags)) {
              return this.getIden(identation) + "mb_strpos(" + leftSide + ", " + parsedArg + ") !== false";
            } else {
              return this.getIden(identation) + "in_array(" + parsedArg + ", " + leftSide + ")";
            }
          }
      }
    }
    return void 0;
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
      const parsedArgs = node.parameters.map((param) => this.printParameter(param, false)).join(", ");
      const params = parsedArgs ? " use (" + parsedArgs + ")" : "";
      const bodyStms = [...node.body.statements];
      const firstBodyStm = this.printNode(bodyStms[0], identation + 2);
      bodyStms.shift();
      const funcBody = bodyStms.map((s) => this.printNode(s, identation + 2)).join("\n");
      const bodyParts = firstBodyStm.split("\n");
      const commentPart = bodyParts.filter((line) => this.isComment(line));
      const isComment = commentPart.length > 0;
      let header = this.getIden(identation + 1) + "return Async\\async(function ()" + params + " {\n";
      if (isComment) {
        const commentPartString = commentPart.map((c) => this.getIden(identation + 1) + c.trim()).join("\n");
        const firstStmNoComment = bodyParts.filter((line) => !this.isComment(line)).join("\n");
        header = commentPartString + "\n" + header + firstStmNoComment + "\n";
      } else {
        header += firstBodyStm + "\n";
      }
      const result = header + funcBody + "\n" + this.getIden(identation + 1) + "}) ();";
      return blockOpen + result + blockClose;
    }
    return super.printFunctionBody(node, identation);
  }
  printPropertyAccessModifiers(node) {
    const modifiers = super.printPropertyAccessModifiers(node);
    return modifiers ? modifiers : "public ";
  }
  transformLeadingComment(comment) {
    const commentRegex = [
      [/\{([\]\[\|a-zA-Z0-9_-]+?)\}/g, "~$1~"],
      // eslint-disable-line -- resolve the "arrays vs url params" conflict (both are in {}-brackets)
      [/\[([^\]\[]*)\]\{(@link .*)\}/g, "~$2 $1~"],
      // eslint-disable-line -- docstring item with link
      [/\s+\* @method/g, ""],
      // docstring @method
      [/(\s+)\* @description (.*)/g, "$1* $2"],
      // eslint-disable-line
      [/\s+\* @name .*/g, ""],
      // docstring @name
      [/(\s+)\* @returns/g, "$1* @return"],
      // eslint-disable-line
      [/\~([\]\[\|@\.\s+\:\/#\-a-zA-Z0-9_-]+?)\~/g, "{$1}"],
      // eslint-disable-line -- resolve the "arrays vs url params" conflict (both are in {}-brackets)
      [/(\s+ \* @(param|return) {[^}]*)object([^}]*}.*)/g, "$1array$3"]
      // docstring type conversion
    ];
    const transformed = regexAll(comment, commentRegex);
    return transformed;
  }
  initConfig() {
    this.LeftPropertyAccessReplacements = {
      "this": "$this"
    };
    this.RightPropertyAccessReplacements = {};
    this.FullPropertyAccessReplacements = {
      "Number.MAX_SAFE_INTEGER": "PHP_INT_MAX",
      "JSON.stringify": "json_encode",
      "console.log": "var_dump",
      "process.exit": "exit",
      "Math.log": "log",
      "Math.abs": "abs",
      "Math.floor": "(int) floor",
      "Math.ceil": "(int) ceil",
      "Math.round": "(int) round",
      "Math.pow": "pow",
      "Math.min": "min",
      "Math.max": "max"
      // 'Promise.all': '\\React\\Promise\\all',
    };
    this.CallExpressionReplacements = {
      "parseFloat": "floatval",
      "parseInt": "intval"
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
};

// src/csharpTranspiler.ts
init_cjs_shims();

var parserConfig3 = {
  "ELSEIF_TOKEN": "else if",
  "OBJECT_OPENING": "new Dictionary<string, object>() {",
  "ARRAY_OPENING_TOKEN": "new List<object>() {",
  "ARRAY_CLOSING_TOKEN": "}",
  "PROPERTY_ASSIGNMENT_TOKEN": ",",
  "VAR_TOKEN": "object",
  // object
  "METHOD_TOKEN": "",
  "PROPERTY_ASSIGNMENT_OPEN": "{",
  "PROPERTY_ASSIGNMENT_CLOSE": "}",
  "SUPER_TOKEN": "base",
  "SUPER_CALL_TOKEN": "base",
  "FALSY_WRAPPER_OPEN": "isTrue(",
  "FALSY_WRAPPER_CLOSE": ")",
  "COMPARISON_WRAPPER_OPEN": "isEqual(",
  "COMPARISON_WRAPPER_CLOSE": ")",
  "UKNOWN_PROP_WRAPPER_OPEN": "this.call(",
  "UNKOWN_PROP_WRAPPER_CLOSE": ")",
  "UKNOWN_PROP_ASYNC_WRAPPER_OPEN": "this.callAsync(",
  "UNKOWN_PROP_ASYNC_WRAPPER_CLOSE": ")",
  "DYNAMIC_CALL_OPEN": "callDynamically(",
  "EQUALS_EQUALS_WRAPPER_OPEN": "isEqual(",
  "EQUALS_EQUALS_WRAPPER_CLOSE": ")",
  "DIFFERENT_WRAPPER_OPEN": "!isEqual(",
  "DIFFERENT_WRAPPER_CLOSE": ")",
  "GREATER_THAN_WRAPPER_OPEN": "isGreaterThan(",
  "GREATER_THAN_WRAPPER_CLOSE": ")",
  "GREATER_THAN_EQUALS_WRAPPER_OPEN": "isGreaterThanOrEqual(",
  "GREATER_THAN_EQUALS_WRAPPER_CLOSE": ")",
  "LESS_THAN_WRAPPER_OPEN": "isLessThan(",
  "LESS_THAN_WRAPPER_CLOSE": ")",
  "LESS_THAN_EQUALS_WRAPPER_OPEN": "isLessThanOrEqual(",
  "LESS_THAN_EQUALS_WRAPPER_CLOSE": ")",
  "PLUS_WRAPPER_OPEN": "add(",
  "PLUS_WRAPPER_CLOSE": ")",
  "MINUS_WRAPPER_OPEN": "subtract(",
  "MINUS_WRAPPER_CLOSE": ")",
  "ARRAY_LENGTH_WRAPPER_OPEN": "getArrayLength(",
  "ARRAY_LENGTH_WRAPPER_CLOSE": ")",
  "DIVIDE_WRAPPER_OPEN": "divide(",
  "DIVIDE_WRAPPER_CLOSE": ")",
  "MULTIPLY_WRAPPER_OPEN": "multiply(",
  "MULTIPLY_WRAPPER_CLOSE": ")",
  "INDEXOF_WRAPPER_OPEN": "getIndexOf(",
  "INDEXOF_WRAPPER_CLOSE": ")",
  "MOD_WRAPPER_OPEN": "mod(",
  "MOD_WRAPPER_CLOSE": ")",
  "FUNCTION_TOKEN": "",
  "INFER_VAR_TYPE": false,
  "INFER_ARG_TYPE": false
};
var CSHARP_METHOD_RETURN_TYPES = {
  "toUpperCase": "string",
  "toLowerCase": "string",
  "toString": "string",
  "trim": "string",
  "join": "string",
  "replace": "string",
  "replaceAll": "string",
  "split": "List<object>",
  "startsWith": "bool",
  "endsWith": "bool",
  "indexOf": "int",
  "search": "int"
};
var CSHARP_STATIC_RETURN_TYPES = {
  "Object.keys": "List<object>",
  "Object.values": "List<object>",
  "Object.entries": "List<object>",
  "JSON.stringify": "string",
  "Math.floor": "double",
  "Math.ceil": "double",
  "Math.round": "double",
  "Array.isArray": "bool",
  "Number.isInteger": "bool"
};
var CSHARP_THIS_RETURN_TYPES = {
  "extend": "Dictionary<string, object>",
  "deepExtend": "Dictionary<string, object>",
  "indexBy": "Dictionary<string, object>",
  "groupBy": "Dictionary<string, object>",
  "milliseconds": "Int64",
  "seconds": "Int64",
  "microseconds": "Int64",
  "uuid": "string",
  "hmac": "string",
  "capitalize": "string",
  "ymdhms": "string",
  "yyyymmdd": "string",
  "json": "string",
  "inArray": "bool",
  "valueIsDefined": "bool",
  // the safe* accessor family: cs/ccxt/base already declares these with a concrete
  // return type (`string? safeString(...)`, `Int64? safeInteger(...)`, `bool? safeBool(...)`,
  // `IDictionary<string, object> safeDict(...)`, `List<object> safeList(...)`, ...), so a
  // local initialised by one of them already holds that type inside its `object` box
  "safeString": "string?",
  "safeString2": "string?",
  "safeStringN": "string?",
  "safeStringLower": "string?",
  "safeStringLower2": "string?",
  "safeStringLowerN": "string?",
  "safeStringUpper": "string?",
  "safeStringUpper2": "string?",
  "safeStringUpperN": "string?",
  "safeCurrencyCode": "string?",
  "safeInteger": "Int64?",
  "safeInteger2": "Int64?",
  "safeIntegerN": "Int64?",
  "safeIntegerProduct": "Int64?",
  "safeFloat": "double?",
  "safeFloat2": "double?",
  "safeFloatN": "double?",
  "safeNumberN": "double?",
  "safeBool": "bool?",
  "safeBool2": "bool?",
  "safeBoolN": "bool?",
  "safeDict": "IDictionary<string, object>",
  "safeDict2": "IDictionary<string, object>",
  "safeDictN": "IDictionary<string, object>",
  "safeList": "List<object>",
  "safeList2": "List<object>",
  "safeListN": "List<object>"
};
var CSHARP_SAFE_ACCESSOR_NAMES = [
  "safeString",
  "safeString2",
  "safeStringN",
  "safeStringLower",
  "safeStringLower2",
  "safeStringLowerN",
  "safeStringUpper",
  "safeStringUpper2",
  "safeStringUpperN",
  "safeCurrencyCode",
  "safeInteger",
  "safeInteger2",
  "safeIntegerN",
  "safeIntegerProduct",
  "safeFloat",
  "safeFloat2",
  "safeFloatN",
  "safeNumberN",
  "safeBool",
  "safeBool2",
  "safeBoolN",
  "safeDict",
  "safeDict2",
  "safeDictN",
  "safeList",
  "safeList2",
  "safeListN"
];
var CSHARP_TYPE_NAMES = ["string", "bool", "int", "long", "Int64", "double", "object", "List", "IList", "Dictionary", "IDictionary", "var"];
var GUARD_KEY_SEPARATOR = "\0";
var CSHARP_NUMERIC_KINDS = ["int", "Int64", "double"];
var CSHARP_NATIVE_COMPARISON_TOKENS = {
  [_typescript2.default.SyntaxKind.LessThanToken]: "<",
  [_typescript2.default.SyntaxKind.GreaterThanToken]: ">",
  [_typescript2.default.SyntaxKind.LessThanEqualsToken]: "<=",
  [_typescript2.default.SyntaxKind.GreaterThanEqualsToken]: ">="
};
var CSHARP_NATIVE_FIELDS = {
  "options": "ConcurrentDictionary<string, object>",
  "features": "Dictionary<string, object>",
  "httpExceptions": "Dictionary<string, object>",
  "markets_by_id": "IDictionary<string, object>",
  "symbols": "List<object>",
  "codes": "List<object>",
  "ids": "List<object>"
};
var CSHARP_OBJECT_DICT_FIELDS = ["urls", "tickers", "bidsasks", "orderbooks", "ohlcvs", "trades", "markets", "currencies", "currencies_by_id"];
var CSHARP_NATIVE_COLLECTION_TYPES = ["List<object>", "IList<object>", "Dictionary<string, object>", "IDictionary<string, object>"];
var CSharpTranspiler = class extends BaseTranspiler {
  constructor(config = {}) {
    config["parser"] = Object.assign({}, parserConfig3, _nullishCoalesce(config["parser"], () => ( {})));
    super(config);
    // method node -> 'bool' | 'bool?' | undefined (see csharpBooleanReturnType)
    this.csharpBooleanReturnTypes = /* @__PURE__ */ new WeakMap();
    // variable declaration -> getCSharpLocalType result, shared by the condition checks
    this.csharpLocalTypes = /* @__PURE__ */ new WeakMap();
    // method node -> `key in recv` guards of that method, keyed by receiver text + key
    this.csharpGuardIndex = /* @__PURE__ */ new WeakMap();
    // variable declaration -> the concrete C# type this printer named for it
    // (getCSharpLocalType): 'List<object>' / 'Dictionary<string, object>' / 'string' / ...
    // Only declarations the printer typed itself are kept: the printed `<type> name = `
    // prefix is final, so every later read of the local is statically that type and its
    // members may replace inOp/getArrayLength
    this.csharpTypedLocals = /* @__PURE__ */ new WeakMap();
    this.csModifiers = {};
    this.requiresParameterType = true;
    this.requiresReturnType = true;
    this.asyncTranspiling = true;
    this.implicitAsyncTranspiling = true;
    this.supportsFalsyOrTruthyValues = false;
    this.requiresCallExpressionCast = true;
    this.id = "C#";
    this.initConfig();
    this.applyUserOverrides(config);
  }
  initConfig() {
    this.LeftPropertyAccessReplacements = {
      // 'this': '$this',
    };
    this.RightPropertyAccessReplacements = {
      "push": "Add",
      // list method
      "indexOf": "IndexOf",
      // list method
      "toUpperCase": "ToUpper",
      "toLowerCase": "ToLower",
      "toString": "ToString"
    };
    this.FullPropertyAccessReplacements = {
      "JSON.parse": "parseJson",
      // custom helper method
      "console.log": "Console.WriteLine",
      "Number.MAX_SAFE_INTEGER": "Int32.MaxValue",
      "Math.min": "Math.Min",
      "Math.max": "Math.Max",
      "Math.log": "Math.Log",
      "Math.abs": "Math.Abs",
      // 'Math.ceil':  'Math.Ceiling', // need cast
      // 'Math.round': 'Math.Round', // need to cast
      "Math.floor": "Math.Floor",
      "Math.pow": "Math.Pow"
      // 'Promise.all': 'Task.WhenAll',
    };
    this.CallExpressionReplacements = {
      // "parseInt": "parseINt",
      // "parseFloat": "float.Parse",
    };
    this.ReservedKeywordsReplacements = {
      "string": "str",
      "object": "obj",
      "params": "parameters",
      "base": "bs",
      "internal": "intern",
      "event": "eventVar",
      "fixed": "fixedVar"
    };
    this.VariableTypeReplacements = {
      "string": "string",
      "Str": "string",
      "number": "double",
      "Int": "Int64",
      "Num": "double",
      "Dict": "Dictionary<string, object>",
      "Strings": "List<string>",
      "List": "List<object>",
      "boolean": "bool"
    };
    this.ArgTypeReplacements = {
      "string": "string",
      "Str": "string",
      "number": "double",
      "Int": "Int64",
      "Num": "double",
      "Dict": "Dictionary<string, object>",
      "Strings": "List<string>",
      "List": "List<object>",
      "boolean": "bool"
    };
    this.binaryExpressionsWrappers = {
      [_typescript2.default.SyntaxKind.EqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.EqualsEqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.ExclamationEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.GreaterThanToken]: [this.GREATER_THAN_WRAPPER_OPEN, this.GREATER_THAN_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.GreaterThanEqualsToken]: [this.GREATER_THAN_EQUALS_WRAPPER_OPEN, this.GREATER_THAN_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.LessThanToken]: [this.LESS_THAN_WRAPPER_OPEN, this.LESS_THAN_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.LessThanEqualsToken]: [this.LESS_THAN_EQUALS_WRAPPER_OPEN, this.LESS_THAN_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.PlusToken]: [this.PLUS_WRAPPER_OPEN, this.PLUS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.MinusToken]: [this.MINUS_WRAPPER_OPEN, this.MINUS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.AsteriskToken]: [this.MULTIPLY_WRAPPER_OPEN, this.MULTIPLY_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.PercentToken]: [this.MOD_WRAPPER_OPEN, this.MOD_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.SlashToken]: [this.DIVIDE_WRAPPER_OPEN, this.DIVIDE_WRAPPER_CLOSE]
    };
  }
  getBlockOpen(identation) {
    return "\n" + this.getIden(identation) + this.BLOCK_OPENING_TOKEN + "\n";
  }
  printSuperCallInsideConstructor(node, identation) {
    return "";
  }
  printIdentifier(node) {
    let idValue = _nullishCoalesce(node.text, () => ( node.escapedText));
    if (this.ReservedKeywordsReplacements[idValue]) {
      idValue = this.ReservedKeywordsReplacements[idValue];
    }
    if (idValue === "undefined") {
      return this.UNDEFINED_TOKEN;
    }
    const type = this.getChecker().getTypeAtLocation(node);
    const symbol = _optionalChain([type, 'optionalAccess', _56 => _56.symbol]);
    if (symbol !== void 0) {
      const decl = _nullishCoalesce(_optionalChain([symbol, 'optionalAccess', _57 => _57.declarations]), () => ( []));
      let isBuiltIn = void 0;
      if (decl.length > 0) {
        isBuiltIn = decl[0].getSourceFile().fileName.indexOf("typescript") > -1;
      }
      if (isBuiltIn !== void 0 && !isBuiltIn) {
        const isInsideNewExpression = _optionalChain([node, 'optionalAccess', _58 => _58.parent, 'optionalAccess', _59 => _59.kind]) === _typescript2.default.SyntaxKind.NewExpression;
        const isInsideCatch = _optionalChain([node, 'optionalAccess', _60 => _60.parent, 'optionalAccess', _61 => _61.kind]) === _typescript2.default.SyntaxKind.ThrowStatement;
        const isLeftSide = _optionalChain([node, 'optionalAccess', _62 => _62.parent, 'optionalAccess', _63 => _63.name]) === node || _optionalChain([node, 'optionalAccess', _64 => _64.parent, 'optionalAccess', _65 => _65.left]) === node;
        const isCallOrPropertyAccess = _optionalChain([node, 'optionalAccess', _66 => _66.parent, 'optionalAccess', _67 => _67.kind]) === _typescript2.default.SyntaxKind.PropertyAccessExpression || _optionalChain([node, 'optionalAccess', _68 => _68.parent, 'optionalAccess', _69 => _69.kind]) === _typescript2.default.SyntaxKind.ElementAccessExpression;
        if (!isLeftSide && !isCallOrPropertyAccess && !isInsideCatch && !isInsideNewExpression) {
          const symbol2 = this.getChecker().getSymbolAtLocation(node);
          let isClassDeclaration = false;
          if (symbol2) {
            const first = symbol2.declarations[0];
            if (first.kind === _typescript2.default.SyntaxKind.ClassDeclaration) {
              isClassDeclaration = true;
            }
            if (first.kind === _typescript2.default.SyntaxKind.ImportSpecifier) {
              const importedSymbol = this.getChecker().getAliasedSymbol(symbol2);
              if (_optionalChain([importedSymbol, 'optionalAccess', _70 => _70.declarations, 'access', _71 => _71[0], 'optionalAccess', _72 => _72.kind]) === _typescript2.default.SyntaxKind.ClassDeclaration) {
                isClassDeclaration = true;
              }
            }
          }
          if (isClassDeclaration) {
            return `typeof(${idValue})`;
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
    let superCallParams = "";
    let hasSuperCall = false;
    _optionalChain([node, 'access', _73 => _73.body, 'optionalAccess', _74 => _74.statements, 'access', _75 => _75.forEach, 'call', _76 => _76((statement) => {
      if (_typescript2.default.isExpressionStatement(statement)) {
        const expression = statement.expression;
        if (_typescript2.default.isCallExpression(expression)) {
          const expressionText = expression.expression.getText().trim();
          if (expressionText === "super") {
            hasSuperCall = true;
            superCallParams = expression.arguments.map((a) => {
              return this.printNode(a, identation).trim();
            }).join(", ");
          }
        }
      }
    })]);
    if (hasSuperCall) {
      return this.getIden(identation) + className + `(${args}) : ${this.SUPER_CALL_TOKEN}(${superCallParams})` + constructorBody;
    }
    return this.getIden(identation) + className + "(" + args + ")" + constructorBody;
  }
  printThisElementAccesssIfNeeded(node, identation) {
    const isAsync = true;
    const elementAccess = node.expression;
    if (_optionalChain([elementAccess, 'optionalAccess', _77 => _77.kind]) === _typescript2.default.SyntaxKind.ElementAccessExpression) {
      if (_optionalChain([elementAccess, 'optionalAccess', _78 => _78.expression, 'optionalAccess', _79 => _79.kind]) === _typescript2.default.SyntaxKind.ThisKeyword) {
        let parsedArg = _optionalChain([node, 'access', _80 => _80.arguments, 'optionalAccess', _81 => _81.length]) > 0 ? this.printNode(node.arguments[0], identation).trimStart() : "";
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
    const isAsync = true;
    const elementAccess = node.expression;
    if (_optionalChain([elementAccess, 'optionalAccess', _82 => _82.kind]) === _typescript2.default.SyntaxKind.ElementAccessExpression) {
      const parsedArg = _optionalChain([node, 'access', _83 => _83.arguments, 'optionalAccess', _84 => _84.length]) > 0 ? node.arguments.map((n) => this.printNode(n, identation).trimStart()).join(", ") : "";
      const target = this.printNode(elementAccess.expression, 0);
      const propName = this.printNode(elementAccess.argumentExpression, 0);
      const argsArray = `new object[] { ${parsedArg} }`;
      const open = this.DYNAMIC_CALL_OPEN;
      let statement = `${open}${target}, ${propName}, ${argsArray})`;
      statement = isAsync ? `((Task<object>)${statement})` : statement;
      return statement;
    }
    return void 0;
  }
  printElementAccessExpressionExceptionIfAny(node) {
  }
  // reads print getValue(recv, key), which yields null for a missing key; a C# indexer
  // throws instead, so the native form is only emitted where the source guarantees the key
  // is there: a dominating `key in recv` guard, or a receiver local built by a literal that
  // declares the key. every other read keeps the helper.
  printElementAccessExpression(node, identation) {
    const native = this.csharpNativeElementAccess(node);
    if (native !== void 0) {
      return native;
    }
    return super.printElementAccessExpression(node, identation);
  }
  csharpNativeElementAccess(node) {
    if (!this.ELEMENT_ACCESS_WRAPPER_OPEN || !this.ELEMENT_ACCESS_WRAPPER_CLOSE) {
      return void 0;
    }
    const exception = this.printElementAccessExpressionExceptionIfAny(node);
    if (exception) {
      return void 0;
    }
    const { expression, argumentExpression } = node;
    const parent = node.parent;
    const isWrite = _optionalChain([parent, 'optionalAccess', _85 => _85.kind]) === _typescript2.default.SyntaxKind.BinaryExpression && (parent.operatorToken.kind === _typescript2.default.SyntaxKind.EqualsToken || parent.operatorToken.kind === _typescript2.default.SyntaxKind.PlusEqualsToken) && parent.left === node;
    if (isWrite) {
      return void 0;
    }
    const isStringKey = _typescript2.default.isStringLiteralLike(argumentExpression);
    const isNumberKey = _typescript2.default.isNumericLiteral(argumentExpression);
    if (!isStringKey && !isNumberKey) {
      return void 0;
    }
    const key = argumentExpression.text;
    const builtFromLiteral = this.csharpLiteralDeclaresKey(node, expression, key, isNumberKey);
    const guarded = !builtFromLiteral && this.csharpKeyPresenceGuarded(node, expression, key);
    if (!builtFromLiteral && !guarded) {
      return void 0;
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
  csharpKeyPresenceGuarded(node, expression, key) {
    const func = this.csharpEnclosingFunction(node);
    if (func === void 0 || this.csharpEnclosingFunction(node) !== func) {
      return false;
    }
    const guards = this.csharpInGuardsOf(func).get(expression.getText() + GUARD_KEY_SEPARATOR + key);
    if (guards === void 0 || !this.csharpReceiverIsDictionaryLike(expression, key)) {
      return false;
    }
    if (this.csharpReceiverIsRewritten(func, expression)) {
      return false;
    }
    if (this.csharpHasKeyRemoval(func, expression, key)) {
      return false;
    }
    for (const guard of guards) {
      if (this.csharpGuardAdmitsRead(guard, node)) {
        return true;
      }
    }
    return false;
  }
  csharpGuardAdmitsRead(guard, read) {
    const negated = this.csharpGuardIsNegated(guard);
    let statement = guard;
    while (statement !== void 0 && statement.parent !== void 0) {
      const parent = statement.parent;
      if (_typescript2.default.isIfStatement(parent) && this.csharpContains(parent.expression, guard)) {
        if (!negated && this.csharpContains(parent.thenStatement, read)) {
          return true;
        }
        if (negated && parent.elseStatement !== void 0 && this.csharpContains(parent.elseStatement, read)) {
          return true;
        }
        if (negated && this.csharpAlwaysExits(parent.thenStatement) && read.getStart() >= parent.getEnd() && this.csharpContains(parent.parent, read)) {
          return true;
        }
        return false;
      }
      if (_typescript2.default.isWhileStatement(parent) && this.csharpContains(parent.expression, guard)) {
        return !negated && this.csharpContains(parent.statement, read);
      }
      statement = parent;
    }
    return false;
  }
  // `key in recv` guards in the function body, indexed by receiver text + key; nested
  // functions are skipped, their guards cannot dominate a read of the outer function
  csharpInGuardsOf(func) {
    const cached = this.csharpGuardIndex.get(func);
    if (cached !== void 0) {
      return cached;
    }
    const index = /* @__PURE__ */ new Map();
    const collect = (n) => {
      if (n !== func && _typescript2.default.isFunctionLike(n)) {
        return;
      }
      if (_typescript2.default.isBinaryExpression(n) && n.operatorToken.kind === _typescript2.default.SyntaxKind.InKeyword) {
        const keyNode = n.left;
        if (_typescript2.default.isStringLiteralLike(keyNode) || _typescript2.default.isNumericLiteral(keyNode)) {
          const id = n.right.getText() + GUARD_KEY_SEPARATOR + keyNode.text;
          const list = index.get(id);
          if (list === void 0) {
            index.set(id, [n]);
          } else {
            list.push(n);
          }
        }
      }
      _typescript2.default.forEachChild(n, collect);
    };
    collect(func);
    this.csharpGuardIndex.set(func, index);
    return index;
  }
  // the read's receiver is a local whose only initializer is a literal that declares the
  // key, and the local is not reassigned or deleted from afterwards
  csharpLiteralDeclaresKey(node, expression, key, isNumberKey) {
    if (!_typescript2.default.isIdentifier(expression)) {
      return false;
    }
    const symbol = this.getChecker().getSymbolAtLocation(expression);
    const declarations = _nullishCoalesce(_optionalChain([symbol, 'optionalAccess', _86 => _86.declarations]), () => ( []));
    if (declarations.length !== 1 || !_typescript2.default.isVariableDeclaration(declarations[0])) {
      return false;
    }
    const declaration = declarations[0];
    if (declaration.initializer === void 0 || declaration.getStart() >= node.getStart()) {
      return false;
    }
    const initializer = declaration.initializer;
    let declares = false;
    if (isNumberKey && _typescript2.default.isArrayLiteralExpression(initializer)) {
      const spread = initializer.elements.some((element) => _typescript2.default.isSpreadElement(element));
      declares = !spread && Number(key) < initializer.elements.length;
    } else if (!isNumberKey && _typescript2.default.isObjectLiteralExpression(initializer)) {
      declares = this.csharpObjectLiteralDeclaresKey(initializer, key);
    }
    if (!declares) {
      return false;
    }
    const func = this.csharpEnclosingFunction(node);
    return func !== void 0 && !this.csharpReceiverIsRewritten(func, expression);
  }
  csharpObjectLiteralDeclaresKey(literal, key) {
    for (const property of literal.properties) {
      if (_typescript2.default.isSpreadAssignment(property)) {
        return false;
      }
      const name = property.name;
      if (name !== void 0 && (_typescript2.default.isIdentifier(name) || _typescript2.default.isStringLiteralLike(name) || _typescript2.default.isNumericLiteral(name)) && name.text === key) {
        return true;
      }
    }
    return false;
  }
  // the receiver must be a dictionary at runtime for the IDictionary cast to hold; `any`
  // receivers are rejected because the checker cannot tell what the read reaches
  csharpReceiverIsDictionaryLike(expression, key) {
    const type = this.getChecker().getTypeAtLocation(expression);
    if (type.flags === _typescript2.default.TypeFlags.Any || type.flags === _typescript2.default.TypeFlags.Unknown) {
      return false;
    }
    const checker = this.getChecker();
    return checker.getIndexInfoOfType(type, _typescript2.default.IndexKind.String) !== void 0 || checker.getPropertyOfType(type, key) !== void 0;
  }
  // any assignment to the receiver (or to a same-named binding) in the function makes the
  // object the read evaluates unprovable, so the read falls back to the helper
  csharpReceiverIsRewritten(func, expression) {
    const text = expression.getText();
    const name = _typescript2.default.isIdentifier(expression) ? text : text.split(/[.\[]/)[1];
    if (name === void 0) {
      return true;
    }
    let rewritten = false;
    const walk = (n) => {
      if (rewritten) {
        return;
      }
      if (_typescript2.default.isIdentifier(n) && n.text === name) {
        const parent = n.parent;
        if (_typescript2.default.isBinaryExpression(parent) && parent.left === n) {
          rewritten = true;
        } else if ((_typescript2.default.isPrefixUnaryExpression(parent) || _typescript2.default.isPostfixUnaryExpression(parent)) && parent.operand === n) {
          rewritten = true;
        } else if (_typescript2.default.isDeleteExpression(parent)) {
          rewritten = true;
        }
      }
      _typescript2.default.forEachChild(n, walk);
    };
    walk(func);
    return rewritten;
  }
  csharpHasKeyRemoval(func, expression, key) {
    const text = expression.getText();
    let removed = false;
    const walk = (n) => {
      if (removed) {
        return;
      }
      if (_typescript2.default.isDeleteExpression(n) && _typescript2.default.isElementAccessExpression(n.expression) && n.expression.expression.getText() === text && n.expression.argumentExpression.getText().replace(/['"]/g, "") === key.replace(/['"]/g, "")) {
        removed = true;
      }
      _typescript2.default.forEachChild(n, walk);
    };
    walk(func);
    return removed;
  }
  csharpGuardIsNegated(guard) {
    let node = guard;
    while (node.parent !== void 0 && _typescript2.default.isParenthesizedExpression(node.parent)) {
      node = node.parent;
    }
    return node.parent !== void 0 && _typescript2.default.isPrefixUnaryExpression(node.parent) && node.parent.operator === _typescript2.default.SyntaxKind.ExclamationToken;
  }
  csharpAlwaysExits(statement) {
    if (statement === void 0) {
      return false;
    }
    const exits = (n) => _typescript2.default.isReturnStatement(n) || _typescript2.default.isThrowStatement(n) || _typescript2.default.isContinueStatement(n) || _typescript2.default.isBreakStatement(n);
    if (exits(statement)) {
      return true;
    }
    if (_typescript2.default.isBlock(statement) && statement.statements.length > 0) {
      return exits(statement.statements[statement.statements.length - 1]);
    }
    return false;
  }
  csharpContains(outer, inner) {
    if (outer === void 0 || inner === void 0) {
      return false;
    }
    return inner.getStart() >= outer.getStart() && inner.getEnd() <= outer.getEnd();
  }
  printWrappedUnknownThisProperty(node) {
    const type = this.getChecker().getResolvedSignature(node);
    if (_optionalChain([type, 'optionalAccess', _87 => _87.declaration]) === void 0) {
      let parsedArguments = _optionalChain([node, 'access', _88 => _88.arguments, 'optionalAccess', _89 => _89.map, 'call', _90 => _90((a) => this.printNode(a, 0)), 'access', _91 => _91.join, 'call', _92 => _92(", ")]);
      parsedArguments = parsedArguments ? parsedArguments : "";
      const propName = _optionalChain([node, 'access', _93 => _93.expression, 'optionalAccess', _94 => _94.name, 'access', _95 => _95.escapedText]);
      const isAsyncDecl = _optionalChain([node, 'optionalAccess', _96 => _96.parent, 'optionalAccess', _97 => _97.kind]) === _typescript2.default.SyntaxKind.AwaitExpression;
      const argsArray = `new object[] { ${parsedArguments} }`;
      const open = this.DYNAMIC_CALL_OPEN;
      let statement = `${open}this, "${propName}", ${argsArray})`;
      statement = isAsyncDecl ? `((Task<object>)${statement})` : statement;
      return statement;
    }
    return void 0;
  }
  printOutOfOrderCallExpressionIfAny(node, identation) {
    if (node.expression.kind === _typescript2.default.SyntaxKind.PropertyAccessExpression) {
      const expressionText = node.expression.getText().trim();
      const args = node.arguments;
      if (args.length === 1) {
        const parsedArg = this.printNode(args[0], 0);
        switch (expressionText) {
          case "Math.abs":
            return `Math.Abs(Convert.ToDouble(${parsedArg}))`;
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
            return `Math.Pow(Convert.ToDouble(${parsedArg1}), Convert.ToDouble(${parsedArg2}))`;
        }
      }
      const leftSide = _optionalChain([node, 'access', _98 => _98.expression, 'optionalAccess', _99 => _99.expression]);
      const leftSideText = leftSide ? this.printNode(leftSide, 0) : void 0;
      if (leftSideText === this.THIS_TOKEN || leftSide.getFullText().indexOf("(this as any)") > -1) {
        const res = this.printWrappedUnknownThisProperty(node);
        if (res) {
          return res;
        }
      }
    }
    if (node.expression.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
      return this.printDynamicCall(node, identation);
    }
    return void 0;
  }
  handleTypeOfInsideBinaryExpression(node, identation) {
    const left = node.left;
    const right = node.right.text;
    const op = node.operatorToken.kind;
    const expression = left.expression;
    const isDifferentOperator = op === _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken || op === _typescript2.default.SyntaxKind.ExclamationEqualsToken;
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
    return void 0;
  }
  // The C# type of an operand of `==` / `!=` as the printer emits it, or undefined when
  // the printer only knows `object`: an `object` operand takes the reference-comparing
  // `operator ==`, so those keep the isEqual helper.
  csharpEqualityOperandType(node) {
    if (node === void 0) {
      return void 0;
    }
    switch (node.kind) {
      case _typescript2.default.SyntaxKind.NullKeyword:
        return "null";
      case _typescript2.default.SyntaxKind.TrueKeyword:
      case _typescript2.default.SyntaxKind.FalseKeyword:
        return "bool";
      case _typescript2.default.SyntaxKind.NumericLiteral:
        return this.csharpNumericLiteralKind(node);
      case _typescript2.default.SyntaxKind.ParenthesizedExpression:
        return this.csharpEqualityOperandType(node.expression);
      case _typescript2.default.SyntaxKind.Identifier:
        return node.escapedText === "undefined" ? "null" : this.csharpDeclaredTypeOfBinding(node);
    }
    if (_typescript2.default.isStringLiteralLike(node)) {
      return "string";
    }
    return this.csharpTypeOfInitializer(node);
  }
  // A numeric literal prints as an untyped C# constant that adapts to the operand on the
  // other side. isEqual's integer branches round-trip through Convert.ToInt64, which an
  // integer literal beyond 2^53 does not survive, so those stay on the helper.
  csharpNumericLiteralKind(node) {
    const value = Number(node.text);
    if (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)) {
      return void 0;
    }
    return "number";
  }
  // the C# type the declaration behind an identifier was printed with ('object' when the
  // printer named none), or undefined when the identifier is not a printed local
  csharpDeclaredTypeOfBinding(node) {
    let symbol;
    try {
      symbol = this.getChecker().getSymbolAtLocation(node);
    } catch (e) {
      return void 0;
    }
    const declaration = _optionalChain([symbol, 'optionalAccess', _100 => _100.valueDeclaration]);
    if (declaration === void 0) {
      return void 0;
    }
    if (declaration.kind === _typescript2.default.SyntaxKind.VariableDeclaration) {
      return this.getCSharpLocalType(declaration);
    }
    if (declaration.kind === _typescript2.default.SyntaxKind.BindingElement) {
      return "var";
    }
    return void 0;
  }
  // the C# operator family an operand belongs to: `==` compares two operands of one family
  // by value, exactly like the isEqual branches those types take
  csharpValueEqualityKind(csharpType) {
    switch (csharpType) {
      case "string":
      case "string?":
        return "string";
      case "bool":
      case "bool?":
        return "bool";
      case "double":
      case "double?":
        return "double";
      case "Int64":
      case "long":
      case "Int64?":
      case "long?":
        return "Int64";
      case "int":
      case "int?":
        return "int";
      case "number":
        return "number";
    }
    return void 0;
  }
  // `x == null` compiles — and matches isEqual — for reference types and nullable value
  // types, but not for a non-nullable value type (double / bool / Int64 / int). Lists,
  // dictionaries, class instances and `var` are references, and are the only types left
  // once csharpValueEqualityKind has claimed the value-typed names above.
  csharpIsNullComparableType(csharpType) {
    if (csharpType === void 0 || csharpType === "" || csharpType === "null") {
      return false;
    }
    if (csharpType.endsWith("?")) {
      return true;
    }
    if (csharpType === "object" || csharpType === "string") {
      return true;
    }
    return this.csharpValueEqualityKind(csharpType) === void 0;
  }
  // TypeScript numbers and booleans are C# value types in this port (double / bool /
  // Int64 / int), and the ccxt build script retypes some `object` declarations to exactly
  // those from its own tables (precisionFromString -> int, milliseconds -> Int64,
  // isEmpty -> bool). A null comparison against one of them would not compile, and the
  // printer's `object` cannot rule it out, so these always keep the helper.
  csharpOperandIsValueTyped(node) {
    if (node === void 0) {
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
  csharpTypeHasValueScalar(type) {
    if (type === void 0) {
      return true;
    }
    const flags = type.flags;
    if (flags & _typescript2.default.TypeFlags.Union) {
      const members = _nullishCoalesce(type.types, () => ( []));
      return members.some((member) => this.csharpTypeHasValueScalar(member));
    }
    return (flags & (_typescript2.default.TypeFlags.Number | _typescript2.default.TypeFlags.NumberLiteral | _typescript2.default.TypeFlags.Boolean | _typescript2.default.TypeFlags.BooleanLiteral)) !== 0;
  }
  // `==` / `!=` in place of the isEqual wrapper when both operands are C# values of one
  // family, or one side is null/undefined against a type `== null` compiles for. Both
  // operands are printed once, so neither is evaluated twice.
  printInlineEquality(left, right, leftText, rightText, isEquality) {
    const leftType = this.csharpEqualityOperandType(left);
    const rightType = this.csharpEqualityOperandType(right);
    if (leftType === void 0 || rightType === void 0) {
      return void 0;
    }
    if (leftType === "null") {
      if (!this.csharpIsNullComparableType(rightType) || this.csharpOperandIsValueTyped(right)) {
        return void 0;
      }
      return this.csharpNullComparison(rightText, isEquality);
    }
    if (rightType === "null") {
      if (!this.csharpIsNullComparableType(leftType) || this.csharpOperandIsValueTyped(left)) {
        return void 0;
      }
      return this.csharpNullComparison(leftText, isEquality);
    }
    const leftKind = this.csharpValueEqualityKind(leftType);
    const rightKind = this.csharpValueEqualityKind(rightType);
    if (leftKind === void 0 || rightKind === void 0) {
      return void 0;
    }
    const numericKinds = ["double", "Int64", "int"];
    const sameKind = leftKind === rightKind;
    const literalVsNumeric = leftKind === "number" && numericKinds.indexOf(rightKind) >= 0 || rightKind === "number" && numericKinds.indexOf(leftKind) >= 0;
    if (!sameKind && !literalVsNumeric) {
      return void 0;
    }
    return isEquality ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
  }
  csharpNullComparison(text, isEquality) {
    return isEquality ? `(${text} == null)` : `(${text} != null)`;
  }
  // the concrete C# type of an expression the printer can name, or undefined: the embedding
  // build layer's proof wins (it retypes locals the printer leaves `object`), then the
  // printer's own tables and the literals whose C# type is fixed by their text
  csharpExpressionTypeOf(node) {
    const provided = this.csharpExpressionTypeResolver ? this.csharpExpressionTypeResolver(node) : void 0;
    if (provided !== void 0) {
      return provided;
    }
    if (_typescript2.default.isNumericLiteral(node)) {
      const value = Number(node.text);
      return Number.isInteger(value) && Math.abs(value) <= 2147483647 ? "int" : void 0;
    }
    if (_typescript2.default.isPrefixUnaryExpression(node) && node.operator === _typescript2.default.SyntaxKind.MinusToken && _typescript2.default.isNumericLiteral(node.operand)) {
      const value = Number(node.operand.text);
      return Number.isInteger(value) && value <= 2147483647 ? "int" : void 0;
    }
    return this.csharpTypeOfInitializer(node);
  }
  // the TypeScript checker must see two plain numbers: `any` (could be a string box) and a
  // nullable union (the helper orders null, C# would throw) both keep the runtime helper
  csharpOperandsAreNumbers(node) {
    const isNumber = (operand) => {
      let flags;
      try {
        flags = _optionalChain([this, 'access', _101 => _101.getChecker, 'call', _102 => _102(), 'access', _103 => _103.getTypeAtLocation, 'call', _104 => _104(operand), 'optionalAccess', _105 => _105.flags]);
      } catch (e) {
        return false;
      }
      return flags === _typescript2.default.TypeFlags.Number || flags === _typescript2.default.TypeFlags.NumberLiteral;
    };
    return isNumber(node.left) && isNumber(node.right);
  }
  // `<`, `>`, `<=`, `>=` on two operands of the same proven C# number kind print natively:
  // the helper compares the two boxes with the conversions the operator applies, and only
  // `double` carries a value (NaN) the two disagree on — see CSHARP_NUMERIC_KINDS
  csharpNativeNumericComparison(node, identation) {
    const token = CSHARP_NATIVE_COMPARISON_TOKENS[node.operatorToken.kind];
    if (token === void 0) {
      return void 0;
    }
    const leftKind = this.csharpExpressionTypeOf(node.left);
    const rightKind = this.csharpExpressionTypeOf(node.right);
    if (leftKind === void 0 || leftKind !== rightKind || CSHARP_NUMERIC_KINDS.indexOf(leftKind) < 0) {
      return void 0;
    }
    if (leftKind === "double" && (token === "<" || token === "<=")) {
      return void 0;
    }
    if (!this.csharpOperandsAreNumbers(node)) {
      return void 0;
    }
    const leftText = this.printNode(node.left, 0).trim();
    const rightText = this.printNode(node.right, 0).trim();
    return leftText + " " + token + " " + rightText;
  }
  // the printed receiver whose C# static type is a known collection: a local this
  // printer declared with a concrete type (csharpTypedLocals), or a hand-written
  // BaseExchange field. undefined keeps the runtime helper, since the printer cannot
  // name the type of the value the operand holds
  csharpNativeReceiver(node) {
    if (_optionalChain([node, 'optionalAccess', _106 => _106.kind]) === _typescript2.default.SyntaxKind.ParenthesizedExpression) {
      const inner = this.csharpNativeReceiver(node.expression);
      return inner === void 0 ? void 0 : { text: `(${inner.text})`, type: inner.type };
    }
    if (_typescript2.default.isIdentifier(node)) {
      const named = this.csharpTypedLocalType(node);
      return named === void 0 || CSHARP_NATIVE_COLLECTION_TYPES.indexOf(named) < 0 ? void 0 : { text: this.printNode(node, 0), type: named };
    }
    if (_typescript2.default.isPropertyAccessExpression(node) && _optionalChain([node, 'access', _107 => _107.expression, 'optionalAccess', _108 => _108.kind]) === _typescript2.default.SyntaxKind.ThisKeyword) {
      const name = _optionalChain([node, 'access', _109 => _109.name, 'optionalAccess', _110 => _110.escapedText]);
      if (CSHARP_OBJECT_DICT_FIELDS.indexOf(name) >= 0) {
        return { text: `((IDictionary<string, object>)${this.printNode(node, 0)})`, type: "IDictionary<string, object>" };
      }
      return CSHARP_NATIVE_FIELDS[name] === void 0 ? void 0 : { text: this.printNode(node, 0), type: CSHARP_NATIVE_FIELDS[name] };
    }
    const callType = this.csharpCallReturnType(node);
    if (callType !== void 0 && CSHARP_NATIVE_COLLECTION_TYPES.indexOf(callType) >= 0) {
      const printed = this.printNode(node, 0);
      return { text: printed.startsWith("new ") ? `(${printed})` : printed, type: callType };
    }
    return void 0;
  }
  // the C# types this printer can name on a local whose members replace the helpers:
  // the collection types (Count/ContainsKey) and string (Length/ContainsKey keys)
  csharpTypeIsNative(csharpType) {
    return CSHARP_NATIVE_COLLECTION_TYPES.indexOf(csharpType) >= 0 || csharpType.indexOf("string") === 0;
  }
  // the C# type this printer declared for a local read, or undefined
  csharpTypedLocalType(node) {
    const declaration = _optionalChain([this, 'access', _111 => _111.getChecker, 'call', _112 => _112(), 'access', _113 => _113.getSymbolAtLocation, 'call', _114 => _114(node), 'optionalAccess', _115 => _115.valueDeclaration]);
    return declaration === void 0 ? void 0 : this.csharpTypedLocals.get(declaration);
  }
  // the printed key of ContainsKey must itself be a C# string: a literal, a local this
  // printer declared `string`, a call it types as string, or its own `((string)x)` cast
  csharpNativeStringKey(key) {
    if (_optionalChain([key, 'optionalAccess', _116 => _116.kind]) === _typescript2.default.SyntaxKind.ParenthesizedExpression) {
      return this.csharpNativeStringKey(key.expression);
    }
    if (_typescript2.default.isStringLiteralLike(key)) {
      return this.printNode(key, 0);
    }
    if (_typescript2.default.isIdentifier(key)) {
      const named = this.csharpTypedLocalType(key);
      return named === void 0 || named.indexOf("string") !== 0 ? void 0 : this.printNode(key, 0);
    }
    if (this.csharpCallReturnType(key) === "string") {
      return this.printNode(key, 0);
    }
    const printed = this.printNode(key, 0);
    return printed.startsWith("((string)") ? printed : void 0;
  }
  // the checker's view of an `in` / `.length` operand: a dictionary carries a string
  // index signature, an array is the Array reference type. `any` proves nothing
  csharpIsDictionaryType(type) {
    if (type === void 0 || this.isAnyType(type.flags)) {
      return false;
    }
    return this.getChecker().getIndexTypeOfType(type, _typescript2.default.IndexKind.String) !== void 0;
  }
  csharpIsArrayType(type) {
    if (type === void 0 || this.isAnyType(type.flags)) {
      return false;
    }
    return _optionalChain([type, 'optionalAccess', _117 => _117.symbol, 'optionalAccess', _118 => _118.escapedName]) === "Array";
  }
  // `key in obj` -> `obj.ContainsKey(key)`, only when the checker proves obj is a
  // dictionary and both the printed key and the printed operand are already C#
  // dictionary/string values. Every other shape keeps the inOp helper
  csharpNativeInExpression(key, obj) {
    const checker = this.getChecker();
    if (!this.isStringType(checker.getTypeAtLocation(key).flags)) {
      return void 0;
    }
    if (!this.csharpIsDictionaryType(checker.getTypeAtLocation(obj))) {
      return void 0;
    }
    const receiver = this.csharpNativeReceiver(obj);
    if (receiver === void 0 || receiver.type.indexOf("Dictionary<") < 0) {
      return void 0;
    }
    const printedKey = this.csharpNativeStringKey(key);
    if (printedKey === void 0) {
      return void 0;
    }
    return `${receiver.text}.ContainsKey(${printedKey})`;
  }
  // `x.length` -> `x.Count`, same proof for the checker's array operands; strings keep
  // the `((string)x).Length` branch and every unproven operand keeps getArrayLength
  csharpNativeLengthExpression(expression) {
    if (!this.csharpIsArrayType(this.getChecker().getTypeAtLocation(expression))) {
      return void 0;
    }
    const receiver = this.csharpNativeReceiver(expression);
    if (receiver === void 0) {
      return void 0;
    }
    return `${receiver.text}.Count`;
  }
  printCustomBinaryExpressionIfAny(node, identation) {
    const left = node.left;
    const right = node.right;
    const op = node.operatorToken.kind;
    if (left.kind === _typescript2.default.SyntaxKind.TypeOfExpression) {
      const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
      if (typeOfExpression) {
        return typeOfExpression;
      }
    }
    if (op === _typescript2.default.SyntaxKind.EqualsToken && left.kind === _typescript2.default.SyntaxKind.ArrayLiteralExpression) {
      const arrayBindingPatternElements = left.elements;
      const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e, 0));
      const syntheticName = parsedArrayBindingElements.join("") + "Variable";
      let arrayBindingStatement = `var ${syntheticName} = ${this.printNode(right, 0)};
`;
      parsedArrayBindingElements.forEach((e, index) => {
        const leftElement = arrayBindingPatternElements[index];
        const leftType = this.getChecker().getTypeAtLocation(leftElement);
        const parsedType = this.getTypeFromRawType(leftType);
        const castExp = parsedType ? `(${parsedType})` : "";
        const statement = this.getIden(identation) + `${e} = ((IList<object>)${syntheticName})[${index}]`;
        if (index < parsedArrayBindingElements.length - 1) {
          arrayBindingStatement += statement + ";\n";
        } else {
          arrayBindingStatement += statement;
        }
      });
      return arrayBindingStatement;
    }
    if (op === _typescript2.default.SyntaxKind.InKeyword) {
      const nativeIn = this.csharpNativeInExpression(left, right);
      if (nativeIn !== void 0) {
        return nativeIn;
      }
      return `inOp(${this.printNode(right, 0)}, ${this.printNode(left, 0)})`;
    }
    if (op === _typescript2.default.SyntaxKind.PlusEqualsToken || op === _typescript2.default.SyntaxKind.MinusEqualsToken || op in this.binaryExpressionsWrappers) {
      const nativeComparison = this.csharpNativeNumericComparison(node, identation);
      if (nativeComparison !== void 0) {
        return nativeComparison;
      }
      const leftText = this.printNode(left, 0);
      const rightText = this.printNode(right, 0);
      if (op === _typescript2.default.SyntaxKind.PlusEqualsToken) {
        return `${leftText} = add(${leftText}, ${rightText})`;
      }
      if (op === _typescript2.default.SyntaxKind.MinusEqualsToken) {
        return `${leftText} = subtract(${leftText}, ${rightText})`;
      }
      const isEquality = op === _typescript2.default.SyntaxKind.EqualsEqualsToken || op === _typescript2.default.SyntaxKind.EqualsEqualsEqualsToken;
      const isDifference = op === _typescript2.default.SyntaxKind.ExclamationEqualsToken || op === _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken;
      if (isEquality || isDifference) {
        const inlined = this.printInlineEquality(left, right, leftText, rightText, isEquality);
        if (inlined !== void 0) {
          return inlined;
        }
      }
      const wrapper = this.binaryExpressionsWrappers[op];
      const open = wrapper[0];
      const close = wrapper[1];
      return `${open}${leftText}, ${rightText}${close}`;
    }
    return void 0;
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
  csharpCallReturnType(initializer) {
    if (_optionalChain([initializer, 'optionalAccess', _119 => _119.kind]) === _typescript2.default.SyntaxKind.PropertyAccessExpression) {
      return _optionalChain([initializer, 'access', _120 => _120.name, 'optionalAccess', _121 => _121.escapedText]) === "length" ? "int" : void 0;
    }
    if (_optionalChain([initializer, 'optionalAccess', _122 => _122.kind]) !== _typescript2.default.SyntaxKind.CallExpression) {
      return void 0;
    }
    const expression = initializer.expression;
    if (_optionalChain([expression, 'optionalAccess', _123 => _123.kind]) !== _typescript2.default.SyntaxKind.PropertyAccessExpression) {
      return void 0;
    }
    const methodName = _optionalChain([expression, 'access', _124 => _124.name, 'optionalAccess', _125 => _125.escapedText]);
    const target = expression.expression;
    if (_optionalChain([target, 'optionalAccess', _126 => _126.kind]) === _typescript2.default.SyntaxKind.ThisKeyword) {
      if (!this.csharpCalleeResolves(initializer)) {
        return void 0;
      }
      return CSHARP_THIS_RETURN_TYPES[methodName];
    }
    if (_optionalChain([target, 'optionalAccess', _127 => _127.kind]) === _typescript2.default.SyntaxKind.Identifier) {
      const full = target.escapedText + "." + methodName;
      if (CSHARP_STATIC_RETURN_TYPES[full] !== void 0) {
        return CSHARP_STATIC_RETURN_TYPES[full];
      }
    }
    return CSHARP_METHOD_RETURN_TYPES[methodName];
  }
  // mirrors printWrappedUnknownThisProperty: a `this.<name>(...)` call whose callee the
  // checker cannot resolve is printed as `callDynamically(this, "<name>", ...)`, whose C#
  // signature returns `object` whatever the name says
  csharpCalleeResolves(node) {
    let signature;
    try {
      signature = this.getChecker().getResolvedSignature(node);
    } catch (e) {
      return false;
    }
    return _optionalChain([signature, 'optionalAccess', _128 => _128.declaration]) !== void 0;
  }
  // the concrete C# type the initializer already produces, or undefined when the
  // printer cannot name it (this.safeString, getValue, add, parseInt, ... return object)
  csharpTypeOfInitializer(initializer) {
    switch (_optionalChain([initializer, 'optionalAccess', _129 => _129.kind])) {
      case _typescript2.default.SyntaxKind.StringLiteral:
      case _typescript2.default.SyntaxKind.NoSubstitutionTemplateLiteral:
        return "string";
      case _typescript2.default.SyntaxKind.TrueKeyword:
      case _typescript2.default.SyntaxKind.FalseKeyword:
        return "bool";
      case _typescript2.default.SyntaxKind.PrefixUnaryExpression:
        return initializer.operator === _typescript2.default.SyntaxKind.ExclamationToken ? "bool" : void 0;
      case _typescript2.default.SyntaxKind.ParenthesizedExpression:
        return this.csharpTypeOfInitializer(initializer.expression);
      case _typescript2.default.SyntaxKind.BinaryExpression: {
        const op = initializer.operatorToken.kind;
        switch (op) {
          case _typescript2.default.SyntaxKind.BarBarToken:
          case _typescript2.default.SyntaxKind.AmpersandAmpersandToken:
          case _typescript2.default.SyntaxKind.EqualsEqualsToken:
          case _typescript2.default.SyntaxKind.EqualsEqualsEqualsToken:
          case _typescript2.default.SyntaxKind.ExclamationEqualsToken:
          case _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken:
          case _typescript2.default.SyntaxKind.GreaterThanToken:
          case _typescript2.default.SyntaxKind.GreaterThanEqualsToken:
          case _typescript2.default.SyntaxKind.LessThanToken:
          case _typescript2.default.SyntaxKind.LessThanEqualsToken:
          case _typescript2.default.SyntaxKind.InKeyword:
            return "bool";
        }
        return void 0;
      }
    }
    return this.csharpCallReturnType(initializer);
  }
  csharpEnclosingFunction(node) {
    let current = _optionalChain([node, 'optionalAccess', _130 => _130.parent]);
    while (current) {
      switch (current.kind) {
        case _typescript2.default.SyntaxKind.MethodDeclaration:
        case _typescript2.default.SyntaxKind.FunctionDeclaration:
        case _typescript2.default.SyntaxKind.FunctionExpression:
        case _typescript2.default.SyntaxKind.ArrowFunction:
        case _typescript2.default.SyntaxKind.Constructor:
        case _typescript2.default.SyntaxKind.SourceFile:
          return current;
      }
      current = current.parent;
    }
    return void 0;
  }
  csharpTypeNameIsShadowed(scope, csharpType) {
    const names = _nullishCoalesce(csharpType.match(/[A-Za-z_]\w*/g), () => ( []));
    const relevant = names.filter((n) => CSHARP_TYPE_NAMES.indexOf(n) >= 0);
    if (relevant.length === 0 || scope === void 0) {
      return false;
    }
    let shadowed = false;
    const visit = (n) => {
      if (shadowed) {
        return;
      }
      const isBinding = n.kind === _typescript2.default.SyntaxKind.Parameter || n.kind === _typescript2.default.SyntaxKind.VariableDeclaration;
      if (isBinding && _optionalChain([n, 'access', _131 => _131.name, 'optionalAccess', _132 => _132.kind]) === _typescript2.default.SyntaxKind.Identifier) {
        const printed = this.printNode(n.name, 0);
        if (relevant.indexOf(printed) >= 0) {
          shadowed = true;
          return;
        }
      }
      _typescript2.default.forEachChild(n, visit);
    };
    _typescript2.default.forEachChild(scope, visit);
    return shadowed;
  }
  // reject the refinement when something downstream needs the local to stay `object`:
  // `x.push(v)` prints `((IList<object>)x).Add(v)` on a value that must be boxed, a
  // later assignment of another concrete type would stop compiling, and `x++` prints
  // `postFixIncrement(ref x)` whose parameter is `ref object`
  csharpLocalIsSafeToType(scope, declaration, varName, csharpType, safeAccessor = false) {
    if (scope === void 0) {
      return false;
    }
    let safe = true;
    const visit = (n) => {
      if (!safe) {
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.Identifier && n.escapedText === varName && n !== declaration.name) {
        const parent = n.parent;
        if (_optionalChain([parent, 'optionalAccess', _133 => _133.kind]) === _typescript2.default.SyntaxKind.VariableDeclaration && parent.name === n) {
          return;
        }
        if (_optionalChain([parent, 'optionalAccess', _134 => _134.kind]) === _typescript2.default.SyntaxKind.PostfixUnaryExpression || _optionalChain([parent, 'optionalAccess', _135 => _135.kind]) === _typescript2.default.SyntaxKind.PrefixUnaryExpression) {
          const op = parent.operator;
          if (op === _typescript2.default.SyntaxKind.PlusPlusToken || op === _typescript2.default.SyntaxKind.MinusMinusToken) {
            safe = false;
            return;
          }
          if (safeAccessor && op !== _typescript2.default.SyntaxKind.ExclamationToken && csharpType !== "int" && csharpType !== "Int64" && csharpType !== "double") {
            safe = false;
            return;
          }
        }
        if (_optionalChain([parent, 'optionalAccess', _136 => _136.kind]) === _typescript2.default.SyntaxKind.SpreadElement) {
          safe = false;
          return;
        }
        if (_optionalChain([parent, 'optionalAccess', _137 => _137.kind]) === _typescript2.default.SyntaxKind.ArrayLiteralExpression && _optionalChain([parent, 'access', _138 => _138.parent, 'optionalAccess', _139 => _139.kind]) === _typescript2.default.SyntaxKind.BinaryExpression && parent.parent.left === parent && parent.parent.operatorToken.kind === _typescript2.default.SyntaxKind.EqualsToken) {
          safe = false;
          return;
        }
        if (_optionalChain([parent, 'optionalAccess', _140 => _140.kind]) === _typescript2.default.SyntaxKind.PropertyAccessExpression && parent.expression === n) {
          const method = _optionalChain([parent, 'access', _141 => _141.name, 'optionalAccess', _142 => _142.escapedText]);
          if (method === "push" || method === "reverse" || method === "sort") {
            safe = false;
            return;
          }
          if (safeAccessor && !this.csharpTypeIsList(csharpType) && (method === "join" || method === "shift" || method === "pop")) {
            safe = false;
            return;
          }
        }
        if (safeAccessor) {
          if (_optionalChain([parent, 'optionalAccess', _143 => _143.kind]) === _typescript2.default.SyntaxKind.VariableDeclaration && _optionalChain([parent, 'access', _144 => _144.name, 'optionalAccess', _145 => _145.kind]) === _typescript2.default.SyntaxKind.ArrayBindingPattern && !this.csharpTypeIsList(csharpType)) {
            safe = false;
            return;
          }
          if (!this.csharpTypeIsStringType(csharpType) && this.csharpIsClassThrowArgument(n)) {
            safe = false;
            return;
          }
          if (!this.csharpTypeIsStringType(csharpType) && this.csharpIsDeleteKey(n)) {
            safe = false;
            return;
          }
        }
        if (_optionalChain([parent, 'optionalAccess', _146 => _146.kind]) === _typescript2.default.SyntaxKind.BinaryExpression && parent.left === n) {
          const op = parent.operatorToken.kind;
          if (op === _typescript2.default.SyntaxKind.EqualsToken) {
            if (this.csharpTypeOfInitializer(parent.right) !== csharpType) {
              safe = false;
              return;
            }
          } else if (op >= _typescript2.default.SyntaxKind.FirstCompoundAssignment && op <= _typescript2.default.SyntaxKind.LastCompoundAssignment) {
            safe = false;
            return;
          }
        }
        if (safeAccessor && csharpType === "string?" && this.csharpIsLeftPlusOperand(n)) {
          safe = false;
          return;
        }
      }
      _typescript2.default.forEachChild(n, visit);
    };
    _typescript2.default.forEachChild(scope, visit);
    return safe;
  }
  getCSharpLocalType(declaration) {
    const csharpType = this.csharpTypeOfInitializer(declaration.initializer);
    if (csharpType === void 0) {
      return this.VAR_TOKEN;
    }
    const sourceName = _optionalChain([declaration, 'access', _147 => _147.name, 'optionalAccess', _148 => _148.escapedText]);
    if (sourceName === void 0) {
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
  csharpIsSafeAccessorCall(initializer) {
    if (_optionalChain([initializer, 'optionalAccess', _149 => _149.kind]) !== _typescript2.default.SyntaxKind.CallExpression) {
      return false;
    }
    const expression = initializer.expression;
    if (_optionalChain([expression, 'optionalAccess', _150 => _150.kind]) !== _typescript2.default.SyntaxKind.PropertyAccessExpression || _optionalChain([expression, 'access', _151 => _151.expression, 'optionalAccess', _152 => _152.kind]) !== _typescript2.default.SyntaxKind.ThisKeyword) {
      return false;
    }
    return CSHARP_SAFE_ACCESSOR_NAMES.indexOf(_optionalChain([expression, 'access', _153 => _153.name, 'optionalAccess', _154 => _154.escapedText])) >= 0;
  }
  csharpTypeIsList(csharpType) {
    return csharpType === "List<object>" || csharpType === "IList<object>";
  }
  csharpTypeIsStringType(csharpType) {
    return csharpType === "string" || csharpType === "string?";
  }
  // `throw new ExchangeError (x)`: the printer wraps the argument in a hard `(string)`
  csharpIsClassThrowArgument(node) {
    let current = node;
    while (current.parent) {
      const parent = current.parent;
      if (parent.kind === _typescript2.default.SyntaxKind.ParenthesizedExpression || parent.kind === _typescript2.default.SyntaxKind.AsExpression) {
        current = parent;
        continue;
      }
      if (parent.kind === _typescript2.default.SyntaxKind.NewExpression && _optionalChain([parent, 'access', _155 => _155.arguments, 'optionalAccess', _156 => _156.indexOf, 'call', _157 => _157(current)]) >= 0) {
        current = parent;
        continue;
      }
      return parent.kind === _typescript2.default.SyntaxKind.ThrowStatement;
    }
    return false;
  }
  // `delete obj[x]` prints `.Remove((string)x)`
  csharpIsDeleteKey(node) {
    let value = node;
    while (value.parent && (value.parent.kind === _typescript2.default.SyntaxKind.ParenthesizedExpression || value.parent.kind === _typescript2.default.SyntaxKind.AsExpression)) {
      value = value.parent;
    }
    const access = value.parent;
    return _optionalChain([access, 'optionalAccess', _158 => _158.kind]) === _typescript2.default.SyntaxKind.ElementAccessExpression && access.argumentExpression === value && _optionalChain([access, 'access', _159 => _159.parent, 'optionalAccess', _160 => _160.kind]) === _typescript2.default.SyntaxKind.DeleteExpression;
  }
  // `(x) + y` / `x + y` prints `add(x, y)`: the parentheses keep x's static type
  csharpIsLeftPlusOperand(node) {
    let value = node;
    while (value.parent && value.parent.kind === _typescript2.default.SyntaxKind.ParenthesizedExpression) {
      value = value.parent;
    }
    const parent = value.parent;
    if (_optionalChain([parent, 'optionalAccess', _161 => _161.kind]) !== _typescript2.default.SyntaxKind.BinaryExpression || parent.left !== value) {
      return false;
    }
    const op = parent.operatorToken.kind;
    return op === _typescript2.default.SyntaxKind.PlusToken || op === _typescript2.default.SyntaxKind.PlusEqualsToken;
  }
  printVariableDeclarationList(node, identation) {
    const declaration = node.declarations[0];
    if (this.removeVariableDeclarationForFunctionExpression && _optionalChain([declaration, 'optionalAccess', _162 => _162.initializer]) && _typescript2.default.isFunctionExpression(declaration.initializer)) {
      return this.printNode(declaration.initializer, identation).trimEnd();
    }
    if (_optionalChain([declaration, 'optionalAccess', _163 => _163.name, 'access', _164 => _164.kind]) === _typescript2.default.SyntaxKind.ArrayBindingPattern) {
      const arrayBindingPattern = declaration.name;
      const arrayBindingPatternElements = arrayBindingPattern.elements;
      const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e.name, 0));
      const syntheticName = parsedArrayBindingElements.join("") + "Variable";
      let arrayBindingStatement = `${this.getIden(identation)}var ${syntheticName} = ${this.printNode(declaration.initializer, 0)};
`;
      parsedArrayBindingElements.forEach((e, index) => {
        const statement = this.getIden(identation) + `var ${e} = ((IList<object>) ${syntheticName})[${index}]`;
        if (index < parsedArrayBindingElements.length - 1) {
          arrayBindingStatement += statement + ";\n";
        } else {
          arrayBindingStatement += statement;
        }
      });
      return arrayBindingStatement;
    }
    const isNew = _optionalChain([declaration, 'optionalAccess', _165 => _165.initializer]) && declaration.initializer.kind === _typescript2.default.SyntaxKind.NewExpression;
    const varToken = isNew ? "var " : this.VAR_TOKEN + " ";
    if (_optionalChain([declaration, 'optionalAccess', _166 => _166.initializer]) && declaration.initializer === void 0) {
      return this.getIden(identation) + varToken + this.printNode(declaration.name) + " = " + this.UNDEFINED_TOKEN;
    } else if (!declaration.initializer) {
      return this.getIden(identation) + "object " + this.printNode(declaration.name) + " = " + this.UNDEFINED_TOKEN;
    }
    const parsedValue = this.printNode(declaration.initializer, identation).trimStart();
    if (parsedValue === this.UNDEFINED_TOKEN) {
      let specificVarToken = "object";
      if (this.INFER_VAR_TYPE) {
        const variableType = this.getChecker().typeToString(this.getChecker().getTypeAtLocation(declaration));
        if (this.VariableTypeReplacements[variableType]) {
          specificVarToken = this.VariableTypeReplacements[variableType] + "?";
        }
      }
      return this.getIden(identation) + specificVarToken + " " + this.printNode(declaration.name) + " = " + parsedValue;
    }
    const declaredType = isNew ? "var" : this.getCSharpLocalType(declaration);
    if (!isNew && node.declarations.length === 1 && this.csharpTypeIsNative(declaredType)) {
      this.csharpTypedLocals.set(declaration, declaredType);
    }
    return this.getIden(identation) + declaredType + " " + this.printNode(declaration.name) + " = " + parsedValue;
  }
  transformPropertyAcessExpressionIfNeeded(node) {
    const expression = node.expression;
    const leftSide = this.printNode(expression, 0);
    const rightSide = node.name.escapedText;
    let rawExpression = void 0;
    switch (rightSide) {
      case "length":
        const type = this.getChecker().getTypeAtLocation(expression);
        this.warnIfAnyType(node, type.flags, leftSide, "length");
        rawExpression = this.isStringType(type.flags) ? `((string)${leftSide}).Length` : _nullishCoalesce(this.csharpNativeLengthExpression(expression), () => ( `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`));
        break;
      case "push":
        rawExpression = `((IList<object>)${leftSide}).Add`;
        break;
    }
    return rawExpression;
  }
  printCustomDefaultValueIfNeeded(node) {
    if (_typescript2.default.isArrayLiteralExpression(node) || _typescript2.default.isObjectLiteralExpression(node) || _typescript2.default.isStringLiteral(node) || _typescript2.default.isBooleanLiteral(node)) {
      return this.UNDEFINED_TOKEN;
    }
    if (_typescript2.default.isNumericLiteral(node)) {
      return this.UNDEFINED_TOKEN;
    }
    if (_optionalChain([node, 'optionalAccess', _167 => _167.escapedText]) === "undefined" && _optionalChain([this, 'access', _168 => _168.getChecker, 'call', _169 => _169(), 'access', _170 => _170.getTypeAtLocation, 'call', _171 => _171(_optionalChain([node, 'optionalAccess', _172 => _172.parent])), 'optionalAccess', _173 => _173.flags]) === _typescript2.default.TypeFlags.Number) {
      return this.UNDEFINED_TOKEN;
    }
    return void 0;
  }
  printFunctionBody(node, identation) {
    const funcParams = node.parameters;
    const initParams = [];
    if (funcParams.length > 0) {
      const body = node.body.statements;
      const first = body.length > 0 ? body[0] : [];
      const remaining = body.length > 0 ? body.slice(1) : [];
      let firstStatement = this.printNode(first, identation + 1);
      const remainingString = remaining.map((statement) => this.printNode(statement, identation + 1)).join("\n");
      funcParams.forEach((param) => {
        const initializer = param.initializer;
        if (initializer) {
          if (_typescript2.default.isArrayLiteralExpression(initializer)) {
            initParams.push(`${this.printNode(param.name, 0)} ??= new List<object>();`);
          }
          if (_typescript2.default.isObjectLiteralExpression(initializer)) {
            initParams.push(`${this.printNode(param.name, 0)} ??= new Dictionary<string, object>();`);
          }
          if (_typescript2.default.isNumericLiteral(initializer)) {
            initParams.push(`${this.printNode(param.name, 0)} ??= ${this.printNode(initializer, 0)};`);
          }
          if (_typescript2.default.isStringLiteral(initializer)) {
            initParams.push(`${this.printNode(param.name, 0)} ??= ${this.printNode(initializer, 0)};`);
          }
          if (_typescript2.default.isBooleanLiteral(initializer)) {
            initParams.push(`${this.printNode(param.name, 0)} ??= ${this.printNode(initializer, 0)};`);
          }
        }
      });
      if (initParams.length > 0) {
        const defaultInitializers = initParams.map((l) => this.getIden(identation + 1) + l).join("\n") + "\n";
        const bodyParts = firstStatement.split("\n");
        const commentPart = bodyParts.filter((line) => this.isComment(line));
        const isComment = commentPart.length > 0;
        if (isComment) {
          const commentPartString = commentPart.map((c) => this.getIden(identation + 1) + c.trim()).join("\n");
          const firstStmNoComment = bodyParts.filter((line) => !this.isComment(line)).join("\n");
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
    if (type.kind === _typescript2.default.SyntaxKind.AnyKeyword) {
      return `((object)${this.printNode(node.expression, identation)})`;
    }
    if (type.kind === _typescript2.default.SyntaxKind.StringKeyword) {
      return `((string)${this.printNode(node.expression, identation)})`;
    }
    if (type.kind === _typescript2.default.SyntaxKind.ArrayType) {
      if (type.elementType.kind === _typescript2.default.SyntaxKind.AnyKeyword) {
        return `(IList<object>)(${this.printNode(node.expression, identation)})`;
      }
      if (type.elementType.kind === _typescript2.default.SyntaxKind.StringKeyword) {
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
        const defaultValue2 = customDefaultValue ? customDefaultValue : this.printNode(initializer, 0);
        type = defaultValue2 === "null" && type !== "object" ? type + "? " : type + " ";
        return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + defaultValue2;
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
    if (elems.length > 0) {
      const first = elems[0];
      if (first.kind === _typescript2.default.SyntaxKind.CallExpression) {
        let type = this.getFunctionType(first);
        if (type === void 0 || elements.indexOf(this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN) > -1) {
          arrayOpen = "new List<object> {";
        } else {
          type = "object";
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
  csharpBooleanReturnType(node) {
    if (_optionalChain([node, 'optionalAccess', _174 => _174.kind]) !== _typescript2.default.SyntaxKind.MethodDeclaration || this.isAsyncFunction(node)) {
      return void 0;
    }
    if (this.csharpBooleanReturnTypes.has(node)) {
      return this.csharpBooleanReturnTypes.get(node);
    }
    let result = void 0;
    if (node.type) {
      const type = this.getChecker().getTypeFromTypeNode(node.type);
      const members = type.isUnion() ? type.types : [type];
      let nullable = false;
      let sawBoolean = false;
      let sawOther = false;
      for (const member of members) {
        if (member.flags & (_typescript2.default.TypeFlags.Undefined | _typescript2.default.TypeFlags.Null)) {
          nullable = true;
        } else if (member.flags & _typescript2.default.TypeFlags.BooleanLike) {
          sawBoolean = true;
        } else {
          sawOther = true;
        }
      }
      if (sawBoolean && !sawOther) {
        result = nullable ? this.BOOLEAN_KEYWORD + "?" : this.BOOLEAN_KEYWORD;
      }
    } else {
      result = this.csharpBooleanReturnType(this.getMethodOverride(node));
    }
    this.csharpBooleanReturnTypes.set(node, result);
    return result;
  }
  printFunctionType(node) {
    const booleanType = this.csharpBooleanReturnType(node);
    if (booleanType !== void 0) {
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
    const booleanType = this.csharpBooleanReturnType(_typescript2.default.findAncestor(node.parent, _typescript2.default.isFunctionLike));
    if (booleanType === void 0 || !node.expression) {
      return super.printReturnStatement(node, identation);
    }
    const leadingComment = this.printLeadingComments(node, identation);
    let trailingComment = this.printTraillingComment(node, identation);
    trailingComment = trailingComment ? " " + trailingComment : trailingComment;
    const value = this.printNode(node.expression, identation).trim();
    const forgiving = booleanType.endsWith("?") ? "" : "!";
    return leadingComment + this.getIden(identation) + this.RETURN_TOKEN + ` ((${booleanType})((object)(${value}))${forgiving})` + this.LINE_TERMINATOR + trailingComment;
  }
  printMethodDefinition(node, identation) {
    let name = node.name.escapedText;
    name = this.transformMethodNameIfNeeded(name);
    let returnType = this.printFunctionType(node);
    let modifiers = this.printModifiers(node);
    const defaultAccess = this.METHOD_DEFAULT_ACCESS ? this.METHOD_DEFAULT_ACCESS + " " : "";
    modifiers = modifiers ? modifiers + " " : defaultAccess;
    modifiers = modifiers.indexOf("public") === -1 && modifiers.indexOf("private") === -1 && modifiers.indexOf("protected") === -1 ? defaultAccess + modifiers : modifiers;
    let parsedArgs = void 0;
    const methodOverride = this.getMethodOverride(node);
    const isOverride = methodOverride !== void 0;
    modifiers = isOverride ? modifiers + "override " : modifiers + "virtual ";
    if (isOverride && (returnType === "object" || returnType === "Task<object>")) {
      returnType = this.printFunctionType(methodOverride);
    }
    if (isOverride && node.parameters.length > 0) {
      const first = node.parameters[0];
      const firstType = this.getType(first);
      if (firstType === void 0) {
        const currentArgs = node.parameters;
        const parentArgs = methodOverride.parameters;
        parsedArgs = "";
        parentArgs.forEach((param, index) => {
          const originalName = this.printNode(currentArgs[index].name, 0);
          const parsedArg = this.printParameteCustomName(param, originalName);
          parsedArgs += parsedArg;
          if (index < parentArgs.length - 1) {
            parsedArgs += ", ";
          }
        });
      }
    }
    parsedArgs = parsedArgs ? parsedArgs : this.printMethodParameters(node);
    returnType = returnType ? returnType + " " : returnType;
    const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
    const methodDef = this.getIden(identation) + modifiers + returnType + methodToken + name + "(" + parsedArgs + ")";
    return this.printNodeCommentsIfAny(node, identation, methodDef);
  }
  printArgsForCallExpression(node, identation) {
    const args = node.arguments;
    let parsedArgs = "";
    if (false) {
      const parsedTypes = this.getTypesFromCallExpressionParameters(node);
      const tmpArgs = [];
      args.forEach((arg, index) => {
        const parsedType = parsedTypes[index];
        let cast = "";
        if (parsedType !== "object" && parsedType !== "float" && parsedType !== "int") {
          cast = parsedType ? `(${parsedType})` : "";
        }
        tmpArgs.push(cast + this.printNode(arg, identation).trim());
      });
      parsedArgs = tmpArgs.join(",");
      return parsedArgs;
    }
    return super.printArgsForCallExpression(node, identation);
  }
  // check this out later
  printArrayIsArrayCall(node, identation, parsedArg = void 0) {
    return `((${parsedArg} is IList<object>) || (${parsedArg}.GetType().IsGenericType && ${parsedArg}.GetType().GetGenericTypeDefinition().IsAssignableFrom(typeof(List<>))))`;
  }
  printObjectKeysCall(node, identation, parsedArg = void 0) {
    return `new List<object>(((IDictionary<string,object>)${parsedArg}).Keys)`;
  }
  printObjectValuesCall(node, identation, parsedArg = void 0) {
    return `new List<object>(((IDictionary<string,object>)${parsedArg}).Values)`;
  }
  printJsonParseCall(node, identation, parsedArg = void 0) {
    return `parseJson(${parsedArg})`;
  }
  printJsonStringifyCall(node, identation, parsedArg = void 0) {
    return `json(${parsedArg})`;
  }
  printPromiseAllCall(node, identation, parsedArg = void 0) {
    return `promiseAll(${parsedArg})`;
  }
  printMathFloorCall(node, identation, parsedArg = void 0) {
    return `(Math.Floor(Double.Parse((${parsedArg}).ToString())))`;
  }
  printMathRoundCall(node, identation, parsedArg = void 0) {
    return `Math.Round(Convert.ToDouble(${parsedArg}))`;
  }
  printMathCeilCall(node, identation, parsedArg = void 0) {
    return `Math.Ceiling(Convert.ToDouble(${parsedArg}))`;
  }
  printNumberIsIntegerCall(node, identation, parsedArg) {
    return `((${parsedArg} is int) || (${parsedArg} is long) || (${parsedArg} is Int32) || (${parsedArg} is Int64))`;
  }
  printArrayPushCall(node, identation, name = void 0, parsedArg = void 0) {
    return `((IList<object>)${name}).Add(${parsedArg})`;
  }
  printIncludesCall(node, identation, name = void 0, parsedArg = void 0) {
    return `${name}.Contains(${parsedArg})`;
  }
  printIndexOfCall(node, identation, name = void 0, parsedArg = void 0) {
    return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
  }
  printSearchCall(node, identation, name = void 0, parsedArg = void 0) {
    return `((string)${name}).IndexOf(${parsedArg})`;
  }
  printStartsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `((string)${name}).StartsWith(((string)${parsedArg}))`;
  }
  printEndsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `((string)${name}).EndsWith(((string)${parsedArg}))`;
  }
  printTrimCall(node, identation, name = void 0) {
    return `((string)${name}).Trim()`;
  }
  printJoinCall(node, identation, name = void 0, parsedArg = void 0) {
    return `String.Join(${parsedArg}, ((IList<object>)${name}).ToArray())`;
  }
  printSplitCall(node, identation, name = void 0, parsedArg = void 0) {
    return `((string)${name}).Split(new [] {((string)${parsedArg})}, StringSplitOptions.None).ToList<object>()`;
  }
  printConcatCall(node, identation, name = void 0, parsedArg = void 0) {
    return `concat(${name}, ${parsedArg})`;
  }
  printToFixedCall(node, identation, name = void 0, parsedArg = void 0) {
    return `toFixed(${name}, ${parsedArg})`;
  }
  printToStringCall(node, identation, name = void 0) {
    return `((object)${name}).ToString()`;
  }
  printToUpperCaseCall(node, identation, name = void 0) {
    return `((string)${name}).ToUpper()`;
  }
  printToLowerCaseCall(node, identation, name = void 0) {
    return `((string)${name}).ToLower()`;
  }
  printShiftCall(node, identation, name = void 0) {
    return `((IList<object>)${name}).First()`;
  }
  printReverseCall(node, identation, name = void 0) {
    return `${name} = (${name} as IList<object>).Reverse().ToList()`;
  }
  printPopCall(node, identation, name = void 0) {
    return `((IList<object>)${name}).Last()`;
  }
  printAssertCall(node, identation, parsedArgs) {
    return `assert(${parsedArgs})`;
  }
  printSliceCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    const nativeCall = this.csharpNativeSliceCall(node, name);
    if (nativeCall !== void 0) {
      return nativeCall;
    }
    if (parsedArg2 === void 0) {
      parsedArg2 = "null";
    }
    return `slice(${name}, ${parsedArg}, ${parsedArg2})`;
  }
  // `x.slice (a, b)` -> Substring / GetRange when the checker proves x is a C# string (or the
  // printer declared it a `List<object>`) and every bound is an integer literal: JS clamps a
  // negative / overflowing bound into [0, length] where the C# method throws, so the literals
  // are clamped with Math.Min / Math.Max. Everything unproven keeps the runtime helper.
  csharpNativeSliceCall(node, name) {
    const args = _nullishCoalesce(_optionalChain([node, 'optionalAccess', _175 => _175.arguments]), () => ( []));
    if (args.length < 1 || args.length > 2) {
      return void 0;
    }
    const start = this.csharpSliceLiteralBound(args[0]);
    if (start === void 0) {
      return void 0;
    }
    const hasEnd = args.length === 2;
    const end = hasEnd ? this.csharpSliceLiteralBound(args[1]) : void 0;
    if (hasEnd && end === void 0) {
      return void 0;
    }
    const receiver = _typescript2.default.isPropertyAccessExpression(_optionalChain([node, 'optionalAccess', _176 => _176.expression])) ? node.expression.expression : void 0;
    if (!this.csharpSliceReceiverIsSideEffectFree(receiver)) {
      return void 0;
    }
    const kind = this.csharpSliceReceiverKind(receiver);
    if (kind === void 0) {
      return void 0;
    }
    const isString = kind === "string";
    const cast = isString && name.startsWith("((string)") ? name : `((${isString ? "string" : "List<object>"})${name})`;
    const length = `${cast}.${isString ? "Length" : "Count"}`;
    const from = this.csharpSliceBoundExpression(start, length);
    const guard = `(${this.csharpNullComparison(name, true)} ? null : `;
    const method = isString ? "Substring" : "GetRange";
    if (!hasEnd) {
      const open = isString ? `Substring(${from})` : `GetRange(${from}, ${from === "0" ? length : `${length} - ${from}`})`;
      return `${guard}${cast}.${open})`;
    }
    const to = this.csharpSliceBoundExpression(end, length);
    const ordered = start === 0 || start >= 0 && end >= 0 && start <= end || start < 0 && end < 0 && start <= end;
    let count;
    if (from === to) {
      count = "0";
    } else if (from === "0") {
      count = to;
    } else {
      count = ordered ? `${to} - ${from}` : `Math.Max(${to} - ${from}, 0)`;
    }
    return `${guard}${cast}.${method}(${from}, ${count}))`;
  }
  // Integer value of a slice bound that is an integer literal (`18`, `-64`); anything
  // else (expression, float, exponent, out of int range) keeps the helper — the bounds
  // are clamped with the integer Math.Min / Math.Max of the native form.
  csharpSliceLiteralBound(node) {
    if (node === void 0) {
      return void 0;
    }
    if (_typescript2.default.isNumericLiteral(node)) {
      const text = String(node.text);
      if (text.indexOf(".") !== -1 || text.indexOf("e") !== -1 || text.indexOf("E") !== -1) {
        return void 0;
      }
      const value = Number(text);
      return value <= 2147483647 ? value : void 0;
    }
    if (_typescript2.default.isPrefixUnaryExpression(node) && node.operator === _typescript2.default.SyntaxKind.MinusToken) {
      const inner = this.csharpSliceLiteralBound(node.operand);
      return inner === void 0 ? void 0 : -inner;
    }
    return void 0;
  }
  // JS slice clamps a literal bound into [0, length]: a non-negative bound is min
  // (bound, length), a negative one counts from the end (max (length - |bound|, 0)).
  // `0` stays `0` because the length of a string / list is never negative.
  csharpSliceBoundExpression(value, length) {
    if (value === 0) {
      return "0";
    }
    return value > 0 ? `Math.Min(${value}, ${length})` : `Math.Max(${length} - ${-value}, 0)`;
  }
  // the receiver of a native slice: a `List<object>` this printer / the embedding build layer
  // declared (the only receiver carrying GetRange), or a string the CHECKER proves. The string
  // proof accepts `string`, a string literal and a union of those with null / undefined (`Str`
  // is `string | undefined` in ccxt); `any`, Dict and every other type keep the helper.
  csharpSliceReceiverKind(expression) {
    const declared = _nullishCoalesce((_typescript2.default.isIdentifier(expression) ? this.csharpTypedLocalType(expression) : void 0), () => ( this.csharpExpressionTypeOf(expression)));
    if (declared === "List<object>") {
      return "list";
    }
    let type;
    try {
      type = this.getChecker().getTypeAtLocation(expression);
    } catch (e) {
      return void 0;
    }
    return this.csharpSliceStringType(type) ? "string" : void 0;
  }
  // the checker's string view of a slice receiver: a string type, or a union of string
  // members and nullish ones only. `boolean | string`, `any` and every unproven shape fail
  csharpSliceStringType(type) {
    if (this.isStringType(_optionalChain([type, 'optionalAccess', _177 => _177.flags]))) {
      return true;
    }
    if (_optionalChain([type, 'optionalAccess', _178 => _178.flags]) !== _typescript2.default.TypeFlags.Union) {
      return false;
    }
    const members = _nullishCoalesce(type.types, () => ( []));
    return members.length > 0 && members.every((member) => this.isStringType(member.flags) || this.csharpSliceNullishType(member.flags));
  }
  csharpSliceNullishType(flags) {
    return flags === _typescript2.default.TypeFlags.Undefined || flags === _typescript2.default.TypeFlags.Null;
  }
  // True for receivers that read a value without calling anything: `x`, `x.y`, `this.x`,
  // `(x as string)` and parenthesised forms of those. Guards the repeated receiver read —
  // the clamp reads `Length` / `Count` and the call itself reads the receiver again.
  csharpSliceReceiverIsSideEffectFree(expression) {
    if (expression === void 0) {
      return false;
    }
    if (_typescript2.default.isParenthesizedExpression(expression) || _typescript2.default.isAsExpression(expression) || _typescript2.default.isTypeAssertionExpression(expression)) {
      return this.csharpSliceReceiverIsSideEffectFree(expression.expression);
    }
    if (_typescript2.default.isIdentifier(expression) || expression.kind === _typescript2.default.SyntaxKind.ThisKeyword) {
      return true;
    }
    if (_typescript2.default.isPropertyAccessExpression(expression)) {
      return this.csharpSliceReceiverIsSideEffectFree(expression.expression);
    }
    return false;
  }
  printReplaceCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return `((string)${name}).Replace((string)${parsedArg}, (string)${parsedArg2})`;
  }
  printReplaceAllCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
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
  printLengthProperty(node, identation, name = void 0) {
    const leftSide = this.printNode(node.expression, 0);
    const type = this.getChecker().getTypeAtLocation(node.expression);
    this.warnIfAnyType(node, type.flags, leftSide, "length");
    return this.isStringType(type.flags) ? `((string)${leftSide}).Length` : _nullishCoalesce(this.csharpNativeLengthExpression(node.expression), () => ( `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`));
  }
  printPostFixUnaryExpression(node, identation) {
    const { operand, operator } = node;
    if (operand.kind === _typescript2.default.SyntaxKind.NumericLiteral) {
      return super.printPostFixUnaryExpression(node, identation);
    }
    const leftSide = this.printNode(operand, 0);
    const op = this.PostFixOperators[operator];
    if (op === "--") {
      return `postFixDecrement(ref ${leftSide})`;
    }
    return `postFixIncrement(ref ${leftSide})`;
  }
  printPrefixUnaryExpression(node, identation) {
    const { operand, operator } = node;
    if (operand.kind === _typescript2.default.SyntaxKind.NumericLiteral) {
      return super.printPrefixUnaryExpression(node, identation);
    }
    if (operator === _typescript2.default.SyntaxKind.ExclamationToken) {
      return this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
    }
    const leftSide = this.printNode(operand, 0);
    if (operator === _typescript2.default.SyntaxKind.PlusToken) {
      return `prefixUnaryPlus(ref ${leftSide})`;
    } else {
      return `prefixUnaryNeg(ref ${leftSide})`;
    }
  }
  // `isTrue(x)` is the identity function on a C# bool (`isTrue` returns a bool unchanged),
  // so the wrapper is only needed for values the printer leaves boxed as `object`. Every
  // shape below is rendered as a C# bool by the printer itself; anything else keeps the helper.
  csharpConditionPrintsBool(node) {
    switch (_optionalChain([node, 'optionalAccess', _179 => _179.kind])) {
      case _typescript2.default.SyntaxKind.TrueKeyword:
      case _typescript2.default.SyntaxKind.FalseKeyword:
        return true;
      case _typescript2.default.SyntaxKind.ParenthesizedExpression:
        return this.csharpConditionPrintsBool(node.expression);
      case _typescript2.default.SyntaxKind.PrefixUnaryExpression:
        return node.operator === _typescript2.default.SyntaxKind.ExclamationToken;
      case _typescript2.default.SyntaxKind.BinaryExpression:
        return this.csharpBinaryExpressionPrintsBool(node);
      case _typescript2.default.SyntaxKind.Identifier:
        return this.csharpIdentifierPrintsBool(node);
      case _typescript2.default.SyntaxKind.CallExpression:
        return this.csharpCallPrintsBool(node);
    }
    return false;
  }
  // isEqual / !isEqual / isGreaterThan / ... / inOp all have a C# `bool` signature, and a
  // `&&` / `||` prints both operands through printCondition, i.e. as bool themselves
  csharpBinaryExpressionPrintsBool(node) {
    switch (node.operatorToken.kind) {
      case _typescript2.default.SyntaxKind.EqualsEqualsToken:
      case _typescript2.default.SyntaxKind.EqualsEqualsEqualsToken:
      case _typescript2.default.SyntaxKind.ExclamationEqualsToken:
      case _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken:
      case _typescript2.default.SyntaxKind.GreaterThanToken:
      case _typescript2.default.SyntaxKind.GreaterThanEqualsToken:
      case _typescript2.default.SyntaxKind.LessThanToken:
      case _typescript2.default.SyntaxKind.LessThanEqualsToken:
      case _typescript2.default.SyntaxKind.InKeyword:
      case _typescript2.default.SyntaxKind.BarBarToken:
      case _typescript2.default.SyntaxKind.AmpersandAmpersandToken:
        return true;
    }
    return false;
  }
  // the checker sees a value that is exactly boolean; `boolean | undefined` is a
  // TypeFlags.Union here and is therefore rejected (`bool?` is no condition in C#)
  csharpIsCheckedBoolean(node) {
    const type = this.getChecker().getTypeAtLocation(node);
    return ((_nullishCoalesce(_optionalChain([type, 'optionalAccess', _180 => _180.flags]), () => ( 0))) & _typescript2.default.TypeFlags.BooleanLike) !== 0;
  }
  // `bool name = ...` is only declared when getCSharpLocalType resolved that exact
  // declaration to `bool`, so ask the same function: the condition and the declaration
  // cannot disagree. Parameters, members and demoted locals return `object` there.
  csharpIdentifierPrintsBool(node) {
    if (!this.csharpIsCheckedBoolean(node)) {
      return false;
    }
    const declaration = _optionalChain([this, 'access', _181 => _181.getChecker, 'call', _182 => _182(), 'access', _183 => _183.getSymbolAtLocation, 'call', _184 => _184(node), 'optionalAccess', _185 => _185.valueDeclaration]);
    if (declaration === void 0 || !_typescript2.default.isVariableDeclaration(declaration) || _optionalChain([declaration, 'access', _186 => _186.name, 'optionalAccess', _187 => _187.kind]) !== _typescript2.default.SyntaxKind.Identifier) {
      return false;
    }
    if (!this.csharpLocalTypes.has(declaration)) {
      this.csharpLocalTypes.set(declaration, this.getCSharpLocalType(declaration));
    }
    return this.csharpLocalTypes.get(declaration) === "bool";
  }
  // calls the printer gives a concrete bool signature (inArray, valueIsDefined, startsWith,
  // Array.isArray, ...); safeBool and friends are `bool?` / `object` and keep the wrapper
  csharpCallPrintsBool(node) {
    return this.csharpIsCheckedBoolean(node) && this.csharpCallReturnType(node) === "bool";
  }
  // same emission as the base implementation except for the bare-bool branch: the node is
  // printed once and only wrapped in isTrue(...) when the printer did not already render a bool
  printCondition(node, identation) {
    if (this.supportsFalsyOrTruthyValues) {
      return this.printNode(node, identation);
    }
    if (_optionalChain([node, 'optionalAccess', _188 => _188.kind]) === _typescript2.default.SyntaxKind.PrefixUnaryExpression && node.operator === _typescript2.default.SyntaxKind.ExclamationToken) {
      return this.printPrefixUnaryExpression(node, identation);
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
  csharpConditionParensIfNeeded(node, printed) {
    if (_optionalChain([node, 'optionalAccess', _189 => _189.kind]) !== _typescript2.default.SyntaxKind.BinaryExpression) {
      return printed;
    }
    const op = node.operatorToken.kind;
    if (op !== _typescript2.default.SyntaxKind.BarBarToken && op !== _typescript2.default.SyntaxKind.AmpersandAmpersandToken) {
      return printed;
    }
    const parent = node.parent;
    const underNot = _optionalChain([parent, 'optionalAccess', _190 => _190.kind]) === _typescript2.default.SyntaxKind.PrefixUnaryExpression && parent.operator === _typescript2.default.SyntaxKind.ExclamationToken;
    const underAnd = op === _typescript2.default.SyntaxKind.BarBarToken && _optionalChain([parent, 'optionalAccess', _191 => _191.kind]) === _typescript2.default.SyntaxKind.BinaryExpression && parent.operatorToken.kind === _typescript2.default.SyntaxKind.AmpersandAmpersandToken;
    return underNot || underAnd ? `(${printed})` : printed;
  }
  printConditionalExpression(node, identation) {
    const condition = this.printCondition(node.condition, 0);
    const whenTrue = this.printNode(node.whenTrue, 0);
    const whenFalse = this.printNode(node.whenFalse, 0);
    return `((bool) ${condition}) ? ` + whenTrue + " : " + whenFalse;
  }
  printDeleteExpression(node, identation) {
    const object = this.printNode(node.expression.expression, 0);
    const key = this.printNode(node.expression.argumentExpression, 0);
    return `((IDictionary<string,object>)${object}).Remove((string)${key})`;
  }
  printNewExpression(node, identation) {
    let expression = _optionalChain([node, 'access', _192 => _192.expression, 'optionalAccess', _193 => _193.escapedText]);
    expression = expression ? expression : this.printNode(node.expression);
    if (expression === "Error") {
      expression = "Exception";
    }
    const args = node.arguments.map((n) => this.printNode(n, identation)).join(", ");
    const newToken = this.NEW_TOKEN ? this.NEW_TOKEN + " " : "";
    return newToken + expression + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
  }
  printThrowStatement(node, identation) {
    if (node.expression.kind === _typescript2.default.SyntaxKind.Identifier) {
      return this.getIden(identation) + this.THROW_TOKEN + " " + this.printNode(node.expression, 0) + this.LINE_TERMINATOR;
    }
    if (node.expression.kind === _typescript2.default.SyntaxKind.NewExpression) {
      const expression = node.expression;
      const argumentsExp = _nullishCoalesce(_optionalChain([expression, 'optionalAccess', _194 => _194.arguments]), () => ( []));
      const parsedArg = _nullishCoalesce(argumentsExp.map((n) => this.printNode(n, 0)).join(","), () => ( ""));
      const newExpression = this.printNode(expression.expression, 0);
      if (expression.expression.kind === _typescript2.default.SyntaxKind.Identifier) {
        const id = expression.expression;
        const idName = id.escapedText === "Error" ? "Exception" : id.escapedText;
        const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
        if (symbol) {
          const declarations = _nullishCoalesce(_optionalChain([this, 'access', _195 => _195.getChecker, 'call', _196 => _196(), 'access', _197 => _197.getDeclaredTypeOfSymbol, 'call', _198 => _198(symbol), 'access', _199 => _199.symbol, 'optionalAccess', _200 => _200.declarations]), () => ( []));
          const isClassDeclaration = declarations.find((l) => l.kind === _typescript2.default.SyntaxKind.InterfaceDeclaration || l.kind === _typescript2.default.SyntaxKind.ClassDeclaration);
          if (isClassDeclaration) {
            return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${idName} ((string)${parsedArg}) ${this.LINE_TERMINATOR}`;
          } else {
            return this.getIden(identation) + `throwDynamicException(${idName}, ${parsedArg});return null;`;
          }
        }
        return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${idName === id.escapedText ? newExpression : idName} (${parsedArg}) ${this.LINE_TERMINATOR}`;
      } else if (expression.expression.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
        return this.getIden(identation) + `throwDynamicException(${newExpression}, ${parsedArg});`;
      }
      return super.printThrowStatement(node, identation);
    }
  }
  printPropertyAccessModifiers(node) {
    let modifiers = this.printModifiers(node);
    if (modifiers === "") {
      modifiers = this.defaultPropertyAccess;
    }
    let typeText = "object";
    if (node.type) {
      typeText = this.getType(node);
      if (!typeText) {
        if (node.type.kind === _typescript2.default.SyntaxKind.AnyKeyword) {
          typeText = this.OBJECT_KEYWORD + " ";
        }
      }
    }
    return modifiers + " " + typeText + " ";
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
};

// src/transpiler.ts
var _path = require('path'); var path = _interopRequireWildcard(_path);
var _fs = require('fs'); var fs = _interopRequireWildcard(_fs);

// src/goTranspiler.ts
init_cjs_shims();

var SyntaxKind3 = _typescript2.default.SyntaxKind;
var parserConfig4 = {
  "ELSEIF_TOKEN": "else if",
  "OBJECT_OPENING": "map[string]any{",
  "ARRAY_OPENING_TOKEN": "[]any{",
  "ARRAY_CLOSING_TOKEN": "}",
  "PROPERTY_ASSIGNMENT_TOKEN": ":",
  "VAR_TOKEN": "object",
  // object
  "METHOD_TOKEN": "func",
  "PROPERTY_ASSIGNMENT_OPEN": "",
  "PROPERTY_ASSIGNMENT_CLOSE": "",
  "SUPER_TOKEN": "base",
  "SUPER_CALL_TOKEN": "base",
  "FALSY_WRAPPER_OPEN": "EvalTruthy(",
  "FALSY_WRAPPER_CLOSE": ")",
  "COMPARISON_WRAPPER_OPEN": "IsEqual(",
  "COMPARISON_WRAPPER_CLOSE": ")",
  "UKNOWN_PROP_WRAPPER_OPEN": "this.call(",
  "UNKOWN_PROP_WRAPPER_CLOSE": ")",
  "UKNOWN_PROP_ASYNC_WRAPPER_OPEN": "this.callAsync(",
  "UNKOWN_PROP_ASYNC_WRAPPER_CLOSE": ")",
  "DYNAMIC_CALL_OPEN": "callDynamically(",
  "EQUALS_EQUALS_WRAPPER_OPEN": "IsEqual(",
  "EQUALS_EQUALS_WRAPPER_CLOSE": ")",
  "DIFFERENT_WRAPPER_OPEN": "!IsEqual(",
  "DIFFERENT_WRAPPER_CLOSE": ")",
  "GREATER_THAN_WRAPPER_OPEN": "IsGreaterThan(",
  "GREATER_THAN_WRAPPER_CLOSE": ")",
  "GREATER_THAN_EQUALS_WRAPPER_OPEN": "IsGreaterThanOrEqual(",
  "GREATER_THAN_EQUALS_WRAPPER_CLOSE": ")",
  "LESS_THAN_WRAPPER_OPEN": "IsLessThan(",
  "LESS_THAN_WRAPPER_CLOSE": ")",
  "LESS_THAN_EQUALS_WRAPPER_OPEN": "IsLessThanOrEqual(",
  "LESS_THAN_EQUALS_WRAPPER_CLOSE": ")",
  "PLUS_WRAPPER_OPEN": "Add(",
  "PLUS_WRAPPER_CLOSE": ")",
  "MINUS_WRAPPER_OPEN": "Subtract(",
  "MINUS_WRAPPER_CLOSE": ")",
  "ARRAY_LENGTH_WRAPPER_OPEN": "GetArrayLength(",
  "ARRAY_LENGTH_WRAPPER_CLOSE": ")",
  "DIVIDE_WRAPPER_OPEN": "Divide(",
  "DIVIDE_WRAPPER_CLOSE": ")",
  "MULTIPLY_WRAPPER_OPEN": "Multiply(",
  "MULTIPLY_WRAPPER_CLOSE": ")",
  "INDEXOF_WRAPPER_OPEN": "GetIndexOf(",
  "INDEXOF_WRAPPER_CLOSE": ")",
  "MOD_WRAPPER_OPEN": "Mod(",
  "MOD_WRAPPER_CLOSE": ")",
  "FUNCTION_TOKEN": "func",
  "DEFAULT_RETURN_TYPE": "any",
  "BLOCK_OPENING_TOKEN": "{",
  "DEFAULT_PARAMETER_TYPE": "any",
  "LINE_TERMINATOR": "",
  "CONDITION_OPENING": "",
  "CONDITION_CLOSE": "",
  "AWAIT_TOKEN": "",
  "NULL_TOKEN": "nil",
  "UNDEFINED_TOKEN": "nil",
  "WHILE_TOKEN": "for",
  "ELEMENT_ACCESS_WRAPPER_OPEN": "GetValue(",
  "ELEMENT_ACCESS_WRAPPER_CLOSE": ")"
};
var GO_HELPER_RETURN_TYPES = {
  "GetArrayLength": "int",
  "GetLength": "int",
  // the printInlineArrayLength emission of `.length` on a slice
  "len": "int",
  "GetIndexOf": "int",
  "ToString": "string",
  "ToLower": "string",
  "ToUpper": "string",
  "JsonStringify": "string",
  "Capitalize": "string",
  "this.Uuid": "string",
  "this.Hmac": "string",
  "this.Ymdhms": "string",
  "this.Yyyymmdd": "string",
  "this.Ymd": "string",
  "Split": "[]string",
  "ObjectKeys": "[]string",
  "this.Extend": "map[string]any",
  "this.DeepExtend": "map[string]any",
  "this.Keysort": "map[string]any",
  "this.IndexBy": "map[string]any",
  "this.GroupBy": "map[string]any",
  "this.Milliseconds": "int64",
  "this.Seconds": "int64",
  "this.Microseconds": "int64",
  "ParseInt": "int64",
  "MathFloor": "float64",
  "MathCeil": "float64",
  "MathRound": "float64",
  "MathAbs": "float64",
  "MathPow": "float64",
  "ToFloat64": "float64",
  "EvalTruthy": "bool",
  "IsEqual": "bool",
  "IsGreaterThan": "bool",
  "IsLessThan": "bool",
  "IsGreaterThanOrEqual": "bool",
  "IsLessThanOrEqual": "bool",
  "InOp": "bool",
  "IsArray": "bool",
  "IsString": "bool",
  "IsInt": "bool",
  "IsBool": "bool",
  "IsNumber": "bool",
  "IsObject": "bool",
  "IsDictionary": "bool",
  "StartsWith": "bool",
  "EndsWith": "bool",
  "IsInstance": "bool",
  "IsInteger": "bool",
  "this.InArray": "bool",
  "this.ValueIsDefined": "bool",
  "Precise.StringGt": "bool",
  "Precise.StringGe": "bool",
  "Precise.StringLt": "bool",
  "Precise.StringLe": "bool",
  "Precise.StringEq": "bool",
  "Precise.StringEquals": "bool",
  // the base Safe* accessors return a typed pointer so that an absent value is a
  // nil pointer, distinct from a present zero value ("" / 0 / false)
  "this.SafeString": "*string",
  "this.SafeString2": "*string",
  "this.SafeStringN": "*string",
  "this.SafeStringLower": "*string",
  "this.SafeStringLower2": "*string",
  "this.SafeStringLowerN": "*string",
  "this.SafeStringUpper": "*string",
  "this.SafeStringUpper2": "*string",
  "this.SafeStringUpperN": "*string",
  "this.SafeInteger": "*int64",
  "this.SafeInteger2": "*int64",
  "this.SafeIntegerN": "*int64",
  "this.SafeIntegerProduct": "*int64",
  "this.SafeIntegerProduct2": "*int64",
  "this.SafeIntegerProductN": "*int64",
  "this.SafeTimestamp": "*int64",
  "this.SafeTimestamp2": "*int64",
  "this.SafeTimestampN": "*int64",
  "this.SafeFloat": "*float64",
  "this.SafeFloat2": "*float64",
  "this.SafeFloatN": "*float64",
  // absent flag → nil pointer, present flag → its value, mirroring the string/number accessors
  "this.SafeBool": "*bool",
  "this.SafeBool2": "*bool",
  "this.SafeBoolN": "*bool",
  // SafeDict*/SafeList* stay untyped: the Go accessors return `any` because the value
  // may be a *sync.Map, a Dict or an order-book side, none of which is a map[string]any / []any
  // Precise arithmetic returns a numeric string, or nil when an operand is
  // absent, so it carries the same *string shape as the Safe* string accessors
  "Precise.StringMul": "*string",
  "Precise.StringDiv": "*string",
  "Precise.StringSub": "*string",
  "Precise.StringAdd": "*string",
  "Precise.StringOr": "*string",
  "Precise.StringMax": "*string",
  "Precise.StringMin": "*string",
  "Precise.StringAbs": "*string",
  "Precise.StringNeg": "*string",
  "Precise.StringMod": "*string"
};
var GO_BOOL_FIELDS = /* @__PURE__ */ new Set([
  "this.Verbose",
  "this.EnableRateLimit",
  "this.ReduceFees",
  "this.SubstituteCommonCurrencyCodes",
  "this.IsSandboxModeEnabled"
]);
var GO_ANY_BOX_CALLS = [
  "GetValue",
  "Ternary",
  "SafeValue",
  "this.SafeValue",
  "SafeDict",
  "this.SafeDict",
  "SafeList",
  "this.SafeList",
  "SafeNumber",
  "this.SafeNumber"
];
var GO_TYPE_NAMES = ["string", "int", "int64", "float64", "bool", "any"];
var GO_NUMERIC_KINDS = ["int", "int64", "float64"];
var ORDERED_COMPARISON_OPERATORS = {
  [_typescript2.default.SyntaxKind.GreaterThanToken]: ">",
  [_typescript2.default.SyntaxKind.GreaterThanEqualsToken]: ">=",
  [_typescript2.default.SyntaxKind.LessThanToken]: "<",
  [_typescript2.default.SyntaxKind.LessThanEqualsToken]: "<="
};
var GO_STRING_FIELD_NAMES = ["Id", "Name", "Version"];
var GO_ARITHMETIC_KINDS = [
  _typescript2.default.SyntaxKind.PlusToken,
  _typescript2.default.SyntaxKind.MinusToken,
  _typescript2.default.SyntaxKind.AsteriskToken,
  _typescript2.default.SyntaxKind.SlashToken,
  _typescript2.default.SyntaxKind.PercentToken
];
var GO_COMMENT_BREAK_END = /(?:[({[:]|[+\-*/%&|^<>=!])$/;
function goBracketBalance(code) {
  let depth = 0;
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < code.length) {
        if (code[i] === "\\") {
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "`") {
      i += 1;
      while (i < code.length && code[i] !== "`") {
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
    }
    i += 1;
  }
  return depth;
}
function goTrailingCommentIndex(line, state) {
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (state.block) {
      if (ch === "*" && line[i + 1] === "/") {
        state.block = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (state.raw) {
      if (ch === "`") {
        state.raw = false;
      }
      i += 1;
      continue;
    }
    if (ch === "`") {
      state.raw = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < line.length) {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "/" && line[i + 1] === "/") {
      return i;
    }
    if (ch === "/" && line[i + 1] === "*") {
      state.block = true;
      i += 2;
      continue;
    }
    i += 1;
  }
  return -1;
}
function goRuneWidth(text) {
  let width = 0;
  for (const _rune of text) {
    width += 1;
  }
  return width;
}
function alignGoTrailingComments(content) {
  const lines = content.split("\n");
  const entries = [];
  const state = { "block": false, "raw": false };
  for (let index = 0; index < lines.length; index++) {
    const commentIndex = goTrailingCommentIndex(lines[index], state);
    if (commentIndex < 0) {
      continue;
    }
    const code = lines[index].slice(0, commentIndex).replace(/[ \t]+$/, "");
    if (!code.trim()) {
      continue;
    }
    const indent = code.match(/^[ \t]*/)[0];
    entries.push({ "index": index, indent, code, "comment": lines[index].slice(commentIndex) });
  }
  const groups = [];
  let group = [];
  for (const entry of entries) {
    const previous = group[group.length - 1];
    const continues = previous && entry.index === previous.index + 1 && entry.indent === previous.indent && goBracketBalance(previous.code) === 0 && !GO_COMMENT_BREAK_END.test(previous.code);
    if (continues) {
      group.push(entry);
    } else {
      if (group.length) {
        groups.push(group);
      }
      group = [entry];
    }
  }
  if (group.length) {
    groups.push(group);
  }
  for (const members of groups) {
    let width = 0;
    for (const member of members) {
      width = Math.max(width, goRuneWidth(member.code));
    }
    width += 1;
    for (const member of members) {
      const pad = width - goRuneWidth(member.code);
      lines[member.index] = member.code + " ".repeat(pad) + member.comment;
    }
  }
  return lines.join("\n");
}
var GoTranspiler = class extends BaseTranspiler {
  constructor(config = {}) {
    config["parser"] = Object.assign({}, parserConfig4, _nullishCoalesce(config["parser"], () => ( {})));
    super(config);
    this.wrapCallMethods = [];
    // declarations whose Go local type is being resolved right now (see goLocalStaticType)
    this.goLocalTypeResolution = /* @__PURE__ */ new Set();
    // appended to every async (channel returning) Go method/function name and to each
    // checker-resolved call site of one; '' disables the rename
    this.asyncMethodSuffix = "";
    this.DEFAULT_RETURN_TYPE = "any";
    // suffix of the sibling body method an async trampoline hands its work to
    this.ASYNC_BODY_SUFFIX = "Body";
    // gofmt indents every nesting level with exactly one tab; the printer emits the
    // same bytes so the generated tree needs no `gofmt` pass (campaign go-gofmt F01)
    this.DEFAULT_IDENTATION = "	";
    // true when an `any`-typed local can hold a *T helper result: its initializer or a
    // later `x = …` write is a `this.safeX(…)` call whose Go signature returns a pointer
    this.goAnyLocalHoldsPointerCache = /* @__PURE__ */ new Map();
    // the Go type this identifier is actually *declared* with, or undefined when it
    // stays `any`. It goes through getGoLocalType, not goTypeOfInitializer, so a
    // declaration the reject filters demoted back to `any` is reported as `any` here
    // too — otherwise we would emit `*x` against an `any` box.
    // Parameters stay `any` today, so they never resolve to a concrete type.
    //
    // getGoLocalType re-prints every reassignment's right-hand side, and printing a
    // ternary re-enters printCondition, which lands back here: `x = (x === 'a') ? …`
    // would recurse forever. The in-progress set breaks that cycle by answering
    // `any` for the declaration currently being classified, and the cache keeps the
    // per-occurrence cost at one scope scan per declaration.
    this.goDeclaredTypeCache = /* @__PURE__ */ new Map();
    this.goDeclaredTypeInProgress = /* @__PURE__ */ new Set();
    // `x.length` on a value the printer declares as a slice is `len(x)`: Go's len is
    // 0 for a nil slice, exactly like GetArrayLength's `[]T` cases. On a map or an
    // `any` box GetArrayLength answers 0, so only a `[]`-typed value may inline —
    // and only for the slice types the helper itself counts (a []byte would answer 0).
    this.sliceLengthTypes = ["[]any", "[]string", "[]int64", "[]float64", "[]bool", "[]int", "[][]any", "[]map[string]any"];
    // comparison helpers that normalize int/int64/float64 against each other, so a
    // literal operand's Go default type (int) behaves like the int64 OpNeg produces
    this.comparisonHelpers = ["IsEqual", "IsGreaterThan", "IsLessThan", "IsGreaterThanOrEqual", "IsLessThanOrEqual"];
    // level of the statement being printed: a multi-line composite literal is laid out
    // relative to it (go/printer), whatever level the expression printers hand down
    this.goStatementLevel = 0;
    // -----------------------------------------------------------------------
    // gofmt-compatible spacing of the binary expressions this printer emits
    // -----------------------------------------------------------------------
    // go/printer (nodes.go) prints a binary expression with blanks around the
    // operator unless the expression sits deeper than the top level of a
    // statement: binaryExpr() asks cutoff() - which inspects the operator tree
    // through walkBinary() - and drops *both* blanks when the operator
    // precedence is below that cutoff. Level 4/5 operators (`+ - * / % & | ^
    // << >>`) therefore print as `a + b` at the top level but as `a+b`, `a[i+1]`
    // one level down; comparisons and `&&`/`||` (level 3 and below) always keep
    // their blanks.
    //
    // goExprDepth mirrors the depth go/printer tracks over the Go AST it is
    // about to emit: 1 at the start of every statement, +1 for an argument list
    // with more than one argument, +1 for an index expression, +1 for the right
    // operand of a binary expression, -1 inside parentheses (never below 1), and
    // back to 1 for composite literal elements.
    this.goExprDepth = 1;
    this.requiresParameterType = true;
    this.requiresReturnType = true;
    this.asyncTranspiling = false;
    this.implicitAsyncTranspiling = true;
    this.supportsFalsyOrTruthyValues = false;
    this.requiresCallExpressionCast = true;
    this.wrapThisCalls = false;
    this.id = "Go";
    this.className = "undefined";
    this.classNameMap = _nullishCoalesce(config["classNameMap"], () => ( {}));
    this.initConfig();
    this.applyUserOverrides(config);
    this.wrapThisCalls = _nullishCoalesce(config["wrapThisCalls"], () => ( false));
    this.wrapCallMethods = _nullishCoalesce(config["wrapCallMethods"], () => ( []));
    this.asyncMethodSuffix = _nullishCoalesce(config["asyncMethodSuffix"], () => ( ""));
  }
  initConfig() {
    this.LeftPropertyAccessReplacements = {
      // 'this': '$this',
    };
    this.RightPropertyAccessReplacements = {
      "push": "Add",
      // list method
      "indexOf": "IndexOf",
      // list method
      "toUpperCase": "ToUpper",
      "toLowerCase": "ToLower",
      "toString": "ToString"
    };
    this.FullPropertyAccessReplacements = {
      "JSON.parse": "parseJson",
      // custom helper method
      "console.log": "fmt.Println",
      "Number.MAX_SAFE_INTEGER": "Int32.MaxValue",
      "Math.min": "Math.Min",
      "Math.max": "Math.Max",
      "Math.log": "Math.Log",
      "Math.abs": "Math.Abs",
      // 'Math.ceil':  'Math.Ceiling', // need cast
      // 'Math.round': 'Math.Round', // need to cast
      "Math.floor": "Math.Floor",
      "Math.pow": "Math.Pow"
      // 'Promise.all': 'Task.WhenAll',
    };
    this.CallExpressionReplacements = {
      // "parseInt": "parseINt",
      // "parseFloat": "float.Parse",
    };
    this.ReservedKeywordsReplacements = {
      // 'string': 'str',
      // 'params': 'parameters',
      "type": "typeVar"
      // 'internal': 'intern',
      // 'event': 'eventVar',
      // 'fixed': 'fixedVar',
    };
    this.binaryExpressionsWrappers = {
      [_typescript2.default.SyntaxKind.EqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.EqualsEqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.ExclamationEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.GreaterThanToken]: [this.GREATER_THAN_WRAPPER_OPEN, this.GREATER_THAN_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.GreaterThanEqualsToken]: [this.GREATER_THAN_EQUALS_WRAPPER_OPEN, this.GREATER_THAN_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.LessThanToken]: [this.LESS_THAN_WRAPPER_OPEN, this.LESS_THAN_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.LessThanEqualsToken]: [this.LESS_THAN_EQUALS_WRAPPER_OPEN, this.LESS_THAN_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.PlusToken]: [this.PLUS_WRAPPER_OPEN, this.PLUS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.MinusToken]: [this.MINUS_WRAPPER_OPEN, this.MINUS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.AsteriskToken]: [this.MULTIPLY_WRAPPER_OPEN, this.MULTIPLY_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.PercentToken]: [this.MOD_WRAPPER_OPEN, this.MOD_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.SlashToken]: [this.DIVIDE_WRAPPER_OPEN, this.DIVIDE_WRAPPER_CLOSE]
    };
  }
  // getBlockOpen(identation){
  //     return this.getIden(identation)  + this.BLOCK_OPENING_TOKEN;
  // }
  printSuperCallInsideConstructor(node, identation) {
    return "";
  }
  printStringLiteral(node) {
    const token = this.STRING_QUOTE_TOKEN;
    let text = node.text;
    if (text in this.StringLiteralReplacements) {
      return this.StringLiteralReplacements[text];
    }
    if (/[\\"\b\f\n\r\t]/.test(text)) {
      const backslashPlaceholder = "\0";
      text = text.replaceAll("\\", backslashPlaceholder);
      text = text.replaceAll("\b", "\\b");
      text = text.replaceAll("\f", "\\f");
      text = text.replaceAll("\n", "\\n");
      text = text.replaceAll("\r", "\\r");
      text = text.replaceAll("	", "\\t");
      text = text.replaceAll(backslashPlaceholder, "\\\\");
      text = text.replaceAll('"', '\\"');
    }
    return token + text + token;
  }
  transformFunctionNameIfNeeded(name) {
    return this.capitalize(name);
  }
  // The cells of one struct field in the shape gofmt's fieldList() prints them: a named
  // field is `Name Type [Tag]` (the name cell — and, when the field carries a tag, the type
  // cell too — is a tab-terminated column cell) and an embedded field is a single cell.
  // printStruct() lays those cells out; printPropertyDeclaration() joins them with spaces.
  getStructFieldCells(node) {
    const name = this.capitalize(this.printNode(node.name, 0));
    let type = "any";
    if (node.type === void 0) {
      type = "any";
    } else if (node.type.kind === SyntaxKind3.StringKeyword) {
      type = "string";
    } else if (node.type.kind === SyntaxKind3.NumberKeyword) {
      type = "int";
    } else if (node.type.kind === SyntaxKind3.BooleanKeyword || _typescript2.default.isBooleanLiteral(node)) {
      type = "bool";
    } else if (node.type.kind === SyntaxKind3.ArrayType) {
      type = "[]any";
    }
    const cells = [name, type];
    if (node.initializer) {
      let initializer = this.printNode(node.initializer, 0);
      initializer = initializer.replaceAll('"', "");
      cells.push(`\`default:"${initializer}"\``);
    }
    return cells;
  }
  printPropertyDeclaration(node, identation) {
    return this.getIden(identation) + this.getStructFieldCells(node).join(" ") + this.LINE_TERMINATOR;
  }
  printStruct(node, indentation) {
    const rows = [];
    if (_optionalChain([node, 'optionalAccess', _201 => _201.heritageClauses, 'optionalAccess', _202 => _202.length]) > 0) {
      const heritage = node.heritageClauses[0];
      const heritageType = heritage.types[0];
      let heritageEscapedText = heritageType.expression.escapedText;
      if (this.classNameMap[heritageEscapedText]) {
        heritageEscapedText = this.classNameMap[heritageEscapedText];
      }
      rows.push([heritageEscapedText]);
    }
    const propDeclarations = node.members.filter((member) => member.kind === SyntaxKind3.PropertyDeclaration);
    propDeclarations.forEach((member) => rows.push(this.getStructFieldCells(member)));
    const lines = rows.map((cells, row) => {
      let line = cells[0];
      for (let column = 0; column < cells.length - 1; column++) {
        let width = 0;
        for (let previous = row; previous >= 0 && rows[previous].length > column + 1; previous--) {
          width = Math.max(width, rows[previous][column].length);
        }
        for (let next = row + 1; next < rows.length && rows[next].length > column + 1; next++) {
          width = Math.max(width, rows[next][column].length);
        }
        line += " ".repeat(width + 1 - cells[column].length) + cells[column + 1];
      }
      return this.getIden(indentation + 1) + line;
    });
    const body = lines.length ? "\n" + lines.join("\n") + "\n" : "\n";
    return `type ${this.className} struct {${body}}`;
  }
  printNewStructMethod(node) {
    return `
func New${this.capitalize(this.className)}() *${this.className} {
	p := &${this.className}{}
	setDefaults(p)
	return p
}
`;
  }
  printClass(node, identation) {
    this.className = node.name.escapedText;
    if (this.classNameMap[this.className]) {
      this.className = this.classNameMap[this.className];
    }
    const struct = this.printStruct(node, identation);
    const newMethod = this.printNewStructMethod(node);
    const methods = node.members.filter((member) => member.kind === SyntaxKind3.MethodDeclaration);
    const classMethods = this.joinTopLevelDecls(methods.map((method) => this.printMethodDeclaration(method, identation)));
    return struct + "\n" + newMethod + "\n" + classMethods;
  }
  /**
   * gofmt's declaration-list rule (go/printer nodes.go `declList`): a top-level
   * declaration that carries a doc comment is separated from the previous declaration
   * by exactly one blank line (`min = 2` linebreaks), while a declaration without one
   * keeps the source's own separation (the printer emits members adjacent to the
   * closing brace above them). `printClass` used to join every member with a bare
   * "\n", so a method whose leading `/** ... *` + `/` comment follows the previous
   * method's closing brace came out as `}\n/**` and gofmt re-inserted the blank line.
   */
  joinTopLevelDecls(decls) {
    return decls.map((decl, index) => {
      if (index === 0 || !this.startsWithComment(decl)) {
        return (index === 0 ? "" : "\n") + decl;
      }
      return "\n\n" + decl;
    }).join("");
  }
  /**
   * True when the emitted declaration text opens with its doc comment - the comment
   * group gofmt attaches to the declaration (`getDoc(d) != nil` in go/printer).
   */
  startsWithComment(decl) {
    return this.isComment(decl.split("\n")[0]);
  }
  /**
   * Indent every non-blank line of `lines` by `identation` levels. gofmt trims trailing
   * whitespace, so an indented *blank* line (only the indentation of a blank source
   * line) must stay empty instead of becoming whitespace-only text.
   */
  indentLines(lines, identation) {
    return lines.map((line) => line.trim().length === 0 ? "" : this.getIden(identation) + line);
  }
  printPropertyAccessModifiers(node) {
    return "";
  }
  printSpreadElement(node, identation) {
    const expression = this.printNode(node.expression, 0);
    return this.getIden(identation) + expression + this.SPREAD_TOKEN;
  }
  printMethodDeclaration(node, identation) {
    let methodDef = this.printMethodDefinition(node, identation);
    const isAsync = this.isAsyncFunction(node);
    const funcBody = this.printFunctionBody(node, identation, isAsync);
    if (!isAsync) {
      methodDef += funcBody;
      return methodDef;
    }
    const goName = this.transformMethodNameIfNeeded(node.name.escapedText);
    const bodyName = this.getAsyncBodyName(node, goName);
    const trampoline = methodDef + this.printAsyncTrampolineBlock(node, identation, `${this.THIS_TOKEN}.${bodyName}`);
    const bodyDef = `${this.getIden(identation)}func (${this.THIS_TOKEN} *${this.className}) ${bodyName}(${this.printAsyncBodyParameters(node)}) ${this.DEFAULT_RETURN_TYPE} `;
    return trampoline + "\n" + bodyDef + funcBody;
  }
  printFunctionDeclaration(node, identation) {
    if (_typescript2.default.isArrowFunction(node)) {
      const parameters = node.parameters.map((param) => this.printParameter(param)).join(", ");
      const body = this.printNode(node.body);
      return `(${parameters}) => ${body}`;
    }
    const isAsync = this.isAsyncFunction(node);
    const functionDef = this.printFunctionDefinition(node, identation);
    const funcBody = this.printFunctionBody(node, identation, isAsync);
    if (!isAsync) {
      return functionDef + funcBody;
    }
    const goName = this.transformMethodNameIfNeeded(node.name.escapedText);
    const bodyName = this.getAsyncBodyName(node, goName);
    const trampoline = functionDef + this.printAsyncTrampolineBlock(node, identation, bodyName);
    const bodyDef = `${this.getIden(identation)}func ${bodyName}(${this.printAsyncBodyParameters(node)}) ${this.DEFAULT_RETURN_TYPE} `;
    return trampoline + "\n" + bodyDef + funcBody;
  }
  /**
   * Name of the sibling *body* method/function an async core hands its work to.
   *
   * `FetchTicker` -> `fetchTickerBody`. Deliberately UNEXPORTED: the body is an
   * implementation detail of the trampoline, so it must not show up on the generated
   * interfaces (ICoreExchange) nor on the typed `*_wrapper.go` facades, and it stays
   * invisible to the reflection based `callInternal`/`callDynamically` dispatch.
   *
   * If that name is already taken by a real declaration (a hand written
   * `fetchTickerBody`), a numeric suffix is appended instead of silently clobbering it.
   */
  getAsyncBodyName(node, goName) {
    const taken = /* @__PURE__ */ new Set();
    const remember = (raw) => {
      if (!raw) {
        return;
      }
      const name2 = String(raw);
      taken.add(name2);
      try {
        taken.add(this.transformMethodNameIfNeeded(name2));
      } catch (e2) {
      }
    };
    try {
      const parent = _optionalChain([node, 'optionalAccess', _203 => _203.parent]);
      if (parent && _typescript2.default.isClassDeclaration(parent)) {
        parent.members.forEach((member) => remember(_optionalChain([member, 'optionalAccess', _204 => _204.name, 'optionalAccess', _205 => _205.escapedText])));
      } else if (parent && _typescript2.default.isSourceFile(parent)) {
        parent.statements.forEach((statement) => {
          if (_typescript2.default.isFunctionDeclaration(statement)) {
            remember(_optionalChain([statement, 'optionalAccess', _206 => _206.name, 'optionalAccess', _207 => _207.escapedText]));
          }
        });
      }
    } catch (e3) {
    }
    const base = goName.charAt(0).toLowerCase() + goName.slice(1) + this.ASYNC_BODY_SUFFIX;
    let name = base;
    let suffix = 0;
    while (taken.has(name)) {
      suffix++;
      name = `${base}${suffix}`;
    }
    return name;
  }
  /**
   * Parameter list of the body: the channel it must fill, then the original parameters
   * verbatim (including the `optionalArgs ...any` tail), so the trampoline can forward
   * its own arguments unchanged.
   */
  printAsyncBodyParameters(node) {
    const params = this.printMethodParameters(node);
    const channelParam = `ch chan ${this.DEFAULT_RETURN_TYPE}`;
    return params ? `${channelParam}, ${params}` : channelParam;
  }
  /**
   * Arguments the trampoline forwards to its body, matching printMethodParameters:
   * the declared parameters in order, plus the variadic `optionalArgs...` tail when
   * the function has any defaulted parameter.
   */
  printAsyncTrampolineArgs(node) {
    const args = [];
    let hasOptionalParameter = false;
    (_nullishCoalesce(_optionalChain([node, 'optionalAccess', _208 => _208.parameters]), () => ( []))).forEach((param) => {
      if (param.initializer) {
        hasOptionalParameter = true;
        return;
      }
      args.push(this.printNode(param.name, 0));
    });
    if (hasOptionalParameter) {
      args.push("optionalArgs...");
    }
    return args.join(", ");
  }
  /**
   * The trampoline: an async core hands back a *hot handle*.
   *
   *     func (this *Exchange) FetchTicker(symbol any) <-chan any {
   *         ch := make(chan any, 1)
   *         go this.fetchTickerBody(ch, symbol)
   *         return ch
   *     }
   *
   *   - `ch` is buffered (cap 1): the body's single `ch <- value` never blocks, so a
   *     result nobody ever receives still lets the goroutine finish and run
   *     `defer close(ch)` (no leak for abandoned calls).
   *   - the body runs on its own goroutine, so the call expression returns immediately
   *     with work already in flight. That is what makes
   *     `const a = this.fetchA (); const b = this.fetchB (); await Promise.all([a,b])`
   *     overlap, exactly like the C#/Java ports, with no call-site wrapper.
   *   - the result stays UNNAMED (`<-chan any`): `return ch` is the trampoline's only
   *     statement and it always runs, because the recover (`defer ReturnPanicError(ch)`)
   *     lives on the body, not here.
   */
  printAsyncTrampolineBlock(node, identation, callee) {
    const args = this.printAsyncTrampolineArgs(node);
    const argList = args ? `, ${args}` : "";
    return [
      // F04: the signature above ends WITHOUT a trailing space, so the block opener
      // carries the one space before `{` (same contract as getBlockOpen)
      " {",
      `${this.getIden(identation + 1)}ch := make(chan ${this.DEFAULT_RETURN_TYPE}, 1)`,
      `${this.getIden(identation + 1)}go ${callee}(ch${argList})`,
      `${this.getIden(identation + 1)}return ch`,
      `${this.getIden(identation)}}`
    ].join("\n");
  }
  /**
   * Go name of an async (channel returning) declaration: `fetchTicker` -> `FetchTickerAsync`.
   * Empty `asyncMethodSuffix` (the default) keeps the plain name, so the suffix is opt-in.
   */
  printAsyncDeclarationName(node, goName) {
    if (!this.asyncMethodSuffix || !this.isAsyncFunction(node)) {
      return goName;
    }
    return goName + this.asyncMethodSuffix;
  }
  /**
   * Resolve the declaration a call/property access refers to and append `asyncMethodSuffix`
   * when it is an async function. Uses the checker, so `this.x()`, `super.x()`, `obj.x()` and
   * bare `x()` all agree with the declaration site. Unresolvable or non-function symbols
   * (properties, `any` receivers, JS builtins) keep the plain name.
   */
  applyAsyncSuffixToCallee(nameNode, goName) {
    if (!this.asyncMethodSuffix || !nameNode) {
      return goName;
    }
    let decls;
    try {
      let symbol = this.getChecker().getSymbolAtLocation(nameNode);
      if (symbol && symbol.flags & _typescript2.default.SymbolFlags.Alias) {
        symbol = this.getChecker().getAliasedSymbol(symbol);
      }
      decls = _optionalChain([symbol, 'optionalAccess', _209 => _209.declarations]);
    } catch (e4) {
      return goName;
    }
    if (!decls || decls.length === 0) {
      return goName;
    }
    const isAsyncDecl = decls.some((d) => (_typescript2.default.isMethodDeclaration(d) || _typescript2.default.isFunctionDeclaration(d)) && d.body !== void 0 && this.isAsyncFunction(d));
    return isAsyncDecl ? goName + this.asyncMethodSuffix : goName;
  }
  printMethodDefinition(node, identation) {
    let name = node.name.escapedText;
    name = this.printAsyncDeclarationName(node, this.transformMethodNameIfNeeded(name));
    const returnType = this.printFunctionType(node).trim();
    const parsedArgs = this.printMethodParameters(node);
    const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : " ";
    const structReceiver = `(${this.THIS_TOKEN} *${this.className})`;
    const returnSignature = returnType ? " " + returnType : "";
    const methodDef = this.getIden(identation) + methodToken + structReceiver + " " + name + "(" + parsedArgs + ")" + returnSignature;
    return this.printNodeCommentsIfAny(node, identation, methodDef);
  }
  printFunctionDefinition(node, identation) {
    let name = node.name.escapedText;
    name = this.printAsyncDeclarationName(node, this.transformMethodNameIfNeeded(name));
    const returnType = this.printFunctionType(node).trim();
    const parsedArgs = this.printMethodParameters(node);
    const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : " ";
    const returnSignature = returnType ? " " + returnType : "";
    const methodDef = this.getIden(identation) + methodToken + name + "(" + parsedArgs + ")" + returnSignature;
    return this.printNodeCommentsIfAny(node, identation, methodDef);
  }
  printMethodParameters(node) {
    const params = node.parameters.map((param) => this.printParameter(param));
    const hasOptionalParameter = params.some((p) => p === "optional");
    if (!hasOptionalParameter) {
      return params.join(", ");
    }
    const paramsWithOptional = params.filter((param) => param !== "optional");
    paramsWithOptional.push("optionalArgs ...any");
    return paramsWithOptional.join(", ");
  }
  printParameter(node, defaultValue = true) {
    const name = this.printNode(node.name, 0);
    const initializer = node.initializer;
    const type = this.printParameterType(node);
    if (defaultValue) {
      if (initializer) {
        return "optional";
      }
      return name + " " + type;
    }
    return name + " " + type;
  }
  printParameterType(node) {
    const typeText = this.getType(node);
    return "any";
    if (typeText === this.STRING_KEYWORD) {
      return "string";
    }
    if (typeText === this.NUMBER_KEYWORD) {
      return "float64";
    }
    if (typeText === this.BOOLEAN_KEYWORD) {
      return "bool";
    }
    return this.DEFAULT_PARAMETER_TYPE;
    if (typeText === void 0 || typeText === this.STRING_KEYWORD) {
      this.warn(node, node.getText(), "Parameter type not found, will default to: " + this.DEFAULT_PARAMETER_TYPE);
      return this.DEFAULT_PARAMETER_TYPE;
    }
    return typeText;
  }
  printFunctionType(node) {
    const typeText = this.getFunctionType(node);
    if (typeText === "void") {
      return "";
    }
    if (typeText === void 0 || typeText !== this.VOID_KEYWORD && typeText !== this.PROMISE_TYPE_KEYWORD) {
      let res = "";
      if (this.isAsyncFunction(node)) {
        res = `<-chan ${this.DEFAULT_RETURN_TYPE}`;
      } else {
        res = this.DEFAULT_RETURN_TYPE;
      }
      this.warn(node, node.name.getText(), "Function return type not found, will default to: " + res);
      return res;
    }
    if (typeText === this.PROMISE_TYPE_KEYWORD) {
      return `<-chan any`;
    }
    if (typeText && typeText.endsWith("[]")) {
      const core = typeText.substring(0, typeText.length - 2);
      const lastBracketPos = core.lastIndexOf("]");
      if (lastBracketPos !== -1) {
        return core.substring(0, lastBracketPos + 1) + "[]" + core.substring(lastBracketPos + 1);
      }
    }
    return typeText;
  }
  // true when the printed expression is a single call `Callee(...)` covering the
  // whole string, so its Go type is the callee's return type and nothing else
  isWholePrintedCall(value, open) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = open; i < value.length; i++) {
      const c = value[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (c === "\\") {
          escaped = true;
        } else if (c === '"') {
          inString = false;
        }
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === "(") {
        depth++;
        continue;
      }
      if (c === ")") {
        depth--;
        if (depth === 0) {
          return i === value.length - 1;
        }
      }
    }
    return false;
  }
  // the concrete Go type the initializer already produces, or undefined when the
  // printer cannot name it (GetValue, Ternary, Add, ... return any)
  goTypeOfInitializer(initializer, printedValue) {
    switch (_optionalChain([initializer, 'optionalAccess', _210 => _210.kind])) {
      case _typescript2.default.SyntaxKind.StringLiteral:
      case _typescript2.default.SyntaxKind.NoSubstitutionTemplateLiteral:
        return "string";
      case _typescript2.default.SyntaxKind.TrueKeyword:
      case _typescript2.default.SyntaxKind.FalseKeyword:
        return "bool";
      case _typescript2.default.SyntaxKind.ObjectLiteralExpression:
        return "map[string]any";
      case _typescript2.default.SyntaxKind.ArrayLiteralExpression:
        return "[]any";
      case _typescript2.default.SyntaxKind.PrefixUnaryExpression:
        return initializer.operator === _typescript2.default.SyntaxKind.ExclamationToken ? "bool" : void 0;
      case _typescript2.default.SyntaxKind.ParenthesizedExpression:
        return this.goTypeOfInitializer(initializer.expression, printedValue);
      case _typescript2.default.SyntaxKind.BinaryExpression: {
        const op = initializer.operatorToken.kind;
        if (op === _typescript2.default.SyntaxKind.BarBarToken || op === _typescript2.default.SyntaxKind.AmpersandAmpersandToken) {
          return "bool";
        }
        if (op === _typescript2.default.SyntaxKind.EqualsEqualsToken || op === _typescript2.default.SyntaxKind.EqualsEqualsEqualsToken || op === _typescript2.default.SyntaxKind.ExclamationEqualsToken || op === _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken || ORDERED_COMPARISON_OPERATORS[op] !== void 0) {
          return "bool";
        }
        break;
      }
    }
    let value = printedValue.trim();
    while (value.startsWith("(") && this.isWholePrintedCall(value, 0)) {
      value = value.substring(1, value.length - 1).trim();
    }
    const open = value.indexOf("(");
    if (value.startsWith("func() bool {") && value.endsWith("}()")) {
      return "bool";
    }
    if (open <= 0 || !this.isWholePrintedCall(value, open)) {
      return void 0;
    }
    const callee = value.substring(0, open);
    if (!/^[A-Za-z_][\w.]*$/.test(callee)) {
      return void 0;
    }
    return GO_HELPER_RETURN_TYPES[callee];
  }
  // strips the wrapping parentheses the source (or an operand) printed around a
  // whole expression, so the inner text can be classified
  goUnwrapPrintedParens(printedText) {
    let value = (_nullishCoalesce(printedText, () => ( ""))).trim();
    while (value.startsWith("(") && this.isWholePrintedCall(value, 0)) {
      value = value.substring(1, value.length - 1).trim();
    }
    return value;
  }
  // the concrete Go type of a `var x T = <init>` local, undefined for `any`
  goLocalStaticType(node) {
    const declaration = _optionalChain([this, 'access', _211 => _211.getChecker, 'call', _212 => _212(), 'access', _213 => _213.getSymbolAtLocation, 'call', _214 => _214(node), 'optionalAccess', _215 => _215.valueDeclaration]);
    if (_optionalChain([declaration, 'optionalAccess', _216 => _216.kind]) !== _typescript2.default.SyntaxKind.VariableDeclaration || declaration.initializer === void 0) {
      return void 0;
    }
    if (_optionalChain([declaration, 'access', _217 => _217.parent, 'optionalAccess', _218 => _218.parent, 'optionalAccess', _219 => _219.kind]) !== _typescript2.default.SyntaxKind.FirstStatement) {
      return void 0;
    }
    if (this.goLocalTypeResolution.has(declaration)) {
      return void 0;
    }
    this.goLocalTypeResolution.add(declaration);
    try {
      return this.getGoLocalType(declaration, this.printNode(declaration.initializer, 0));
    } finally {
      this.goLocalTypeResolution.delete(declaration);
    }
  }
  // `this.<field>` read of a hand-written BaseExchange string field
  goStringFieldStaticType(node, printedText) {
    const match = /^this\.([A-Za-z_]\w*)$/.exec(this.goUnwrapPrintedParens(printedText));
    if (match === null || GO_STRING_FIELD_NAMES.indexOf(match[1]) < 0) {
      return void 0;
    }
    return this.getChecker().getTypeAtLocation(node).flags === _typescript2.default.TypeFlags.String ? "string" : void 0;
  }
  // Go static type of an operand's printed form: 'string', 'int', 'int64' or
  // 'const-int' (untyped integer literal). undefined when the printer cannot name
  // it — a nilable/`any` operand keeps the helper call.
  goOperandStaticType(node, printedText) {
    switch (_optionalChain([node, 'optionalAccess', _220 => _220.kind])) {
      case _typescript2.default.SyntaxKind.StringLiteral:
      case _typescript2.default.SyntaxKind.NoSubstitutionTemplateLiteral:
        return "string";
      case _typescript2.default.SyntaxKind.NumericLiteral:
        return /^[0-9]+$/.test(node.text) ? "const-int" : void 0;
      case _typescript2.default.SyntaxKind.ParenthesizedExpression:
        return this.goOperandStaticType(node.expression, this.goUnwrapPrintedParens(printedText));
      case _typescript2.default.SyntaxKind.BinaryExpression:
        return _optionalChain([this, 'access', _221 => _221.goNativeArithmetic, 'call', _222 => _222(node), 'optionalAccess', _223 => _223.goType]);
      case _typescript2.default.SyntaxKind.Identifier:
        return this.goLocalStaticType(node);
      case _typescript2.default.SyntaxKind.PropertyAccessExpression:
        return _nullishCoalesce(this.goStringFieldStaticType(node, printedText), () => ( this.goStringCallStaticType(node, printedText)));
    }
    return this.goStringCallStaticType(node, printedText);
  }
  // the Go type the printed expression already produces; '*string' / '*int64'
  // helpers box a nilable pointer, so those keep the helper call as well
  goStringCallStaticType(node, printedText) {
    if (GO_ANY_BOX_CALLS.indexOf(this.goPrintedCallee(printedText)) >= 0) {
      return void 0;
    }
    const goType = this.goTypeOfInitializer(node, printedText);
    return "string" === goType || "int" === goType || "int64" === goType ? goType : void 0;
  }
  isNonZeroIntegerLiteral(node) {
    if (_optionalChain([node, 'optionalAccess', _224 => _224.kind]) === _typescript2.default.SyntaxKind.ParenthesizedExpression) {
      return this.isNonZeroIntegerLiteral(node.expression);
    }
    return _optionalChain([node, 'optionalAccess', _225 => _225.kind]) === _typescript2.default.SyntaxKind.NumericLiteral && /^[1-9][0-9]*$/.test(node.text);
  }
  // The bare Go operator must yield the same type the runtime helper returns for
  // the same operands (go/v4/exchange_helpers.go): Add keeps int/int64, while
  // Subtract/Multiply/Divide collapse every integer result to int64 and Mod is
  // float-based, so only the rows below are equivalent.
  goNativeIntResultType(op, leftType, rightType, rightNode) {
    let operands = void 0;
    if (leftType === "int64" && (rightType === "int64" || rightType === "const-int")) {
      operands = "int64";
    } else if (leftType === "const-int" && rightType === "int64") {
      operands = "int64";
    } else if (leftType === "int" && (rightType === "int" || rightType === "const-int")) {
      operands = "int";
    } else if (leftType === "const-int" && (rightType === "int" || rightType === "const-int")) {
      operands = "int";
    }
    if (operands === void 0 || op === _typescript2.default.SyntaxKind.PercentToken) {
      return void 0;
    }
    if (op === _typescript2.default.SyntaxKind.SlashToken && !this.isNonZeroIntegerLiteral(rightNode)) {
      return void 0;
    }
    if (op === _typescript2.default.SyntaxKind.PlusToken) {
      return operands === "int64" ? "int64" : "int";
    }
    return operands === "int64" ? "int64" : void 0;
  }
  // an operand that is itself a bare operator expression needs parens under a
  // tighter parent operator; a whole helper call is already delimited
  goNativeOperandText(node, printedText) {
    const text = printedText.trim();
    if (_optionalChain([node, 'optionalAccess', _226 => _226.kind]) !== _typescript2.default.SyntaxKind.BinaryExpression || text.startsWith("(")) {
      return text;
    }
    const open = text.indexOf("(");
    if (open > 0 && this.isWholePrintedCall(text, open)) {
      return text;
    }
    return this.goOperandStaticType(node, text) === "string" ? text : "(" + text + ")";
  }
  // `Add(a, b)` & co. become the Go operator when both printed operands already
  // hold a concrete Go type the helper would return unchanged; undefined keeps the
  // helper call (nil branches, `any` boxes, strings passed to Subtract, ...).
  goNativeArithmetic(node, leftText = void 0, rightText = void 0) {
    const op = node.operatorToken.kind;
    if (GO_ARITHMETIC_KINDS.indexOf(op) < 0) {
      return void 0;
    }
    leftText = _nullishCoalesce(leftText, () => ( this.printNode(node.left, 0)));
    rightText = _nullishCoalesce(rightText, () => ( this.printNode(node.right, 0)));
    const leftType = this.goOperandStaticType(node.left, leftText);
    const rightType = this.goOperandStaticType(node.right, rightText);
    if (leftType === void 0 || rightType === void 0) {
      return void 0;
    }
    if (leftType === "string" || rightType === "string") {
      if (leftType !== "string" || rightType !== "string" || op !== _typescript2.default.SyntaxKind.PlusToken) {
        return void 0;
      }
      return { "goType": "string", "text": this.goNativeBinaryText(node, "+", leftText, rightText) };
    }
    const goType = this.goNativeIntResultType(op, leftType, rightType, node.right);
    if (goType === void 0) {
      return void 0;
    }
    return { goType, "text": this.goNativeBinaryText(node, this.SupportedKindNames[op], leftText, rightText) };
  }
  // the operator line gofmt prints for a natively emitted arithmetic expression: the
  // blanks follow go/printer's cutoff at the current depth, and a binary operand is
  // re-printed at the expression's own depth (a same-precedence left operand, or the
  // parentheses the printer wraps it in, which undo the one level the operand adds)
  goNativeBinaryText(node, symbol, leftText, rightText) {
    const operandText = (operand, printed) => {
      const isBinary = _optionalChain([operand, 'optionalAccess', _227 => _227.kind]) === _typescript2.default.SyntaxKind.BinaryExpression;
      const text = isBinary ? this.goWithExprDepth(this.goExprDepth, () => this.printNode(operand, 0)) : printed;
      return this.goNativeOperandText(operand, text);
    };
    const left = operandText(node.left, leftText);
    const right = operandText(node.right, rightText);
    const separator = this.goBinarySeparator(symbol, right, node.left, node.right);
    return left + separator + symbol + separator + right;
  }
  // `x += y` prints `x = Add(x, y)`; the compound operator is equivalent while
  // both sides hold a concrete Go type that can never make the helper return nil
  goNativeCompoundAssignment(op, leftNode, leftText, rightNode, rightText) {
    const leftType = this.goOperandStaticType(leftNode, leftText);
    const rightType = this.goOperandStaticType(rightNode, rightText);
    if (leftType === void 0 || rightType === void 0) {
      return void 0;
    }
    const isAdd = op === _typescript2.default.SyntaxKind.PlusEqualsToken;
    const isSubtract = op === _typescript2.default.SyntaxKind.MinusEqualsToken;
    if (!isAdd && !isSubtract) {
      return void 0;
    }
    if (leftType === "string" && isAdd && rightType === "string") {
      return `${leftText.trim()} += ${rightText.trim()}`;
    }
    if (leftType !== "int64") {
      return void 0;
    }
    if (isAdd && (rightType === "int64" || rightType === "const-int")) {
      return `${leftText.trim()} += ${rightText.trim()}`;
    }
    if (isSubtract && (rightType === "int64" || rightType === "const-int")) {
      return `${leftText.trim()} -= ${rightText.trim()}`;
    }
    return void 0;
  }
  goEnclosingFunction(node) {
    let current = _optionalChain([node, 'optionalAccess', _228 => _228.parent]);
    while (current) {
      switch (current.kind) {
        case _typescript2.default.SyntaxKind.MethodDeclaration:
        case _typescript2.default.SyntaxKind.FunctionDeclaration:
        case _typescript2.default.SyntaxKind.FunctionExpression:
        case _typescript2.default.SyntaxKind.ArrowFunction:
        case _typescript2.default.SyntaxKind.Constructor:
        case _typescript2.default.SyntaxKind.SourceFile:
          return current;
      }
      current = current.parent;
    }
    return void 0;
  }
  // a transpiled parameter or local can literally be named `string`, which would
  // turn `var x string = ...` into a reference to that value instead of the type
  goTypeNameIsShadowed(scope, goType) {
    const names = _nullishCoalesce(goType.match(/[A-Za-z_]\w*/g), () => ( []));
    const relevant = names.filter((n) => GO_TYPE_NAMES.indexOf(n) >= 0);
    if (relevant.length === 0 || scope === void 0) {
      return false;
    }
    let shadowed = false;
    const visit = (n) => {
      if (shadowed) {
        return;
      }
      const isBinding = n.kind === _typescript2.default.SyntaxKind.Parameter || n.kind === _typescript2.default.SyntaxKind.VariableDeclaration;
      if (isBinding && _optionalChain([n, 'access', _229 => _229.name, 'optionalAccess', _230 => _230.kind]) === _typescript2.default.SyntaxKind.Identifier) {
        if (relevant.indexOf(n.name.escapedText) >= 0) {
          shadowed = true;
          return;
        }
      }
      _typescript2.default.forEachChild(n, visit);
    };
    _typescript2.default.forEachChild(scope, visit);
    return shadowed;
  }
  // reject the refinement when something downstream needs the local to stay `any`:
  // `x.push(v)` prints `AppendToArray(&x, v)` (a *T is not a *any) and a later
  // assignment of a value with another concrete type would stop compiling
  goLocalIsSafeToType(scope, declaration, varName, goType) {
    if (scope === void 0) {
      return false;
    }
    let safe = true;
    const visit = (n) => {
      if (!safe) {
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.Identifier && n.escapedText === varName && n !== declaration.name) {
        const parent = n.parent;
        if (_optionalChain([parent, 'optionalAccess', _231 => _231.kind]) === _typescript2.default.SyntaxKind.PropertyAccessExpression && parent.expression === n && _optionalChain([parent, 'access', _232 => _232.name, 'optionalAccess', _233 => _233.escapedText]) === "push") {
          safe = false;
          return;
        }
        if (_optionalChain([parent, 'optionalAccess', _234 => _234.kind]) === _typescript2.default.SyntaxKind.VariableDeclaration && parent.name === n) {
          return;
        }
        if (_optionalChain([parent, 'optionalAccess', _235 => _235.kind]) === _typescript2.default.SyntaxKind.PostfixUnaryExpression || _optionalChain([parent, 'optionalAccess', _236 => _236.kind]) === _typescript2.default.SyntaxKind.PrefixUnaryExpression) {
          const op = parent.operator;
          if (op === _typescript2.default.SyntaxKind.PlusPlusToken || op === _typescript2.default.SyntaxKind.MinusMinusToken) {
            safe = false;
            return;
          }
        }
        if (_optionalChain([parent, 'optionalAccess', _237 => _237.kind]) === _typescript2.default.SyntaxKind.SpreadElement) {
          safe = false;
          return;
        }
        if (_optionalChain([parent, 'optionalAccess', _238 => _238.kind]) === _typescript2.default.SyntaxKind.ArrayLiteralExpression && _optionalChain([parent, 'access', _239 => _239.parent, 'optionalAccess', _240 => _240.kind]) === _typescript2.default.SyntaxKind.BinaryExpression && parent.parent.left === parent && parent.parent.operatorToken.kind === _typescript2.default.SyntaxKind.EqualsToken) {
          safe = false;
          return;
        }
        if (_optionalChain([parent, 'optionalAccess', _241 => _241.kind]) === _typescript2.default.SyntaxKind.BinaryExpression && parent.left === n) {
          const op = parent.operatorToken.kind;
          if (op === _typescript2.default.SyntaxKind.EqualsToken) {
            if (this.goTypeOfInitializer(parent.right, this.printNode(parent.right, 0)) !== goType) {
              safe = false;
              return;
            }
          } else if (op >= _typescript2.default.SyntaxKind.FirstCompoundAssignment && op <= _typescript2.default.SyntaxKind.LastCompoundAssignment) {
            safe = false;
            return;
          }
        }
      }
      _typescript2.default.forEachChild(n, visit);
    };
    _typescript2.default.forEachChild(scope, visit);
    return safe;
  }
  getGoLocalType(declaration, parsedValue) {
    const goType = this.goTypeOfInitializer(declaration.initializer, parsedValue);
    if (goType === void 0) {
      return "any";
    }
    const sourceName = _optionalChain([declaration, 'access', _242 => _242.name, 'optionalAccess', _243 => _243.escapedText]);
    if (sourceName === void 0) {
      return "any";
    }
    const scope = this.goEnclosingFunction(declaration);
    if (this.goTypeNameIsShadowed(scope, goType) || !this.goLocalIsSafeToType(scope, declaration, sourceName, goType)) {
      return "any";
    }
    return goType;
  }
  printVariableDeclarationList(node, identation) {
    const declaration = node.declarations[0];
    if (_optionalChain([declaration, 'optionalAccess', _244 => _244.name, 'access', _245 => _245.kind]) === _typescript2.default.SyntaxKind.ArrayBindingPattern) {
      const arrayBindingPattern = declaration.name;
      const arrayBindingPatternElements = arrayBindingPattern.elements;
      const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e.name, 0));
      const syntheticName = parsedArrayBindingElements.join("") + "Variable";
      let arrayBindingStatement = `${this.getIden(identation)}${syntheticName} := ${this.printNode(declaration.initializer, 0)}
`;
      parsedArrayBindingElements.forEach((e, index) => {
        const statement = this.getIden(identation) + `${e} := GetValue(${syntheticName}, ${index})`;
        if (index < parsedArrayBindingElements.length - 1) {
          arrayBindingStatement += statement + "\n";
        } else {
          arrayBindingStatement += statement;
        }
      });
      return arrayBindingStatement;
    }
    if (_optionalChain([declaration, 'optionalAccess', _246 => _246.initializer, 'optionalAccess', _247 => _247.kind]) === _typescript2.default.SyntaxKind.AwaitExpression) {
      const parsedName = this.printNode(declaration.name, 0);
      const parsedInitializer = this.printNode(declaration.initializer, identation);
      return `
${this.getIden(identation)}${parsedName} := ${parsedInitializer}
${this.getIden(identation)}PanicOnError(${parsedName})`;
    }
    const isNew = declaration.initializer && declaration.initializer.kind === _typescript2.default.SyntaxKind.NewExpression;
    const parsedValue = declaration.initializer ? this.printNode(declaration.initializer, identation) : this.NULL_TOKEN;
    if (parsedValue === this.UNDEFINED_TOKEN) {
      return this.getIden(identation) + "var " + this.printNode(declaration.name) + " any = " + parsedValue;
    }
    if (_optionalChain([node, 'optionalAccess', _248 => _248.parent, 'optionalAccess', _249 => _249.kind]) === _typescript2.default.SyntaxKind.FirstStatement) {
      if (isNew) {
        return this.getIden(identation) + this.printNode(declaration.name) + " := " + parsedValue;
      }
      const varName = this.printNode(declaration.name);
      const declaredType = this.getGoLocalType(declaration, parsedValue);
      const stm = this.getIden(identation) + "var " + varName + " " + declaredType + " = " + parsedValue.trimStart();
      if (parsedValue.startsWith("<-this.callInternal(")) {
        return `
${stm}
${this.getIden(identation)}PanicOnError(${varName})`;
      }
      return stm;
    }
    return this.getIden(identation) + this.printNode(declaration.name) + " := " + parsedValue.trim();
  }
  // printObjectLiteralExpression(node, identation) {
  //     const objectCreation = 'make(map[string]any) {';
  //     let formattedObjectBody = '{}';
  //     if (node.properties?.length > 0) {
  //         const objectBody = this.printObjectLiteralBody(node, identation);
  //         formattedObjectBody = objectBody ? "\n" + objectBody + "\n" + this.getIden(identation) : objectBody;
  //     }
  //     // return  this.OBJECT_OPENING + formattedObjectBody + this.OBJECT_CLOSING;
  //     return objectCreation + formattedObjectBody;
  // }
  // printObjectLiteralBody(node, identation) {
  //     let objectName = node.parent?.name?.escapedText;
  //     if (objectName === undefined) {
  //         objectName = "object";
  //     }
  //     const body =  node.properties.map((p) => `${this.getIden(identation)}${objectName}["${node.properties[0].name.text}"] = ${p.initializer.text}` ).join("\n");
  //     return body;
  // }
  // F09 — gofmt aligns the key/value columns inside multi-line composite literals.
  //
  // go/printer's exprList prints a single-line `key: value` entry as `key:` + vtab, so
  // every consecutive single-line entry of a literal body lands in one text/tabwriter
  // column block: the value starts after the widest key cell of that block (`"key":`,
  // the key plus its colon) and one space of padding. An entry whose value spans lines
  // carries no vtab cell, so it ends the block on both sides, exactly like a blank line
  // does. exprList also writes a formfeed — turned into a plain newline by the trimmer,
  // so it never shows up in the output — before an entry that opens a new alignment
  // section: that happens when the entry or its predecessor does not fit on a single
  // line, and when the key size ratio against the geometric mean of the previous key
  // sizes of the section reaches r = 2.5 (or drops to 1/r) while at least one of the
  // two keys is larger than smallSize = 40 bytes; keys of at most 40 bytes always keep
  // the section aligned. A trailing comment is one more tabwriter cell, so comments
  // line up after the widest `value,` cell of the run of consecutive commented entries.
  printObjectLiteralBody(node, identation) {
    const previousLevel = this.goStatementLevel;
    this.goStatementLevel = identation + 1;
    try {
      const entries = node.properties.map((p) => this.goWithExprDepth(1, () => this.printNode(p, identation + 1)));
      return this.alignGoCompositeEntries(entries).join("\n");
    } finally {
      this.goStatementLevel = previousLevel;
    }
  }
  // Applies the gofmt column alignment to already-printed `key: value` entries (the
  // entries must not carry the separating comma). Reused by the hand-written composite
  // literals in ccxt's build/goTranspiler.ts, which do not go through this printer.
  alignGoCompositeEntries(entries) {
    const parsedEntries = entries.map((entry) => this.parseGoCompositeEntry(entry));
    const paddings = this.getGoCompositePaddings(parsedEntries);
    return entries.map((entry, index) => this.renderGoCompositeEntry(entry, parsedEntries[index], paddings[index]));
  }
  // `        "key": value, // comment` -> the pieces gofmt's tabwriter aligns.
  // Returns undefined for anything that is not a plain `key: value` entry (a spread, a
  // method, a computed key): the caller then leaves that entry alone and ends the block.
  parseGoCompositeEntry(entry) {
    const newlineIndex = entry.indexOf("\n");
    const firstLine = newlineIndex === -1 ? entry : entry.slice(0, newlineIndex);
    const keyMatch = /^([ \t]*)("(?:[^"\\]|\\.)*"): /.exec(firstLine);
    if (keyMatch === null) {
      return void 0;
    }
    const singleLine = newlineIndex === -1;
    const tail = singleLine ? entry.slice(keyMatch[0].length) : entry.slice(entry.lastIndexOf("\n") + 1);
    const commentIndex = this.findGoTrailingCommentStart(tail);
    return {
      "indent": keyMatch[1],
      "key": keyMatch[2],
      // nodeSize() measures the printed key; a value that spans lines gets size 0
      "size": singleLine ? this.getGoByteLength(keyMatch[2]) : 0,
      "singleLine": singleLine,
      "value": singleLine ? (commentIndex === -1 ? tail : tail.slice(0, commentIndex)).trimEnd() : void 0,
      "comment": commentIndex === -1 ? void 0 : tail.slice(commentIndex).trimEnd()
    };
  }
  // Index of the trailing comment of a printed line, or -1. `//` or `/*` inside a string
  // or a rune literal (e.g. a "https://…" value) is not a comment.
  findGoTrailingCommentStart(line) {
    let quote;
    for (let index = 0; index < line.length; ++index) {
      const character = line[index];
      if (quote !== void 0) {
        if (character === "\\" && quote !== "`") {
          index += 1;
        } else if (character === quote) {
          quote = void 0;
        }
        continue;
      }
      if (character === '"' || character === "`" || character === "'") {
        quote = character;
      } else if (character === "/" && (line[index + 1] === "/" || line[index + 1] === "*")) {
        return index;
      }
    }
    return -1;
  }
  // {key, comment} space counts per entry, i.e. the padding gofmt's tabwriter inserts.
  // Only entries that are part of a block get a padding; every other entry is rendered
  // as printed (gofmt leaves single-line and multi-line sections untouched).
  getGoCompositePaddings(parsedEntries) {
    const smallSize = 40;
    const ratio = 2.5;
    const paddings = parsedEntries.map(() => void 0);
    let block = [];
    let previousSize = 0;
    let size = 0;
    let lnSum = 0;
    let count = 0;
    const flushBlock = () => {
      if (block.length === 0) {
        return;
      }
      let keyWidth = 1;
      for (const index of block) {
        keyWidth = Math.max(keyWidth, this.getGoRuneLength(parsedEntries[index].key) + 2);
      }
      for (const index of block) {
        paddings[index] = { "key": keyWidth - this.getGoRuneLength(parsedEntries[index].key) - 1, "comment": 1 };
      }
      let run = [];
      const flushRun = () => {
        if (run.length === 0) {
          return;
        }
        let runWidth = 1;
        for (const index of run) {
          runWidth = Math.max(runWidth, this.getGoRuneLength(parsedEntries[index].value) + 2);
        }
        for (const index of run) {
          paddings[index].comment = runWidth - this.getGoRuneLength(parsedEntries[index].value) - 1;
        }
        run = [];
      };
      for (const index of block) {
        if (parsedEntries[index].comment !== void 0) {
          run.push(index);
        } else {
          flushRun();
        }
      }
      flushRun();
      block = [];
    };
    for (let index = 0; index < parsedEntries.length; ++index) {
      const entry = parsedEntries[index];
      previousSize = size;
      size = entry !== void 0 ? entry.size : 0;
      let sectionBreak = true;
      if (previousSize > 0 && size > 0) {
        if (count === 0 || previousSize <= smallSize && size <= smallSize) {
          sectionBreak = false;
        } else {
          const geomean = Math.exp(lnSum / count);
          const sizeRatio = size / geomean;
          sectionBreak = ratio * sizeRatio <= 1 || ratio <= sizeRatio;
        }
      }
      const alignable = entry !== void 0 && entry.singleLine;
      if (index > 0 && sectionBreak) {
        lnSum = 0;
        count = 0;
      }
      if (!alignable || sectionBreak) {
        flushBlock();
      }
      if (alignable) {
        block.push(index);
      }
      if (size > 0) {
        lnSum += Math.log(size);
        count += 1;
      }
    }
    flushBlock();
    return paddings;
  }
  renderGoCompositeEntry(entry, parsed, padding) {
    if (parsed === void 0 || !parsed.singleLine || padding === void 0) {
      return this.appendGoTrailingComma(entry);
    }
    const comment = parsed.comment === void 0 ? "" : " ".repeat(padding.comment) + parsed.comment;
    return parsed.indent + parsed.key + ":" + " ".repeat(padding.key) + parsed.value + "," + comment;
  }
  // gofmt prints the comma of an entry before its trailing comment (`value, // comment`),
  // the entry text carries the comment last, so move the comma in front of it
  appendGoTrailingComma(entry) {
    const newlineIndex = entry.lastIndexOf("\n");
    const lastLine = newlineIndex === -1 ? entry : entry.slice(newlineIndex + 1);
    const commentIndex = this.findGoTrailingCommentStart(lastLine);
    if (commentIndex === -1) {
      return entry + ",";
    }
    const offset = entry.length - lastLine.length + commentIndex;
    return entry.slice(0, offset).trimEnd() + ", " + entry.slice(offset).trimEnd();
  }
  // text/tabwriter sizes cells in runes, go/printer's nodeSize counts bytes
  getGoRuneLength(text) {
    return [...text].length;
  }
  getGoByteLength(text) {
    let length = 0;
    for (const character of text) {
      const codePoint = character.codePointAt(0);
      length += codePoint < 128 ? 1 : codePoint < 2048 ? 2 : codePoint < 65536 ? 3 : 4;
    }
    return length;
  }
  printConstructorDeclaration(node, identation) {
    const classNode = node.parent;
    const className = this.printNode(classNode.name, 0);
    const args = this.printMethodParameters(node);
    const constructorBody = this.printFunctionBody(node, identation);
    let superCallParams = "";
    let hasSuperCall = false;
    _optionalChain([node, 'access', _250 => _250.body, 'optionalAccess', _251 => _251.statements, 'access', _252 => _252.forEach, 'call', _253 => _253((statement) => {
      if (_typescript2.default.isExpressionStatement(statement)) {
        const expression = statement.expression;
        if (_typescript2.default.isCallExpression(expression)) {
          const expressionText = expression.expression.getText().trim();
          if (expressionText === "super") {
            hasSuperCall = true;
            superCallParams = expression.arguments.map((a) => {
              return this.printNode(a, identation).trim();
            }).join(", ");
          }
        }
      }
    })]);
    if (hasSuperCall) {
      return this.getIden(identation) + className + `(${args}) : ${this.SUPER_CALL_TOKEN}(${superCallParams})` + constructorBody;
    }
    return this.getIden(identation) + className + "(" + args + ")" + constructorBody;
  }
  printThisElementAccesssIfNeeded(node, identation) {
    const isAsync = true;
    const elementAccess = node.expression;
    if (_optionalChain([elementAccess, 'optionalAccess', _254 => _254.kind]) === _typescript2.default.SyntaxKind.ElementAccessExpression) {
      if (_optionalChain([elementAccess, 'optionalAccess', _255 => _255.expression, 'optionalAccess', _256 => _256.kind]) === _typescript2.default.SyntaxKind.ThisKeyword) {
        let parsedArg = _optionalChain([node, 'access', _257 => _257.arguments, 'optionalAccess', _258 => _258.length]) > 0 ? this.printNode(node.arguments[0], identation).trimStart() : "";
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
    const elementAccess = node.expression;
    if (_optionalChain([elementAccess, 'optionalAccess', _259 => _259.kind]) === _typescript2.default.SyntaxKind.ElementAccessExpression) {
      const argumentDepth = this.goExprDepth + (_optionalChain([node, 'access', _260 => _260.arguments, 'optionalAccess', _261 => _261.length]) > 0 ? 1 : 0);
      const parsedArg = _optionalChain([node, 'access', _262 => _262.arguments, 'optionalAccess', _263 => _263.length]) > 0 ? node.arguments.map((n) => this.goWithExprDepth(argumentDepth, () => this.printNode(n, identation).trimStart())).join(", ") : "";
      const propName = this.goWithExprDepth(argumentDepth, () => this.printNode(elementAccess.argumentExpression, 0));
      const argsArray = `${parsedArg}`;
      const open = this.DYNAMIC_CALL_OPEN;
      const statement = `${open}${propName}, ${argsArray})`;
      return statement;
    }
    return void 0;
  }
  printElementAccessExpressionExceptionIfAny(node) {
    const tsKind = _typescript2.default.SyntaxKind;
    if (node.expression.kind === tsKind.CallExpression) {
      const callExp = node.expression;
      const calleeText = callExp.expression.getText();
      if (calleeText.endsWith(".split") || calleeText.toLowerCase().includes("split")) {
        let splitCall = this.printNode(callExp, 0).trim();
        if (!splitCall.endsWith(")")) {
          splitCall += ")";
        }
        const idxArg = this.printNode(node.argumentExpression, 0);
        return `GetValue(${splitCall}, ${idxArg})`;
      }
    }
    return void 0;
  }
  printWrappedUnknownThisProperty(node, identation = 0) {
    const type = this.getChecker().getResolvedSignature(node);
    if (_optionalChain([type, 'optionalAccess', _264 => _264.declaration]) === void 0) {
      const argumentDepth = this.goExprDepth + (_optionalChain([node, 'access', _265 => _265.arguments, 'optionalAccess', _266 => _266.length]) > 0 ? 1 : 0);
      let parsedArguments = _optionalChain([node, 'access', _267 => _267.arguments, 'optionalAccess', _268 => _268.map, 'call', _269 => _269((a) => this.goWithExprDepth(argumentDepth, () => this.printNode(a, identation).trimStart())), 'access', _270 => _270.join, 'call', _271 => _271(", ")]);
      parsedArguments = parsedArguments ? parsedArguments : "";
      const propName = _optionalChain([node, 'access', _272 => _272.expression, 'optionalAccess', _273 => _273.name, 'access', _274 => _274.escapedText]);
      const argsArray = `${parsedArguments}`;
      const open = this.DYNAMIC_CALL_OPEN;
      const statement = `${open}"${propName}", ${argsArray})`;
      return statement;
    }
    return void 0;
  }
  transformMethodNameIfNeeded(name) {
    const res = this.unCamelCaseIfNeeded(name);
    return this.capitalize(res);
  }
  transformCallExpressionName(name, nameNode = void 0) {
    return this.applyAsyncSuffixToCallee(nameNode, this.capitalize(name));
  }
  transformPropertyAccessExpressionName(name, nameNode = void 0) {
    return this.applyAsyncSuffixToCallee(nameNode, this.capitalize(name));
  }
  printOutOfOrderCallExpressionIfAny(node, identation) {
    if (node.expression.kind === _typescript2.default.SyntaxKind.PropertyAccessExpression) {
      const args = node.arguments;
      if (node.expression.expression.kind === _typescript2.default.SyntaxKind.ThisKeyword) {
        const methodName = this.printNode(node.expression.name, 0);
        if (this.wrapThisCalls || this.wrapCallMethods.includes(methodName)) {
          let argsParsed = "";
          if (args.length > 0) {
            argsParsed = args.map((a) => this.printNode(a, 0)).join(", ");
            return `<-this.callInternal("${methodName}", ${argsParsed})`;
          }
          return `<-this.callInternal("${methodName}")`;
        }
      }
      const expressionText = node.expression.getText().trim();
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
            return `MathPow(${parsedArg1}, ${parsedArg2})`;
        }
      }
      const leftSide = _optionalChain([node, 'access', _275 => _275.expression, 'optionalAccess', _276 => _276.expression]);
      const leftSideText = leftSide ? this.printNode(leftSide, 0) : void 0;
      if (leftSideText === this.THIS_TOKEN || leftSide.getFullText().indexOf("(this as any)") > -1) {
        const res = this.printWrappedUnknownThisProperty(node, identation);
        if (res) {
          return res;
        }
      }
    }
    if (node.expression.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
      return this.printDynamicCall(node, identation);
    }
    return void 0;
  }
  handleTypeOfInsideBinaryExpression(node, identation) {
    const left = node.left;
    const right = node.right.text;
    const op = node.operatorToken.kind;
    const expression = left.expression;
    const isDifferentOperator = op === _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken || op === _typescript2.default.SyntaxKind.ExclamationEqualsToken;
    const notOperator = isDifferentOperator ? this.NOT_TOKEN : "";
    const target = this.printNode(expression, 0);
    switch (right) {
      case "string":
        return notOperator + `IsString(${target})`;
      case "number":
        return notOperator + `IsNumber(${target})`;
      case "boolean":
        return notOperator + `IsBool(${target})`;
      case "object":
        return notOperator + `IsObject(${target})`;
      case "function":
        return notOperator + `IsFunction(${target})`;
    }
    return void 0;
  }
  printCustomBinaryExpressionIfAny(node, identation) {
    const left = node.left;
    const right = node.right;
    const op = node.operatorToken.kind;
    if (op === _typescript2.default.SyntaxKind.EqualsToken && left.kind === _typescript2.default.SyntaxKind.ArrayLiteralExpression) {
      const arrayBindingPatternElements = left.elements;
      const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e, 0));
      const syntheticName = parsedArrayBindingElements.join("") + "Variable";
      let arrayBindingStatement = `${syntheticName} := ${this.printNode(right, 0)}
`;
      parsedArrayBindingElements.forEach((e, index) => {
        const statement = this.getIden(identation) + `${e} = GetValue(${syntheticName}, ${index})`;
        if (index < parsedArrayBindingElements.length - 1) {
          arrayBindingStatement += statement + "\n";
        } else {
          arrayBindingStatement += statement;
        }
      });
      return arrayBindingStatement;
    }
    if (op === _typescript2.default.SyntaxKind.EqualsToken && left.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
      const keys = [];
      let baseExpr = null;
      let cur = left;
      while (_typescript2.default.isElementAccessExpression(cur)) {
        keys.unshift(cur.argumentExpression);
        const expr = cur.expression;
        if (!_typescript2.default.isElementAccessExpression(expr)) {
          baseExpr = expr;
          break;
        }
        cur = expr;
      }
      const containerStr = this.printNode(baseExpr, 0);
      const keyStrs = keys.map((k) => this.printNode(k, 0));
      let acc = containerStr;
      for (let i = 0; i < keyStrs.length - 1; i++) {
        acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
      }
      const lastKey = keyStrs[keyStrs.length - 1];
      const rhs = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation)).trimStart();
      const nativeRhs = right.kind === _typescript2.default.SyntaxKind.BinaryExpression ? this.goWithExprDepth(this.goExprDepth, () => this.printNode(right, identation)).trimStart() : rhs;
      const native = keyStrs.length === 1 ? this.printNativeElementAssignment(baseExpr, containerStr, keys[0], lastKey, nativeRhs) : void 0;
      if (native !== void 0) {
        return native;
      }
      return `AddElementToObject(${acc}, ${lastKey}, ${rhs})`;
    }
    if (op === _typescript2.default.SyntaxKind.PlusEqualsToken && left.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
      const keys = [];
      let baseExpr = null;
      let cur = left;
      while (_typescript2.default.isElementAccessExpression(cur)) {
        keys.unshift(cur.argumentExpression);
        const expr = cur.expression;
        if (!_typescript2.default.isElementAccessExpression(expr)) {
          baseExpr = expr;
          break;
        }
        cur = expr;
      }
      const containerStr = this.printNode(baseExpr, 0);
      const keyStrs = keys.map((k) => this.printNode(k, 0));
      let acc = containerStr;
      for (let i = 0; i < keyStrs.length - 1; i++) {
        acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
      }
      const lastKey = keyStrs[keyStrs.length - 1];
      const rhs = this.printNode(right, 0);
      const currentValue = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${lastKey}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
      const native = keyStrs.length === 1 ? this.printNativeElementAssignment(baseExpr, containerStr, keys[0], lastKey, `Add(${containerStr}[${lastKey}], ${rhs})`) : void 0;
      if (native !== void 0) {
        return native;
      }
      const result = `AddElementToObject(${acc}, ${lastKey}, Add(${currentValue}, ${rhs}))`;
      return result;
    }
    if (left.kind === _typescript2.default.SyntaxKind.TypeOfExpression) {
      const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
      if (typeOfExpression) {
        return typeOfExpression;
      }
    }
    if (op === _typescript2.default.SyntaxKind.InKeyword) {
      const dictText = this.printNode(right, 0);
      const keyText = this.printNode(left, 0);
      const inlined = this.printInlineInOp(right, left, dictText, keyText);
      if (inlined !== void 0) {
        return inlined;
      }
      return `InOp(${dictText}, ${keyText})`;
    }
    if (op === _typescript2.default.SyntaxKind.PlusEqualsToken || op === _typescript2.default.SyntaxKind.MinusEqualsToken || op in this.binaryExpressionsWrappers) {
      const operandDepth = this.goExprDepth + 1;
      const leftText = this.goWithExprDepth(operandDepth, () => this.printNode(left, 0));
      const rightText = this.goWithExprDepth(operandDepth, () => this.printNode(right, 0));
      const nativeAssignment = this.goNativeCompoundAssignment(op, left, leftText, right, rightText);
      if (nativeAssignment !== void 0) {
        return nativeAssignment;
      }
      if (op === _typescript2.default.SyntaxKind.PlusEqualsToken) {
        return `${leftText} = Add(${leftText}, ${rightText})`;
      }
      if (op === _typescript2.default.SyntaxKind.MinusEqualsToken) {
        return `${leftText} = Subtract(${leftText}, ${rightText})`;
      }
      const isEquality = op === _typescript2.default.SyntaxKind.EqualsEqualsToken || op === _typescript2.default.SyntaxKind.EqualsEqualsEqualsToken;
      const isDifference = op === _typescript2.default.SyntaxKind.ExclamationEqualsToken || op === _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken;
      if (isEquality || isDifference) {
        const inlined = this.printInlineEquality(left, right, leftText, rightText, isEquality);
        if (inlined !== void 0) {
          return inlined;
        }
      }
      if (ORDERED_COMPARISON_OPERATORS[op] !== void 0) {
        const inlined = this.printInlineOrderedComparison(left, right, leftText, rightText, op);
        if (inlined !== void 0) {
          return inlined;
        }
      }
      const wrapper = this.binaryExpressionsWrappers[op];
      const open = wrapper[0];
      const close = wrapper[1];
      const nativeArithmetic = this.goNativeArithmetic(node, leftText, rightText);
      if (nativeArithmetic !== void 0) {
        return nativeArithmetic.text;
      }
      return `${open}${leftText}, ${rightText}${close}`;
    }
    return void 0;
  }
  // the scalar family the TypeScript type of an operand belongs to: 'string',
  // 'int', 'float', 'bool', 'nil' for the undefined/null literals, or undefined
  // when the type is any/unknown/a union of several families
  goScalarFamily(node) {
    if (_optionalChain([node, 'optionalAccess', _277 => _277.kind]) === _typescript2.default.SyntaxKind.Identifier && this.goDeclaredTypeOfIdentifier(node) === void 0) {
      let decl;
      try {
        decl = _optionalChain([this, 'access', _278 => _278.getChecker, 'call', _279 => _279(), 'access', _280 => _280.getSymbolAtLocation, 'call', _281 => _281(node), 'optionalAccess', _282 => _282.valueDeclaration]);
      } catch (e) {
        decl = void 0;
      }
      if (this.goAnyLocalHoldsPointer(decl)) {
        return void 0;
      }
    }
    let type;
    try {
      type = this.getChecker().getTypeAtLocation(node);
    } catch (e) {
      return void 0;
    }
    return this.goScalarFamilyOfType(type);
  }
  // the scalar family the TypeScript type of an operand belongs to, where a
  // `string | undefined` union still counts as 'string': the Go box holds that
  // scalar or nil, and both `x == nil` and `x == "lit"` are then the same
  // predicate as the helper. Numbers are excluded by the caller.
  goScalarFamilyWithNil(node) {
    let type;
    try {
      type = this.getChecker().getTypeAtLocation(node);
    } catch (e) {
      return void 0;
    }
    return this.goScalarFamilyOfType(type, true);
  }
  // the callee name of a printed call, e.g. `this.SafeDict(x, 0, {})` → `this.SafeDict`
  goPrintedCallee(printedValue) {
    let value = printedValue.trim();
    while (value.startsWith("(") && this.isWholePrintedCall(value, 0)) {
      value = value.substring(1, value.length - 1).trim();
    }
    const open = value.indexOf("(");
    if (open <= 0 || !this.isWholePrintedCall(value, open)) {
      return void 0;
    }
    const callee = value.substring(0, open);
    return /^[A-Za-z_][\w.]*$/.test(callee) ? callee : void 0;
  }
  // true when this expression prints to an interface (`any`) box: a parameter, a
  // local the printer left `any`, or one of the helpers whose Go signature returns
  // `any`. A *T / scalar local or call is not a box and keeps its own rule.
  goIsAnyBoxExpression(node, printedText) {
    if (_optionalChain([node, 'optionalAccess', _283 => _283.kind]) === _typescript2.default.SyntaxKind.Identifier) {
      let symbol;
      try {
        symbol = this.getChecker().getSymbolAtLocation(node);
      } catch (e) {
        return false;
      }
      const decl = _optionalChain([symbol, 'optionalAccess', _284 => _284.valueDeclaration]);
      const isBinding = _optionalChain([decl, 'optionalAccess', _285 => _285.kind]) === _typescript2.default.SyntaxKind.Parameter || _optionalChain([decl, 'optionalAccess', _286 => _286.kind]) === _typescript2.default.SyntaxKind.VariableDeclaration;
      if (!isBinding) {
        return false;
      }
      if (this.goDeclaredTypeOfIdentifier(node) !== void 0) {
        return false;
      }
      return !this.goAnyLocalHoldsPointer(decl);
    }
    if (_optionalChain([node, 'optionalAccess', _287 => _287.kind]) === _typescript2.default.SyntaxKind.CallExpression) {
      if (this.goTypeOfInitializer(node, printedText) !== void 0) {
        return false;
      }
      return GO_ANY_BOX_CALLS.indexOf(this.goPrintedCallee(printedText)) >= 0;
    }
    return false;
  }
  goAnyLocalHoldsPointer(decl) {
    if (_optionalChain([decl, 'optionalAccess', _288 => _288.kind]) !== _typescript2.default.SyntaxKind.VariableDeclaration || _optionalChain([decl, 'access', _289 => _289.name, 'optionalAccess', _290 => _290.kind]) !== _typescript2.default.SyntaxKind.Identifier) {
      return false;
    }
    if (this.goAnyLocalHoldsPointerCache.has(decl)) {
      return this.goAnyLocalHoldsPointerCache.get(decl);
    }
    const isPointerInit = (expr) => {
      while (_optionalChain([expr, 'optionalAccess', _291 => _291.kind]) === _typescript2.default.SyntaxKind.ParenthesizedExpression) {
        expr = expr.expression;
      }
      if (_optionalChain([expr, 'optionalAccess', _292 => _292.kind]) !== _typescript2.default.SyntaxKind.CallExpression) {
        return false;
      }
      const callee = expr.expression;
      if (_optionalChain([callee, 'optionalAccess', _293 => _293.kind]) !== _typescript2.default.SyntaxKind.PropertyAccessExpression || _optionalChain([callee, 'access', _294 => _294.expression, 'optionalAccess', _295 => _295.kind]) !== _typescript2.default.SyntaxKind.ThisKeyword) {
        return false;
      }
      const name = _optionalChain([callee, 'access', _296 => _296.name, 'optionalAccess', _297 => _297.escapedText]);
      if (typeof name !== "string" || name.length === 0) {
        return false;
      }
      const goType = GO_HELPER_RETURN_TYPES["this." + name.charAt(0).toUpperCase() + name.substring(1)];
      return typeof goType === "string" && goType.startsWith("*");
    };
    let holds = isPointerInit(decl.initializer);
    if (!holds) {
      const name = decl.name.escapedText;
      const scope = this.goEnclosingFunction(decl);
      const visit = (n) => {
        if (holds) {
          return;
        }
        if (n.kind === _typescript2.default.SyntaxKind.BinaryExpression && n.operatorToken.kind === _typescript2.default.SyntaxKind.EqualsToken && _optionalChain([n, 'access', _298 => _298.left, 'optionalAccess', _299 => _299.kind]) === _typescript2.default.SyntaxKind.Identifier && n.left.escapedText === name && isPointerInit(n.right)) {
          holds = true;
          return;
        }
        _typescript2.default.forEachChild(n, visit);
      };
      if (scope !== void 0) {
        _typescript2.default.forEachChild(scope, visit);
      }
    }
    this.goAnyLocalHoldsPointerCache.set(decl, holds);
    return holds;
  }
  goScalarFamilyOfType(type, allowNil = false) {
    if (type === void 0) {
      return void 0;
    }
    const alias = _optionalChain([type, 'access', _300 => _300.aliasSymbol, 'optionalAccess', _301 => _301.escapedName]);
    if (!allowNil) {
      switch (alias) {
        case "Str":
        case "Int":
        case "Num":
        case "Bool":
          return void 0;
      }
    }
    const flags = type.flags;
    if (flags & _typescript2.default.TypeFlags.Union) {
      const families = /* @__PURE__ */ new Set();
      for (const member of type.types) {
        const family = this.goScalarFamilyOfType(member, allowNil);
        if (family === void 0) {
          return void 0;
        }
        if (family === "nil") {
          if (allowNil) {
            continue;
          }
          return void 0;
        }
        families.add(family);
      }
      if (families.size !== 1) {
        return void 0;
      }
      return families.values().next().value;
    }
    if (flags & (_typescript2.default.TypeFlags.String | _typescript2.default.TypeFlags.StringLiteral)) {
      return "string";
    }
    if (flags & (_typescript2.default.TypeFlags.Number | _typescript2.default.TypeFlags.NumberLiteral)) {
      return "number";
    }
    if (flags & (_typescript2.default.TypeFlags.Boolean | _typescript2.default.TypeFlags.BooleanLiteral)) {
      return "bool";
    }
    if (flags & (_typescript2.default.TypeFlags.Undefined | _typescript2.default.TypeFlags.Null | _typescript2.default.TypeFlags.Void)) {
      return "nil";
    }
    return void 0;
  }
  goDeclaredTypeOfIdentifier(node) {
    if (_optionalChain([node, 'optionalAccess', _302 => _302.kind]) !== _typescript2.default.SyntaxKind.Identifier) {
      return void 0;
    }
    let symbol;
    try {
      symbol = this.getChecker().getSymbolAtLocation(node);
    } catch (e) {
      return void 0;
    }
    const decl = _optionalChain([symbol, 'optionalAccess', _303 => _303.valueDeclaration]);
    if (decl === void 0 || decl.kind !== _typescript2.default.SyntaxKind.VariableDeclaration) {
      return void 0;
    }
    if (decl.initializer === void 0 || _optionalChain([decl, 'access', _304 => _304.name, 'optionalAccess', _305 => _305.kind]) !== _typescript2.default.SyntaxKind.Identifier) {
      return void 0;
    }
    if (this.goDeclaredTypeCache.has(decl)) {
      return this.goDeclaredTypeCache.get(decl);
    }
    if (this.goDeclaredTypeInProgress.has(decl)) {
      return void 0;
    }
    this.goDeclaredTypeInProgress.add(decl);
    let goType;
    try {
      goType = this.getGoLocalType(decl, this.printNode(decl.initializer, 0));
    } finally {
      this.goDeclaredTypeInProgress.delete(decl);
    }
    const result = goType === "any" ? void 0 : goType;
    this.goDeclaredTypeCache.set(decl, result);
    return result;
  }
  // true when this identifier's Go type is a pointer we can deref (*string / *int64 / …)
  goIsPointerIdentifier(node) {
    const goType = this.goDeclaredTypeOfIdentifier(node);
    return typeof goType === "string" && goType.startsWith("*");
  }
  // the Go pointer type an *expression* evaluates to, or undefined. Covers both a
  // local declared `var x *string = …` and a direct `this.SafeString(...)` call,
  // whose Go signature returns a pointer even though TypeScript says `string`.
  goPointerTypeOfExpression(node, printedText) {
    const declared = this.goDeclaredTypeOfIdentifier(node);
    if (typeof declared === "string" && declared.startsWith("*")) {
      return declared;
    }
    if (_optionalChain([node, 'optionalAccess', _306 => _306.kind]) === _typescript2.default.SyntaxKind.CallExpression) {
      const goType = this.goTypeOfInitializer(node, printedText);
      if (typeof goType === "string" && goType.startsWith("*")) {
        return goType;
      }
    }
    return void 0;
  }
  // the concrete Go type a `x[k] = v` receiver is declared with, when the printer
  // can name it: a local it typed itself, or a whole call whose Go return type it
  // knows. Everything else is an `any` box, and indexing an `any` in Go needs a
  // type assertion, so those keep the runtime helper.
  goElementAssignmentContainerType(node, printedText) {
    const declared = this.goDeclaredTypeOfIdentifier(node);
    if (declared === "map[string]any" || declared === "[]any") {
      return declared;
    }
    if (_optionalChain([node, 'optionalAccess', _307 => _307.kind]) === _typescript2.default.SyntaxKind.CallExpression) {
      const known = this.goTypeOfInitializer(node, printedText);
      if (known === "map[string]any" || known === "[]any") {
        return known;
      }
    }
    return void 0;
  }
  // the printed key is a Go string when the printer knows it: a string literal, or
  // an identifier declared `string`. Params, GetValue(...) and string concatenation
  // all print as `any`, which Go refuses as a map key.
  goIsStringKeyExpression(node) {
    if (node.kind === _typescript2.default.SyntaxKind.StringLiteral || node.kind === _typescript2.default.SyntaxKind.NoSubstitutionTemplateLiteral) {
      return true;
    }
    return this.goDeclaredTypeOfIdentifier(node) === "string";
  }
  // `[]any` receivers only inline when the index is a literal the slice's own
  // literal initializer covers and nothing rebinds the local: the helper silently
  // ignores an out-of-range index, while Go panics on the assignment.
  goSliceIndexProvablyInRange(node, indexNode) {
    if (_optionalChain([node, 'optionalAccess', _308 => _308.kind]) !== _typescript2.default.SyntaxKind.Identifier || _optionalChain([indexNode, 'optionalAccess', _309 => _309.kind]) !== _typescript2.default.SyntaxKind.NumericLiteral) {
      return false;
    }
    const index = Number(indexNode.text);
    if (!Number.isInteger(index) || index < 0) {
      return false;
    }
    let symbol;
    try {
      symbol = this.getChecker().getSymbolAtLocation(node);
    } catch (e) {
      return false;
    }
    const decl = _optionalChain([symbol, 'optionalAccess', _310 => _310.valueDeclaration]);
    if (decl === void 0 || decl.kind !== _typescript2.default.SyntaxKind.VariableDeclaration || _optionalChain([decl, 'access', _311 => _311.name, 'optionalAccess', _312 => _312.kind]) !== _typescript2.default.SyntaxKind.Identifier) {
      return false;
    }
    const initializer = decl.initializer;
    if (_optionalChain([initializer, 'optionalAccess', _313 => _313.kind]) !== _typescript2.default.SyntaxKind.ArrayLiteralExpression) {
      return false;
    }
    if (initializer.elements.length <= index) {
      return false;
    }
    return !this.goLocalIsRebound(this.goEnclosingFunction(decl), decl.name);
  }
  // true when the local is rebound anywhere in its function; an element write
  // (`x[k] = v`) leaves the local itself bound, so only the slice header is at stake
  goLocalIsRebound(scope, nameNode) {
    if (scope === void 0) {
      return true;
    }
    const name = nameNode.escapedText;
    let rebound = false;
    const visit = (n) => {
      if (rebound) {
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.Identifier && n.escapedText === name && n !== nameNode) {
        if (this.goRebindingTargetOf(n) !== void 0) {
          rebound = true;
          return;
        }
      }
      _typescript2.default.forEachChild(n, visit);
    };
    visit(scope);
    return rebound;
  }
  // walks up from the identifier to the assignment it targets: `x = …` / `x += …` /
  // `[x, y] = …` / `for (x of …)` rebind the local, `x[k] = v` does not
  goRebindingTargetOf(identifier) {
    let node = identifier;
    let parent = node.parent;
    while (_optionalChain([parent, 'optionalAccess', _314 => _314.kind]) === _typescript2.default.SyntaxKind.ArrayLiteralExpression) {
      node = parent;
      parent = parent.parent;
    }
    if (_optionalChain([parent, 'optionalAccess', _315 => _315.kind]) === _typescript2.default.SyntaxKind.ForOfStatement && parent.initializer === node) {
      return parent;
    }
    if (_optionalChain([parent, 'optionalAccess', _316 => _316.kind]) === _typescript2.default.SyntaxKind.BinaryExpression && parent.left === node) {
      const op = parent.operatorToken.kind;
      if (op === _typescript2.default.SyntaxKind.EqualsToken || op >= _typescript2.default.SyntaxKind.FirstCompoundAssignment && op <= _typescript2.default.SyntaxKind.LastCompoundAssignment) {
        return parent;
      }
    }
    return void 0;
  }
  // native `container[key] = value` when the receiver's Go type is proved by the
  // printer, otherwise undefined and the caller keeps the runtime helper
  printNativeElementAssignment(containerNode, containerStr, keyNode, keyStr, valueStr) {
    const containerType = this.goElementAssignmentContainerType(containerNode, containerStr);
    if (containerType === "map[string]any") {
      if (!this.goIsStringKeyExpression(keyNode)) {
        return void 0;
      }
      return `${containerStr}[${keyStr}] = ${valueStr}`;
    }
    if (containerType === "[]any") {
      if (!this.goSliceIndexProvablyInRange(containerNode, keyNode)) {
        return void 0;
      }
      return `${containerStr}[${keyStr}] = ${valueStr}`;
    }
    return void 0;
  }
  // the concrete Go type an *expression* is printed as: a local's declared type,
  // the return type of a runtime helper call, or a literal. undefined when the value
  // stays inside an `any` box — a native Go operation on an `any` box would not
  // compile, so every rule below falls back to its helper in that case.
  goPrintedTypeOfExpression(node, printedText) {
    const inner = _optionalChain([node, 'optionalAccess', _317 => _317.kind]) === _typescript2.default.SyntaxKind.ParenthesizedExpression ? node.expression : node;
    if (_optionalChain([inner, 'optionalAccess', _318 => _318.kind]) === _typescript2.default.SyntaxKind.Identifier) {
      return this.goDeclaredTypeOfIdentifier(inner);
    }
    return this.goTypeOfInitializer(inner, printedText);
  }
  printInlineArrayLength(expression, printedText) {
    if (printedText.includes("\n")) {
      return void 0;
    }
    const goType = this.goPrintedTypeOfExpression(expression, printedText);
    if (typeof goType === "string" && this.sliceLengthTypes.indexOf(goType) >= 0) {
      return `len(${printedText})`;
    }
    return void 0;
  }
  // Go has no ternary operator. The func literal returns the same branch value the
  // helper would and prints the condition the same way; it evaluates only the branch
  // TypeScript would take, while Ternary receives both already evaluated.
  printInlineTernary(condition, whenTrue, whenFalse) {
    if (condition.includes("\n")) {
      return void 0;
    }
    const level = this.goStatementLevel;
    const body = this.getIden(level + 1);
    const branch = this.getIden(level + 2);
    return `func() any {
${body}if ${this.goStripControlClauseParens(condition)} {
${branch}return ${whenTrue}
${body}}
${body}return ${whenFalse}
${this.getIden(level)}}()`;
  }
  // stripParens() applied to a printed condition text (see goControlClauseParens)
  goStripControlClauseParens(text) {
    for (; ; ) {
      const inner = this.goEnclosedExpression(text);
      if (inner === void 0) {
        return text;
      }
      text = inner;
    }
  }
  // a multi-line branch (a nested ternary, a composite literal) is laid out relative to
  // the `return` statement that holds it: inside the `if` for whenTrue (two levels below
  // the statement), the literal's body for whenFalse (one level)
  goPrintTernaryBranch(node, levels) {
    const previousLevel = this.goStatementLevel;
    this.goStatementLevel = previousLevel + levels;
    try {
      return this.goWithExprDepth(1, () => this.printNode(node, 0));
    } finally {
      this.goStatementLevel = previousLevel;
    }
  }
  // `key in obj` on a Go map[string]any with a string key. The two-value map read is
  // a statement, hence the func literal: a present-but-nil value is ok=true, exactly
  // like InOp's map case. InOp also answers false for a nil/number key and covers
  // sync.Map/orderbook receivers, so anything else keeps the helper.
  printInlineInOp(dictNode, keyNode, dictText, keyText) {
    if (dictText.includes("\n") || keyText.includes("\n")) {
      return void 0;
    }
    if (this.goPrintedTypeOfExpression(dictNode, dictText) !== "map[string]any") {
      return void 0;
    }
    if (this.goPrintedTypeOfExpression(keyNode, keyText) !== "string") {
      return void 0;
    }
    const read = `_, ok := ${dictText}[${keyText}]`;
    if (11 + read.length + 2 + "return ok".length <= 100) {
      return `func() bool { ${read}; return ok }()`;
    }
    const level = this.goStatementLevel;
    return `func() bool {
${this.getIden(level + 1)}${read}
${this.getIden(level + 1)}return ok
${this.getIden(level)}}()`;
  }
  // OpNeg boxes `-val.Int()` / `-val.Float()`, i.e. an int64 or a float64, and nil
  // for anything else. `-x` reproduces that exactly only for an operand that already
  // prints as float64/int64; a Go `int` (or an integer literal) boxes as int instead.
  printInlineOpNeg(node, printedText) {
    if (printedText.includes("\n")) {
      return void 0;
    }
    const goType = this.goPrintedTypeOfExpression(node.operand, printedText);
    if (goType === "float64" || goType === "int64") {
      return `-${printedText}`;
    }
    if (/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(printedText.trim())) {
      if (printedText.includes(".") || /[eE]/.test(printedText)) {
        return `-${printedText}`;
      }
      const parent = node.parent;
      if (_optionalChain([parent, 'optionalAccess', _319 => _319.kind]) === _typescript2.default.SyntaxKind.CallExpression) {
        const callee = this.printNode(parent.expression, 0);
        if (this.comparisonHelpers.indexOf(callee) >= 0) {
          return `-${printedText}`;
        }
      }
      if (_optionalChain([parent, 'optionalAccess', _320 => _320.kind]) === _typescript2.default.SyntaxKind.BinaryExpression) {
        const op = parent.operatorToken.kind;
        if (op === _typescript2.default.SyntaxKind.GreaterThanToken || op === _typescript2.default.SyntaxKind.GreaterThanEqualsToken || op === _typescript2.default.SyntaxKind.LessThanToken || op === _typescript2.default.SyntaxKind.LessThanEqualsToken) {
          return `-${printedText}`;
        }
      }
    }
    return void 0;
  }
  // JS truthiness of an operand whose Go type the printer knows, expressed with
  // plain Go instead of boxing the value into `EvalTruthy(any)`. Each arm mirrors the
  // matching `EvalTruthy` case exactly, including nil (a nil *T and a nil map are
  // both falsy) — so this is the same predicate, minus the interface round-trip.
  printInlineTruthy(node) {
    if (_optionalChain([node, 'optionalAccess', _321 => _321.kind]) !== _typescript2.default.SyntaxKind.Identifier) {
      return void 0;
    }
    const goType = this.goDeclaredTypeOfIdentifier(node);
    if (goType === void 0) {
      return void 0;
    }
    const text = this.printNode(node, 0);
    switch (goType) {
      case "bool":
        return text;
      case "string":
        return `(${text} != "")`;
      case "int":
      case "int64":
      case "float64":
        return `(${text} != 0)`;
      case "*bool":
        return `(${text} != nil && *${text})`;
      case "*string":
        return `(${text} != nil && *${text} != "")`;
      case "*int":
      case "*int64":
      case "*float64":
        return `(${text} != nil && *${text} != 0)`;
      case "[]string":
      case "[]any":
      case "map[string]any":
        return `(len(${text}) > 0)`;
    }
    return void 0;
  }
  // the native Go text for a condition operand the printer can type, or undefined
  // when the operand has to go through the truthiness helper. `(x)` is decided on
  // its operand and keeps the source parentheses, so the surrounding operator still
  // parses exactly the same way.
  goNativeCondition(node) {
    if (_optionalChain([node, 'optionalAccess', _322 => _322.kind]) === _typescript2.default.SyntaxKind.Identifier) {
      return this.printInlineTruthy(node);
    }
    if (_optionalChain([node, 'optionalAccess', _323 => _323.kind]) === _typescript2.default.SyntaxKind.ParenthesizedExpression) {
      const inner = this.goNativeCondition(node.expression);
      if (inner === void 0) {
        return void 0;
      }
      return inner.startsWith("(") && this.isWholePrintedCall(inner, 0) ? inner : `(${inner})`;
    }
    const printed = this.printNode(node, 0);
    if (this.goTypeOfInitializer(node, printed) === "bool") {
      return printed;
    }
    return GO_BOOL_FIELDS.has(printed) ? printed : void 0;
  }
  // gofmt prints the condition of every `if`/`for`/`switch` through
  // go/printer/nodes.go controlClause() -> stripParens(): the single outermost,
  // fully enclosing parentheses pair is dropped, and the rule applies again to the
  // enclosed expression while that one is parenthesized as well
  // (`if (x == 1) {` -> `if x == 1 {`, `if ((x == 1)) {` -> `if x == 1 {`).
  // Parentheses survive when the enclosed expression holds an unparenthesized
  // composite literal whose type is a type name, because `if T{} == x {` does not
  // parse. The printer emits text instead of an ast.Expr, so stripParens runs over
  // the printed condition text here.
  goControlClauseParens(node, expression) {
    if (!this.goIsControlClauseCondition(node)) {
      return expression;
    }
    let text = expression;
    for (; ; ) {
      const inner = this.goEnclosedExpression(text);
      if (inner === void 0) {
        return text;
      }
      text = inner;
    }
  }
  // the expression inside the outermost parentheses pair of `text`, or undefined
  // when `text` is not one fully enclosing pair or gofmt keeps that pair
  goEnclosedExpression(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
      return void 0;
    }
    if (this.goSkipBalanced(trimmed, 0, "(", ")") !== trimmed.length) {
      return void 0;
    }
    const inner = trimmed.substring(1, trimmed.length - 1).trim();
    if (this.goHasTypeNameCompositeLiteral(inner)) {
      return void 0;
    }
    return inner;
  }
  // the expression a Go `if`/`for`/`switch` statement tests, the only positions
  // gofmt's controlClause() rewrites
  goIsControlClauseCondition(node) {
    const parent = _optionalChain([node, 'optionalAccess', _324 => _324.parent]);
    switch (_optionalChain([parent, 'optionalAccess', _325 => _325.kind])) {
      case _typescript2.default.SyntaxKind.IfStatement:
      case _typescript2.default.SyntaxKind.WhileStatement:
      case _typescript2.default.SyntaxKind.SwitchStatement:
        return parent.expression === node;
      case _typescript2.default.SyntaxKind.ForStatement:
        return parent.condition === node;
    }
    return false;
  }
  // stripParens' ast.Inspect stops at nested parentheses, which protect whatever
  // they enclose, and reports a composite literal whenever its type is a type name
  goHasTypeNameCompositeLiteral(text) {
    let index = 0;
    while (index < text.length) {
      const char = text[index];
      if (char === '"' || char === "`" || char === "'") {
        index = this.goSkipQuoted(text, index);
        continue;
      }
      if (char === "(") {
        const next = this.goSkipBalanced(text, index, "(", ")");
        if (next < 0) {
          return false;
        }
        index = next;
        continue;
      }
      if (char === "{") {
        if (this.goCompositeLitHasTypeName(text, index)) {
          return true;
        }
        const next = this.goSkipBalanced(text, index, "{", "}");
        if (next < 0) {
          return false;
        }
        index = next;
        continue;
      }
      index += 1;
    }
    return false;
  }
  // `{` opens a composite literal whose type is a type name when the text in front
  // of it is an ident or a selector chain of idents; `map[string]any{` and `[]any{`
  // are type literals and do not count (isTypeName in go/printer/nodes.go)
  goCompositeLitHasTypeName(text, braceIndex) {
    let start = braceIndex;
    while (start > 0 && /[A-Za-z0-9_.[\]]/.test(text[start - 1])) {
      start -= 1;
    }
    const typeText = text.substring(start, braceIndex).trim();
    if (["map", "struct", "interface", "func", "chan"].indexOf(typeText) >= 0) {
      return false;
    }
    return /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(typeText);
  }
  // the index right after the bracket closing the one at `start`, or -1 when the
  // brackets are unbalanced (the printer sees statement fragments, not whole files)
  goSkipBalanced(text, start, open, close) {
    let depth = 0;
    let index = start;
    while (index < text.length) {
      const char = text[index];
      if (char === '"' || char === "`" || char === "'") {
        index = this.goSkipQuoted(text, index);
        continue;
      }
      if (char === open) {
        depth += 1;
      } else if (char === close) {
        depth -= 1;
        if (depth === 0) {
          return index + 1;
        }
      }
      index += 1;
    }
    return -1;
  }
  // the index right after the string, rune or raw string literal opening at `start`
  goSkipQuoted(text, start) {
    const quote = text[start];
    let index = start + 1;
    while (index < text.length) {
      const char = text[index];
      if (char === "\\" && quote !== "`") {
        index += 2;
        continue;
      }
      if (char === quote) {
        return index + 1;
      }
      index += 1;
    }
    return text.length;
  }
  // gofmt keeps a comment group that the source separates from the following
  // declaration by a blank line as a free-standing comment; joined to it, it becomes
  // the declaration's doc comment and its indented lines are re-laid out as a code
  // block. The blank line is preserved so the emitted text keeps the source's shape.
  printLeadingComments(node, identation) {
    const printed = super.printLeadingComments(node, identation);
    if (printed.length === 0) {
      return printed;
    }
    const fullText = this.getSrc().getFullText();
    const ranges = _nullishCoalesce(_typescript2.default.getLeadingCommentRanges(fullText, node.pos), () => ( []));
    const last = ranges[ranges.length - 1];
    if (last === void 0) {
      return printed;
    }
    const gap = fullText.slice(last.end, node.getStart());
    const detached = (_nullishCoalesce(gap.match(/\n/g), () => ( []))).length > 1;
    return detached ? printed + "\n" : printed;
  }
  // gofmt separates a top-level declaration that carries a comment from the previous
  // declaration by a blank line (go/printer declList: min = 2 when the decl has a doc
  // comment); the file members are joined with a bare newline otherwise
  printSourceFileStatements(node, identation) {
    const printed = node.statements.map((m) => this.printNode(m, identation + 1)).filter((st) => st.length > 0);
    return printed.map((st, index) => index > 0 && /^\s*(\/\/|\/\*)/.test(st) ? "\n" + st : st).join("\n") + "\n".repeat(this.NUM_LINES_END_FILE);
  }
  printNode(node, identation = 0) {
    if (node !== void 0 && _typescript2.default.isSourceFile(node)) {
      this.className = "undefined";
      return this.printSourceFileStatements(node, identation);
    }
    const isStatement = node !== void 0 && _typescript2.default.isStatement(node) && node.kind !== _typescript2.default.SyntaxKind.Block;
    const previousLevel = this.goStatementLevel;
    if (isStatement) {
      this.goStatementLevel = identation;
    }
    try {
      const printed = super.printNode(node, identation);
      return this.goControlClauseParens(node, printed);
    } finally {
      this.goStatementLevel = previousLevel;
    }
  }
  // composite literal body one level deeper than the statement, closing brace at the
  // statement's level; the leading indentation belongs to the enclosing printer
  printObjectLiteralExpression(node, identation) {
    const level = this.goStatementLevel;
    const objectBody = this.printObjectLiteralBody(node, level);
    const formattedObjectBody = objectBody ? "\n" + objectBody + "\n" + this.getIden(level) : objectBody;
    return this.OBJECT_OPENING + formattedObjectBody + this.OBJECT_CLOSING;
  }
  printCondition(node, identation) {
    const native = this.goNativeCondition(node);
    if (native !== void 0) {
      return `${this.getIden(identation)}${this.goControlClauseParens(node, native)}`;
    }
    const inNode = _optionalChain([node, 'optionalAccess', _326 => _326.kind]) === _typescript2.default.SyntaxKind.ParenthesizedExpression ? node.expression : node;
    if (_optionalChain([inNode, 'optionalAccess', _327 => _327.kind]) === _typescript2.default.SyntaxKind.BinaryExpression && inNode.operatorToken.kind === _typescript2.default.SyntaxKind.InKeyword) {
      const inlined = this.printInlineInOp(inNode.right, inNode.left, this.printNode(inNode.right, 0), this.printNode(inNode.left, 0));
      if (inlined !== void 0) {
        const text = inNode === node ? inlined : `(${inlined})`;
        return `${this.getIden(identation)}${this.goControlClauseParens(node, text)}`;
      }
    }
    return super.printCondition(node, identation);
  }
  // === / !== inlined to plain Go operators when both sides are concrete Go
  // values or real pointers. Everything else — in particular anything that is
  // still `any` in Go — falls through to the existing IsEqual helper.
  // `(a == b || *a == *b)` is rejected: a nil *T panics on the second clause.
  // Go has no implicit numeric conversion: `*limit == length` does not compile
  // when limit is *int64 and length is int, even though TypeScript calls both
  // `number`. Dereferencing is therefore only safe against an untyped constant
  // (a literal, which adapts to the pointee) or an operand of the very same Go
  // type. Anything else — including any `any` operand — keeps IsEqual.
  goDerefComparableWith(ptrNode, ptrText, otherNode) {
    const pointee = _optionalChain([this, 'access', _328 => _328.goPointerTypeOfExpression, 'call', _329 => _329(ptrNode, ptrText), 'optionalAccess', _330 => _330.substring, 'call', _331 => _331(1)]);
    if (pointee === void 0) {
      return false;
    }
    switch (_optionalChain([otherNode, 'optionalAccess', _332 => _332.kind])) {
      case _typescript2.default.SyntaxKind.StringLiteral:
      case _typescript2.default.SyntaxKind.NoSubstitutionTemplateLiteral:
        return pointee === "string";
      case _typescript2.default.SyntaxKind.NumericLiteral:
        return pointee === "int" || pointee === "int64" || pointee === "float64";
      case _typescript2.default.SyntaxKind.TrueKeyword:
      case _typescript2.default.SyntaxKind.FalseKeyword:
        return pointee === "bool";
    }
    const otherType = this.goDeclaredTypeOfIdentifier(otherNode);
    return otherType === pointee;
  }
  printInlineEquality(left, right, leftText, rightText, isEq) {
    const lPtr = this.goPointerTypeOfExpression(left, leftText) !== void 0;
    const rPtr = this.goPointerTypeOfExpression(right, rightText) !== void 0;
    const lRepeatable = _optionalChain([left, 'optionalAccess', _333 => _333.kind]) === _typescript2.default.SyntaxKind.Identifier;
    const rRepeatable = _optionalChain([right, 'optionalAccess', _334 => _334.kind]) === _typescript2.default.SyntaxKind.Identifier;
    const lFam = this.goScalarFamily(left);
    const rFam = this.goScalarFamily(right);
    if (lFam === "nil" && rPtr) {
      return isEq ? `(${rightText} == nil)` : `(${rightText} != nil)`;
    }
    if (rFam === "nil" && lPtr) {
      return isEq ? `(${leftText} == nil)` : `(${leftText} != nil)`;
    }
    if (lPtr && rPtr) {
      const lPointee = this.goPointerTypeOfExpression(left, leftText);
      if (!lRepeatable || !rRepeatable || lPointee !== this.goPointerTypeOfExpression(right, rightText)) {
        return void 0;
      }
      if (isEq) {
        return `(${leftText} == ${rightText} || (${leftText} != nil && ${rightText} != nil && *${leftText} == *${rightText}))`;
      }
      return `(${leftText} != ${rightText} && (${leftText} == nil || ${rightText} == nil || *${leftText} != *${rightText}))`;
    }
    if (lPtr && rFam !== void 0 && rFam !== "nil") {
      if (!lRepeatable || !this.goDerefComparableWith(left, leftText, right)) {
        return void 0;
      }
      return isEq ? `(${leftText} != nil && *${leftText} == ${rightText})` : `(${leftText} == nil || *${leftText} != ${rightText})`;
    }
    if (rPtr && lFam !== void 0 && lFam !== "nil") {
      if (!rRepeatable || !this.goDerefComparableWith(right, rightText, left)) {
        return void 0;
      }
      return isEq ? `(${rightText} != nil && *${rightText} == ${leftText})` : `(${rightText} == nil || *${rightText} != ${leftText})`;
    }
    if (!lPtr && !rPtr && lFam !== void 0 && rFam !== void 0 && lFam !== "nil" && rFam !== "nil" && lFam === rFam) {
      return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
    }
    const lNilFam = this.goScalarFamilyWithNil(left);
    const rNilFam = this.goScalarFamilyWithNil(right);
    const lBox = !lPtr && this.goIsAnyBoxExpression(left, leftText);
    const rBox = !rPtr && this.goIsAnyBoxExpression(right, rightText);
    if (lBox && rFam === "nil" && lNilFam !== void 0 && lNilFam !== "number") {
      return isEq ? `(${leftText} == nil)` : `(${leftText} != nil)`;
    }
    if (rBox && lFam === "nil" && rNilFam !== void 0 && rNilFam !== "number") {
      return isEq ? `(${rightText} == nil)` : `(${rightText} != nil)`;
    }
    const isLiteral = (node) => {
      switch (_optionalChain([node, 'optionalAccess', _335 => _335.kind])) {
        case _typescript2.default.SyntaxKind.StringLiteral:
        case _typescript2.default.SyntaxKind.NoSubstitutionTemplateLiteral:
        case _typescript2.default.SyntaxKind.TrueKeyword:
        case _typescript2.default.SyntaxKind.FalseKeyword:
          return true;
      }
      return false;
    };
    const literalMatchesBox = (boxFam, litNode, litFam) => (litFam === "string" || litFam === "bool") && isLiteral(litNode) && (boxFam === litFam || boxFam === void 0);
    if (lBox && literalMatchesBox(lNilFam, right, rFam)) {
      return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
    }
    if (rBox && literalMatchesBox(rNilFam, left, lFam)) {
      return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
    }
    if (lBox && rBox && lNilFam !== void 0 && lNilFam !== "number" && lNilFam === rNilFam) {
      return isEq ? `(${leftText} == ${rightText})` : `(${leftText} != ${rightText})`;
    }
    return void 0;
  }
  // the Go numeric kind an operand's static type is, or undefined when it stays
  // `any` (unknown helper result, union, pointer box): only a concrete kind can
  // join a comparison the Go compiler accepts
  goOperandNumericKind(node, printedText) {
    if (node === void 0) {
      return void 0;
    }
    if (node.kind === _typescript2.default.SyntaxKind.Identifier) {
      const declared = this.goDeclaredTypeOfIdentifier(node);
      if (declared !== void 0) {
        return GO_NUMERIC_KINDS.indexOf(declared) >= 0 ? declared : void 0;
      }
      return this.goLiteralTypedLocalKind(node);
    }
    if (node.kind === _typescript2.default.SyntaxKind.NumericLiteral) {
      return this.goNumericLiteralKind(node);
    }
    if (node.kind === _typescript2.default.SyntaxKind.ParenthesizedExpression) {
      return this.goOperandNumericKind(node.expression, this.printNode(node.expression, 0));
    }
    const goType = this.goTypeOfInitializer(node, printedText);
    return goType !== void 0 && GO_NUMERIC_KINDS.indexOf(goType) >= 0 ? goType : void 0;
  }
  // a local bound by `:=` takes its Go type from the initializer: an untyped
  // integer constant is `int`, a floating-point one is `float64`. A variable
  // statement prints `var x <type> = …` instead, where the printer already
  // decided the type, so only the `:=` form may be trusted here.
  goLiteralTypedLocalKind(node) {
    let symbol;
    try {
      symbol = this.getChecker().getSymbolAtLocation(node);
    } catch (e) {
      return void 0;
    }
    const declaration = _optionalChain([symbol, 'optionalAccess', _336 => _336.valueDeclaration]);
    if (_optionalChain([declaration, 'optionalAccess', _337 => _337.kind]) !== _typescript2.default.SyntaxKind.VariableDeclaration || declaration.initializer === void 0) {
      return void 0;
    }
    const declarationList = declaration.parent;
    if (_optionalChain([declarationList, 'optionalAccess', _338 => _338.kind]) !== _typescript2.default.SyntaxKind.VariableDeclarationList || _optionalChain([declarationList, 'access', _339 => _339.parent, 'optionalAccess', _340 => _340.kind]) === _typescript2.default.SyntaxKind.FirstStatement) {
      return void 0;
    }
    return this.goNumericLiteralKind(declaration.initializer);
  }
  // an untyped Go constant: the integer forms adopt any numeric kind, the
  // floating-point ones only fit float64
  goNumericLiteralKind(node) {
    const text = _optionalChain([node, 'optionalAccess', _341 => _341.text]);
    if (text === void 0) {
      return void 0;
    }
    if (/^[0-9][0-9_]*$/.test(text) || /^0[xXoObB][0-9a-fA-F_]+$/.test(text)) {
      return "int";
    }
    if (/^[0-9][.eE]/.test(text)) {
      return "float64";
    }
    return void 0;
  }
  // a constant only joins a comparison when its value is representable in the
  // other operand's kind: `0.5` is not an int, and neither is 1e400 (infinity)
  goLiteralFitsKind(node, kind) {
    const value = Number(_optionalChain([node, 'optionalAccess', _342 => _342.text, 'optionalAccess', _343 => _343.replaceAll, 'call', _344 => _344("_", "")]));
    if (!Number.isFinite(value)) {
      return false;
    }
    if (kind === "float64") {
      return true;
    }
    return Number.isInteger(value) && Math.abs(value) <= 2147483647;
  }
  // the kind both operands are compared in, or undefined when Go would need a
  // conversion (two different concrete kinds) or the constant does not fit
  goComparisonKind(left, leftKind, right, rightKind) {
    if (leftKind === rightKind) {
      return leftKind;
    }
    if (_optionalChain([left, 'optionalAccess', _345 => _345.kind]) === _typescript2.default.SyntaxKind.NumericLiteral && _optionalChain([right, 'optionalAccess', _346 => _346.kind]) !== _typescript2.default.SyntaxKind.NumericLiteral) {
      return this.goLiteralFitsKind(left, rightKind) ? rightKind : void 0;
    }
    if (_optionalChain([right, 'optionalAccess', _347 => _347.kind]) === _typescript2.default.SyntaxKind.NumericLiteral && _optionalChain([left, 'optionalAccess', _348 => _348.kind]) !== _typescript2.default.SyntaxKind.NumericLiteral) {
      return this.goLiteralFitsKind(right, leftKind) ? leftKind : void 0;
    }
    return void 0;
  }
  // `<` `>` `<=` `>=` between two operands the checker proves to be numbers of the
  // same Go kind is exactly the comparison the helper performs, minus the interface
  // round-trip, so the call carries no information. Everything else — `any` boxes,
  // pointers, mixed kinds, strings — keeps the helper. float64 keeps
  // IsLessThan/IsLessThanOrEqual: the helper answers true whenever an operand is
  // NaN while Go (and JS) answer false, and only those two operators differ.
  printInlineOrderedComparison(left, right, leftText, rightText, op) {
    const operator = ORDERED_COMPARISON_OPERATORS[op];
    if (operator === void 0) {
      return void 0;
    }
    const leftKind = this.goOperandNumericKind(left, leftText);
    const rightKind = this.goOperandNumericKind(right, rightText);
    if (leftKind === void 0 || rightKind === void 0) {
      return void 0;
    }
    const kind = this.goComparisonKind(left, leftKind, right, rightKind);
    if (kind === void 0) {
      return void 0;
    }
    if (kind === "float64" && (operator === "<" || operator === "<=")) {
      return void 0;
    }
    return `(${leftText} ${operator} ${rightText})`;
  }
  // Go's printer never wraps an already parenthesised expression: gofmt prints a
  // ParenExpr whose child is itself a ParenExpr without its own parentheses
  // (`((x))` prints as `(x)`), because the text it is handed is re-parsed that way.
  // Our output is re-parsed exactly like that, so a source parenthesis around an
  // expression that already prints parenthesised -- an inlined comparison, a nested
  // parenthesised expression, an EvalTruthy(...) arm -- must emit the single pair
  // gofmt keeps instead of doubling it.
  printParenthesizedExpression(node, identation) {
    const expression = node.expression;
    if (_optionalChain([expression, 'optionalAccess', _349 => _349.kind]) === _typescript2.default.SyntaxKind.AsExpression) {
      return this.getIden(identation) + this.printNode(expression, 0);
    }
    if (_optionalChain([expression, 'optionalAccess', _350 => _350.kind]) === _typescript2.default.SyntaxKind.ArrowFunction) {
      return "";
    }
    const printed = this.goWithExprDepth(this.goExprDepth - 1, () => this.printNode(expression, 0));
    if (this.goIsParenthesizedExpression(printed)) {
      return this.getIden(identation) + printed;
    }
    return this.getIden(identation) + this.LEFT_PARENTHESIS + printed + this.RIGHT_PARENTHESIS;
  }
  // true when the printed text is exactly one parenthesised expression: its first
  // `(` closes on the last non-space character. Literals and comments are skipped
  // so a parenthesis inside them cannot unbalance the scan.
  goIsParenthesizedExpression(printed) {
    const text = printed.trimStart();
    if (text[0] !== "(") {
      return false;
    }
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === "/" && text[i + 1] === "/") {
        return false;
      }
      if (c === "/" && text[i + 1] === "*") {
        const end = text.indexOf("*/", i + 2);
        if (end < 0) {
          return false;
        }
        i = end + 1;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        i = this.goSkipGoLiteral(text, i);
        if (i < 0) {
          return false;
        }
        continue;
      }
      if (c === "(") {
        depth += 1;
      } else if (c === ")") {
        depth -= 1;
        if (depth === 0) {
          return text.substring(i + 1).trim().length === 0;
        }
      }
    }
    return false;
  }
  // index of the quote closing the Go string/rune literal that starts at `start`, -1 when unterminated
  goSkipGoLiteral(text, start) {
    const quote = text[start];
    for (let i = start + 1; i < text.length; i++) {
      const c = text[i];
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (c === quote) {
        return i;
      }
    }
    return -1;
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
  transformPropertyAcessExpressionIfNeeded(node) {
    const expression = node.expression;
    const leftSide = this.printNode(expression, 0);
    const rightSide = node.name.escapedText;
    let rawExpression = void 0;
    switch (rightSide) {
      case "length":
        const type = this.getChecker().getTypeAtLocation(expression);
        rawExpression = this.isStringType(type.flags) ? `GetLength(${leftSide})` : _nullishCoalesce(this.printInlineArrayLength(expression, leftSide), () => ( `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`));
        break;
      case "push":
        rawExpression = `((IList<object>)${leftSide}).Add`;
        break;
    }
    return rawExpression;
  }
  printCustomDefaultValueIfNeeded(node) {
    return void 0;
  }
  printFunctionBody(node, identation, wrapInChannel = false) {
    let functionBody;
    const funcParams = node.parameters;
    const initParams = [];
    if (funcParams.length > 0) {
      const body = node.body.statements;
      const first = body.length > 0 ? body[0] : [];
      const remaining = body.length > 0 ? body.slice(1) : [];
      let firstStatement = this.printNode(first, identation + 1);
      const remainingString = remaining.map((statement) => this.printNode(statement, identation + 1)).join("\n");
      let offSetIndex = 0;
      funcParams.forEach((param, i) => {
        const initializer = param.initializer;
        if (initializer) {
          const index = i + offSetIndex;
          const paramName = this.printNode(param.name, 0);
          initParams.push(`${paramName} := GetArg(optionalArgs, ${index}, ${this.printNode(initializer, 0)})`);
          initParams.push(`_ = ${paramName}`);
        } else {
          offSetIndex--;
        }
      });
      if (initParams.length > 0) {
        const defaultInitializers = initParams.map((l) => this.getIden(identation + 1) + l).join("\n") + "\n";
        const bodyParts = firstStatement.split("\n");
        const commentPart = bodyParts.filter((line) => this.isComment(line));
        const isComment = commentPart.length > 0;
        if (isComment) {
          const commentPartString = commentPart.map((c) => {
            const line = c.trim();
            return this.getIden(identation + 1) + (line.startsWith("*") ? " " + line : line);
          }).join("\n");
          const firstStmNoComment = bodyParts.filter((line) => !this.isComment(line)).join("\n");
          firstStatement = commentPartString + "\n" + defaultInitializers + firstStmNoComment;
        } else {
          firstStatement = defaultInitializers + firstStatement;
        }
      }
      const blockOpen = this.getBlockOpen(identation);
      const blockClose = this.getBlockClose(identation);
      firstStatement = remainingString.length > 0 ? firstStatement + "\n" : firstStatement;
      if (!wrapInChannel) {
        functionBody = blockOpen + firstStatement + remainingString + blockClose;
      } else {
        functionBody = firstStatement + remainingString;
      }
    } else {
      if (!wrapInChannel) {
        functionBody = super.printFunctionBody(node, identation);
      } else {
        functionBody = node.body.statements.map((statement) => {
          return this.printNode(statement, identation + 1);
        }).join("\n");
      }
    }
    if (wrapInChannel) {
      const functionBodySplit = functionBody.split("\n");
      const bodyWithIndentationExtraAndNoReturn = functionBodySplit.join("\n");
      let shouldAddLastReturn = true;
      const bodySplit = functionBodySplit;
      const lastLine = bodySplit[bodySplit.length - 1];
      if (lastLine.trim().startsWith("return") || lastLine.trim().startsWith("panic")) {
        shouldAddLastReturn = false;
      }
      if (node.body && this.blockEndsWithConditionalReturn(node.body.statements)) {
        shouldAddLastReturn = false;
      }
      const lastReturn = shouldAddLastReturn ? this.getIden(identation + 1) + "return nil" : "";
      const lines = [
        "{",
        `${this.getIden(identation + 1)}defer close(ch)`,
        `${this.getIden(identation + 1)}defer ReturnPanicError(ch)`,
        bodyWithIndentationExtraAndNoReturn
      ];
      if (lastReturn) {
        lines.push(lastReturn);
      }
      lines.push(`${this.getIden(identation)}}`);
      functionBody = lines.join("\n");
      functionBody = functionBody.replaceAll(/(^\s*)ch\s<-\snil\s+return\snil(\s*\})/gm, "$1return nil$2");
    }
    return functionBody;
  }
  printAwaitExpression(node, identation) {
    const expression = this.printNode(node.expression, identation);
    if (expression.startsWith("<-")) {
      return expression;
    }
    return `(<-${expression})`;
  }
  printInstanceOfExpression(node, identation) {
    const left = this.printNode(node.left);
    const right = this.printNode(node.right);
    return this.getIden(identation) + `IsInstance(${left}, ${right})`;
  }
  getRandomNameSuffix() {
    return Math.floor(Math.random() * 1e6).toString();
  }
  getLineBasedSuffix(node) {
    const { line, character } = this.getSrc().getLineAndCharacterOfPosition(node.getStart());
    return `${line}${character}`;
  }
  printExpressionStatement(node, identation) {
    if (_optionalChain([node, 'optionalAccess', _351 => _351.expression, 'optionalAccess', _352 => _352.kind]) === _typescript2.default.SyntaxKind.AsExpression) {
      node = node.expression;
    }
    if (node.expression.kind !== _typescript2.default.SyntaxKind.AwaitExpression) {
      return this.stripWhitespaceOnlyLines(super.printExpressionStatement(node, identation));
    }
    const exprStm = this.printNode(node.expression, identation);
    const returnRandName = "retRes" + this.getLineBasedSuffix(node);
    const expStatement = `
${this.getIden(identation)}${returnRandName} := ${exprStm}
${this.getIden(identation)}PanicOnError(${returnRandName})`;
    return this.printNodeCommentsIfAny(node, identation, expStatement);
  }
  isInsideAsyncFunction(returnStatementNode) {
    let currentNode = returnStatementNode;
    while (currentNode) {
      if (_typescript2.default.isFunctionDeclaration(currentNode) || _typescript2.default.isFunctionExpression(currentNode) || _typescript2.default.isArrowFunction(currentNode) || _typescript2.default.isMethodDeclaration(currentNode)) {
        return this.isAsyncFunction(currentNode);
      }
      currentNode = currentNode.parent;
    }
    return false;
  }
  /**
   * Statement that terminates an async (channel returning) function body.
   *
   * The body is the trampoline's sibling method (`go this.fetchTickerBody(ch, ...)`),
   * and the synthetic try/catch closures nest inside it: in both cases `return` leaves
   * a function whose result is a plain `any`, never the channel. The trampoline itself
   * owns the single `return ch`, emitted by printFunctionBody.
   */
  getAsyncReturnStatement(node) {
    return "return nil";
  }
  printReturnStatement(node, identation) {
    const isAsyncFunction = this.isInsideAsyncFunction(node);
    if (!isAsyncFunction) {
      return super.printReturnStatement(node, identation);
    }
    const leadingComment = this.printLeadingComments(node, identation);
    let trailingComment = this.printTraillingComment(node, identation);
    trailingComment = trailingComment ? " " + trailingComment : trailingComment;
    const exp = node.expression;
    let rightPart = exp ? " " + this.printNode(exp, identation) : "";
    rightPart = rightPart.trim();
    const returnStatement = this.getAsyncReturnStatement(node);
    if (_optionalChain([node, 'optionalAccess', _353 => _353.expression, 'optionalAccess', _354 => _354.kind]) === _typescript2.default.SyntaxKind.AsExpression) {
      node = node.expression;
    }
    if (_optionalChain([node, 'optionalAccess', _355 => _355.expression, 'optionalAccess', _356 => _356.kind]) === _typescript2.default.SyntaxKind.AwaitExpression) {
      const returnRandName = "retRes" + this.getLineBasedSuffix(node.expression);
      rightPart = rightPart ? rightPart + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
      return `
${this.getIden(identation)}${returnRandName} := ${rightPart}
${this.getIden(identation)}PanicOnError(${returnRandName})
${leadingComment}${this.getIden(identation)}ch <- ${returnRandName}${trailingComment}
${this.getIden(identation)}${returnStatement}`;
    }
    if (rightPart.length === 0) {
      return `
${this.getIden(identation)}${returnStatement}`;
    }
    return `
${leadingComment}${this.getIden(identation)}ch <- ${rightPart}${trailingComment}
${this.getIden(identation)}${returnStatement}`;
  }
  printAsExpression(node, identation) {
    const type = node.type;
    if (type.kind === _typescript2.default.SyntaxKind.AnyKeyword) {
    }
    if (type.kind === _typescript2.default.SyntaxKind.StringKeyword) {
    }
    if (type.kind === _typescript2.default.SyntaxKind.ArrayType) {
    }
    return this.printNode(node.expression, identation);
  }
  printArrayLiteralExpression(node, identation = 0) {
    let arrayOpen = this.ARRAY_OPENING_TOKEN;
    const elems = node.elements;
    const elements = node.elements.map((e) => this.goWithExprDepth(1, () => this.printNode(e, identation)).trim()).join(", ");
    if (elems.length > 0) {
      const first = elems[0];
      if (first.kind === _typescript2.default.SyntaxKind.CallExpression) {
        const type = this.getFunctionType(first);
        if (type === void 0 || elements.indexOf(this.UKNOWN_PROP_ASYNC_WRAPPER_OPEN) > -1) {
          arrayOpen = "[]any{";
        } else {
          arrayOpen = `[]any{`;
        }
      }
    }
    return arrayOpen + elements + this.ARRAY_CLOSING_TOKEN;
  }
  printArgsForCallExpression(node, identation) {
    const args = node.arguments;
    let parsedArgs = "";
    if (false) {
      const parsedTypes = this.getTypesFromCallExpressionParameters(node);
      const tmpArgs = [];
      args.forEach((arg, index) => {
        const parsedType = parsedTypes[index];
        let cast = "";
        if (parsedType !== "object" && parsedType !== "float" && parsedType !== "int") {
          cast = parsedType ? `(${parsedType})` : "";
        }
        tmpArgs.push(cast + this.printNode(arg, identation).trim());
      });
      parsedArgs = tmpArgs.join(",");
      return parsedArgs;
    }
    if (node.arguments && node.arguments.length > 1) {
      return this.goWithExprDepth(this.goExprDepth + 1, () => super.printArgsForCallExpression(node, identation));
    }
    return super.printArgsForCallExpression(node, identation);
  }
  // check this out later
  printArrayIsArrayCall(node, identation, parsedArg = void 0) {
    return `IsArray(${parsedArg})`;
  }
  printObjectKeysCall(node, identation, parsedArg = void 0) {
    return `ObjectKeys(${parsedArg})`;
  }
  printObjectValuesCall(node, identation, parsedArg = void 0) {
    return `ObjectValues(${parsedArg})`;
  }
  printJsonParseCall(node, identation, parsedArg = void 0) {
    return `JsonParse(${parsedArg})`;
  }
  printJsonStringifyCall(node, identation, parsedArg = void 0) {
    return `JsonStringify(${parsedArg})`;
  }
  printPromiseAllCall(node, identation, parsedArg = void 0) {
    return `promiseAll(${parsedArg})`;
  }
  printMathFloorCall(node, identation, parsedArg = void 0) {
    return `MathFloor(${parsedArg})`;
  }
  printMathRoundCall(node, identation, parsedArg = void 0) {
    return `MathRound(${parsedArg})`;
  }
  printMathCeilCall(node, identation, parsedArg = void 0) {
    return `MathCeil(${parsedArg})`;
  }
  printNumberIsIntegerCall(node, identation, parsedArg) {
    return `IsInt(${parsedArg})`;
  }
  // the base printer prints a method-call argument at the statement's depth; the
  // emitted Go call has two or more arguments, which go/printer lays out one level
  // deeper (a native `a + b` argument then drops its blanks)
  goPrintCallArgument(argument, printedText) {
    if (_optionalChain([argument, 'optionalAccess', _357 => _357.kind]) !== _typescript2.default.SyntaxKind.BinaryExpression || printedText === void 0) {
      return printedText;
    }
    return this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(argument, 0)).trimStart();
  }
  printArrayPushCall(node, identation, name = void 0, parsedArg = void 0) {
    let returnValue = "";
    let returnRandName = name;
    parsedArg = this.goPrintCallArgument(_optionalChain([node, 'access', _358 => _358.arguments, 'optionalAccess', _359 => _359[0]]), parsedArg);
    if (_optionalChain([name, 'optionalAccess', _360 => _360.startsWith, 'call', _361 => _361("GetValue")]) || /[\]\)]$/.test(_nullishCoalesce(name, () => ( "")))) {
      returnRandName = "retRes" + this.getLineBasedSuffix(node);
      returnValue = `${returnRandName} := ${name}
${this.getIden(identation)}`;
    }
    return `${returnValue}AppendToArray(&${returnRandName}, ${parsedArg})`;
  }
  printIncludesCall(node, identation, name = void 0, parsedArg = void 0) {
    return `Contains(${name}, ${parsedArg})`;
  }
  printIndexOfCall(node, identation, name = void 0, parsedArg = void 0) {
    return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
  }
  printStartsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `StartsWith(${name}, ${parsedArg})`;
  }
  printEndsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `EndsWith(${name}, ${parsedArg})`;
  }
  printTrimCall(node, identation, name = void 0) {
    return `Trim(${name})`;
  }
  printJoinCall(node, identation, name = void 0, parsedArg = void 0) {
    return `Join(${name}, ${parsedArg})`;
  }
  printSplitCall(node, identation, name = void 0, parsedArg = void 0) {
    return `Split(${name}, ${parsedArg})`;
  }
  printToFixedCall(node, identation, name = void 0, parsedArg = void 0) {
    return `toFixed(${name}, ${parsedArg})`;
  }
  printToStringCall(node, identation, name = void 0) {
    return `ToString(${name})`;
  }
  printConcatCall(node, identation, name = void 0, parsedArg = void 0) {
    return `Concat(${name}, ${parsedArg})`;
  }
  printToUpperCaseCall(node, identation, name = void 0) {
    return `ToUpper(${name})`;
  }
  printToLowerCaseCall(node, identation, name = void 0) {
    return `ToLower(${name})`;
  }
  printShiftCall(node, identation, name = void 0) {
    return `Shift(${name})`;
  }
  printReverseCall(node, identation, name = void 0) {
    return `Reverse(${name})`;
  }
  printPopCall(node, identation, name = void 0) {
    return `Pop(${name}))`;
  }
  printAssertCall(node, identation, parsedArgs) {
    return `assert(${parsedArgs})`;
  }
  printSliceCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    parsedArg = this.goPrintCallArgument(_optionalChain([node, 'access', _362 => _362.arguments, 'optionalAccess', _363 => _363[0]]), parsedArg);
    parsedArg2 = this.goPrintCallArgument(_optionalChain([node, 'access', _364 => _364.arguments, 'optionalAccess', _365 => _365[1]]), parsedArg2);
    if (parsedArg2 === void 0) {
      parsedArg2 = "nil";
    }
    return `Slice(${name}, ${parsedArg}, ${parsedArg2})`;
  }
  printReplaceCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return `Replace(${name}, ${parsedArg}, ${parsedArg2})`;
  }
  printReplaceAllCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return `Replace(${name}, ${parsedArg}, ${parsedArg2})`;
  }
  printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
    return `PadEnd(${name}, ${parsedArg}, ${parsedArg2})`;
  }
  printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
    return `PadStart(${name}, ${parsedArg}, ${parsedArg2})`;
  }
  printDateNowCall(node, identation) {
    return "DateNow()";
  }
  printLengthProperty(node, identation, name = void 0) {
    const leftSide = this.printNode(node.expression, 0);
    return `GetLength(${leftSide})`;
  }
  // printPostFixUnaryExpression(node, identation) {
  //     const {operand, operator} = node;
  //     if (operand.kind === ts.SyntaxKind.NumericLiteral) {
  //         return super.printPostFixUnaryExpression(node, identation);
  //     }
  //     const leftSide = this.printNode(operand, 0);
  //     const op = this.PostFixOperators[operator]; // todo: handle --
  //     if (op === '--') {
  //         return `postFixDecrement(ref ${leftSide})`;
  //     }
  //     return `postFixIncrement(ref ${leftSide})`;
  // }
  // printPrefixUnaryExpression(node, identation) {
  //     const {operand, operator} = node;
  //     if (operand.kind === ts.SyntaxKind.NumericLiteral) {
  //         return super.printPrefixUnaryExpression(node, identation);
  //     }
  //     if (operator === ts.SyntaxKind.ExclamationToken) {
  //         // not branch check falsy/turthy values if needed;
  //         return  this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
  //     }
  //     const leftSide = this.printNode(operand, 0);
  //     if (operator === ts.SyntaxKind.PlusToken) {
  //         return `prefixUnaryPlus(ref ${leftSide})`;
  //     } else {
  //         return `prefixUnaryNeg(ref ${leftSide})`;
  //     }
  // }
  printConditionalExpression(node, identation) {
    const condition = this.goWithExprDepth(1, () => this.printCondition(node.condition, 0));
    if (!condition.includes("\n")) {
      const inlined = this.printInlineTernary(condition, this.goPrintTernaryBranch(node.whenTrue, 2), this.goPrintTernaryBranch(node.whenFalse, 1));
      if (inlined !== void 0) {
        return inlined;
      }
    }
    const whenTrue = this.printNode(node.whenTrue, 0);
    const whenFalse = this.printNode(node.whenFalse, 0);
    return `Ternary(${condition}, ${whenTrue}, ${whenFalse})`;
  }
  printDeleteExpression(node, identation) {
    const object = this.printNode(node.expression.expression, 0);
    const key = this.printNode(node.expression.argumentExpression, 0);
    return `Remove(${object}, ${key})`;
  }
  printThrowStatement(node, identation) {
    if (node.expression.kind === _typescript2.default.SyntaxKind.Identifier) {
      return this.getIden(identation) + "panic(" + this.printNode(node.expression, 0) + ")" + this.LINE_TERMINATOR;
    }
    if (node.expression.kind === _typescript2.default.SyntaxKind.NewExpression) {
      const expression = node.expression;
      const argumentsExp = _nullishCoalesce(_optionalChain([expression, 'optionalAccess', _366 => _366.arguments]), () => ( []));
      const parsedArg = _nullishCoalesce(argumentsExp.map((n) => this.printNode(n, 0)).join(","), () => ( ""));
      const newExpression = this.printNode(expression.expression, 0);
      if (expression.expression.kind === _typescript2.default.SyntaxKind.Identifier) {
        const id = expression.expression;
        const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
        if (symbol) {
          const declarations = _nullishCoalesce(_optionalChain([this, 'access', _367 => _367.getChecker, 'call', _368 => _368(), 'access', _369 => _369.getDeclaredTypeOfSymbol, 'call', _370 => _370(symbol), 'access', _371 => _371.symbol, 'optionalAccess', _372 => _372.declarations]), () => ( []));
          const isClassDeclaration = declarations.find((l) => l.kind === _typescript2.default.SyntaxKind.InterfaceDeclaration || l.kind === _typescript2.default.SyntaxKind.ClassDeclaration);
          if (isClassDeclaration) {
          } else {
            return this.getIden(identation) + `throwDynamicException(${id.escapedText}, ${parsedArg})
${this.getIden(identation)}return nil`;
          }
        }
        return this.getIden(identation) + `panic(${id.escapedText}(${parsedArg}))${this.LINE_TERMINATOR}`;
      } else if (expression.expression.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
        return this.getIden(identation) + `throwDynamicException(${newExpression}, ${parsedArg})`;
      }
      return super.printThrowStatement(node, identation);
    }
  }
  goWithExprDepth(depth, callback) {
    const previous = this.goExprDepth;
    this.goExprDepth = depth < 1 ? 1 : depth;
    try {
      return callback();
    } finally {
      this.goExprDepth = previous;
    }
  }
  // go/token precedence of the operators this printer can print natively
  // (5 `* / % << >> & &^`, 4 `+ - | ^`, 3 comparisons, 2 `&&`, 1 `||`)
  goOperatorPrecedence(operator) {
    switch (operator) {
      case "*":
      case "/":
      case "%":
      case "<<":
      case ">>":
      case "&":
      case "&^":
        return 5;
      case "+":
      case "-":
      case "|":
      case "^":
        return 4;
      case "==":
      case "!=":
      case "<":
      case "<=":
      case ">":
      case ">=":
        return 3;
      case "&&":
        return 2;
      case "||":
        return 1;
    }
    return 0;
  }
  // the operator string a node is printed as when it stays a Go binary
  // expression, or undefined when the node becomes a helper call or is not
  // binary at all - a primary expression, which walkBinary() never looks into
  goNativeBinaryOperator(node) {
    if (!node || !_typescript2.default.isBinaryExpression(node)) {
      return void 0;
    }
    const kind = node.operatorToken.kind;
    if (kind === _typescript2.default.SyntaxKind.EqualsToken || kind === _typescript2.default.SyntaxKind.PlusEqualsToken || kind === _typescript2.default.SyntaxKind.MinusEqualsToken || kind === _typescript2.default.SyntaxKind.InKeyword || kind === _typescript2.default.SyntaxKind.InstanceOfKeyword || kind in this.binaryExpressionsWrappers) {
      return void 0;
    }
    const operator = this.SupportedKindNames[kind];
    return this.goOperatorPrecedence(operator) > 0 ? operator : void 0;
  }
  // walkBinary(): has4 / has5 / maxProblem of the operator tree that is about
  // to be printed. Operands that stay binary expressions are walked, every
  // other operand is a primary expression and stops the walk - the same
  // boundary go/printer draws for parens and calls.
  goWalkBinary(operator, left, right, rightText) {
    const precedence = this.goOperatorPrecedence(operator);
    let has4 = precedence === 4;
    let has5 = precedence === 5;
    let maxProblem = 0;
    const leftOperator = this.goNativeBinaryOperator(left);
    if (leftOperator !== void 0 && this.goOperatorPrecedence(leftOperator) >= precedence) {
      const info = this.goWalkBinary(leftOperator, left.left, left.right, "");
      has4 = has4 || info.has4;
      has5 = has5 || info.has5;
      maxProblem = Math.max(maxProblem, info.maxProblem);
    }
    const rightOperator = this.goNativeBinaryOperator(right);
    if (rightOperator !== void 0 && this.goOperatorPrecedence(rightOperator) > precedence) {
      const info = this.goWalkBinary(rightOperator, right.left, right.right, "");
      has4 = has4 || info.has4;
      has5 = has5 || info.has5;
      maxProblem = Math.max(maxProblem, info.maxProblem);
    } else if (rightOperator === void 0) {
      const pair = operator + rightText.replace(/^[ \t]+/, "").slice(0, 1);
      if (pair === "/*" || pair === "&&" || pair === "&^") {
        maxProblem = 5;
      } else if (pair === "++" || pair === "--") {
        maxProblem = Math.max(maxProblem, 4);
      }
    }
    return { has4, has5, maxProblem };
  }
  // the separator gofmt puts around a natively printed operator: `' '` keeps
  // the blanks, `''` drops them (go/printer cutoff())
  goBinarySeparator(operator, rightText, left, right) {
    const precedence = this.goOperatorPrecedence(operator);
    if (precedence < 4) {
      return " ";
    }
    const { has4, has5, maxProblem } = this.goWalkBinary(operator, left, right, rightText);
    let cutoff;
    if (maxProblem > 0) {
      cutoff = maxProblem + 1;
    } else if (has4 && has5) {
      cutoff = this.goExprDepth === 1 ? 5 : 4;
    } else {
      cutoff = this.goExprDepth === 1 ? 6 : 4;
    }
    return precedence < cutoff ? " " : "";
  }
  printBinaryExpression(node, identation) {
    const { left, right, operatorToken } = node;
    const customBinaryExp = this.printCustomBinaryExpressionIfAny(node, identation);
    if (customBinaryExp) {
      return customBinaryExp;
    }
    if (operatorToken.kind == _typescript2.default.SyntaxKind.InstanceOfKeyword) {
      return this.printInstanceOfExpression(node, identation);
    }
    if (operatorToken.kind === _typescript2.default.SyntaxKind.EqualsToken) {
      const elementAccess = left;
      const rightSide = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, 0));
      if (left.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
        const leftSide = this.printNode(elementAccess.expression, 0);
        const propName = this.printNode(elementAccess.argumentExpression, 0);
        const value = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation)).trimStart();
        const native = this.printNativeElementAssignment(elementAccess.expression, leftSide, elementAccess.argumentExpression, propName, value);
        if (native !== void 0) {
          return native;
        }
        return `AddElementToObject(${leftSide}, ${propName}, ${value})`;
      }
      if (_optionalChain([right, 'optionalAccess', _373 => _373.kind]) === _typescript2.default.SyntaxKind.AwaitExpression || rightSide.startsWith("<-this.callInternal")) {
        const leftParsed = this.printNode(left, 0);
        const awaited = _optionalChain([right, 'optionalAccess', _374 => _374.kind]) === _typescript2.default.SyntaxKind.AwaitExpression ? this.printNode(right, identation) : rightSide;
        return `
${this.getIden(identation)}${leftParsed} = ${awaited}
${this.getIden(identation)}PanicOnError(${leftParsed})`;
      }
    }
    const op = operatorToken.kind;
    if (op === _typescript2.default.SyntaxKind.EqualsToken && left.kind === _typescript2.default.SyntaxKind.ArrayLiteralExpression) {
      const arrayBindingPatternElements = left.elements;
      const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e, 0));
      const syntheticName = parsedArrayBindingElements.join("") + "Variable";
      let arrayBindingStatement = `${syntheticName} := ${this.printNode(right, 0)}
`;
      parsedArrayBindingElements.forEach((e, index) => {
        const leftElement = arrayBindingPatternElements[index];
        const leftType = this.getChecker().getTypeAtLocation(leftElement);
        const parsedType = this.getTypeFromRawType(leftType);
        const castExp = parsedType ? `(${parsedType})` : "";
        const statement = this.getIden(identation) + `${e} = GetValue(${syntheticName}, ${index})`;
        if (index < parsedArrayBindingElements.length - 1) {
          arrayBindingStatement += statement + "\n";
        } else {
          arrayBindingStatement += statement;
        }
      });
      return arrayBindingStatement;
    }
    let operator = this.SupportedKindNames[operatorToken.kind];
    let leftVar = void 0;
    let rightVar = void 0;
    if (operatorToken.kind === _typescript2.default.SyntaxKind.EqualsEqualsToken || operatorToken.kind === _typescript2.default.SyntaxKind.EqualsEqualsEqualsToken) {
      if (this.COMPARISON_WRAPPER_OPEN) {
        leftVar = this.printNode(left, 0);
        rightVar = this.printNode(right, identation);
        return `${this.COMPARISON_WRAPPER_OPEN}${leftVar}, ${rightVar}${this.COMPARISON_WRAPPER_CLOSE}`;
      }
    }
    if (operatorToken.kind === _typescript2.default.SyntaxKind.BarBarToken || operatorToken.kind === _typescript2.default.SyntaxKind.AmpersandAmpersandToken) {
      leftVar = this.printCondition(left, 0);
      rightVar = this.printCondition(right, identation);
      if (operatorToken.kind === _typescript2.default.SyntaxKind.AmpersandAmpersandToken) {
        const collapsed = this.goDropRedundantNilGuard(leftVar.trim(), rightVar.trim());
        if (collapsed !== void 0) {
          return collapsed;
        }
      }
    } else {
      const precedence = this.goOperatorPrecedence(operator);
      if (precedence > 0) {
        const leftOperator = this.goNativeBinaryOperator(left);
        const samePrecedence = leftOperator !== void 0 && this.goOperatorPrecedence(leftOperator) === precedence;
        const leftDepth = samePrecedence ? this.goExprDepth : this.goExprDepth + 1;
        leftVar = this.goWithExprDepth(leftDepth, () => this.printNode(left, 0));
        rightVar = this.goWithExprDepth(this.goExprDepth + 1, () => this.printNode(right, identation));
      } else {
        leftVar = this.printNode(left, 0);
        rightVar = this.printNode(right, identation);
      }
    }
    const customOperator = this.getCustomOperatorIfAny(left, right, operatorToken);
    operator = customOperator ? customOperator : operator;
    const separator = this.goBinarySeparator(operator, rightVar.trim(), left, right);
    return leftVar + separator + operator + separator + rightVar.trim();
  }
  // `(x != nil) && (x != nil && …)` -> `(x != nil && …)`. Only fires when the
  // right operand opens with the very same nil guard the left operand *is*, so
  // the left is implied and dropping it cannot change the result.
  goDropRedundantNilGuard(leftVar, rightVar) {
    const guard = /^\(([A-Za-z_]\w*) != nil\)$/.exec(leftVar);
    if (guard === null) {
      return void 0;
    }
    if (rightVar.startsWith(`(${guard[1]} != nil && `)) {
      return rightVar;
    }
    return void 0;
  }
  printTryStatement(node, identation) {
    let tryBody = node.tryBlock.statements.map((s) => {
      return this.printNode(s, identation + 1);
    }).join("\n");
    tryBody = tryBody.replaceAll(/(\s*)break\s*$/gm, '$1panic("break")');
    const catchBody = node.catchClause.block.statements.map((s) => this.printNode(s, identation + 1)).join("\n");
    const catchLines = catchBody.split("\n").map((l) => l.trim()).filter(Boolean);
    const catchLastLine = catchLines.length ? catchLines[catchLines.length - 1] : "";
    const catchBodyEndsWithReturn = catchLastLine.startsWith("return") || catchLastLine.startsWith("panic") || catchLastLine.startsWith("throw new") || this.blockEndsWithConditionalReturn(node.catchClause.block.statements);
    const tryLines = tryBody.split("\n").map((l) => l.trim()).filter(Boolean);
    const tryLastLine = tryLines.length ? tryLines[tryLines.length - 1] : "";
    const tryBodyEndsWithReturn = tryLastLine.startsWith("return") || tryLastLine.startsWith("panic") || tryLastLine.startsWith("throw new") || this.blockEndsWithConditionalReturn(node.tryBlock.statements);
    const returNil = "return nil";
    const isVoid = this.isInsideVoidFunction(node);
    const nodeEndsWithReturn = tryBodyEndsWithReturn && catchBodyEndsWithReturn && !isVoid;
    const errorName = node.catchClause.variableDeclaration.name.escapedText;
    const classPrefix = this.className !== "undefined" ? `(this *${this.className})` : "()";
    const thisWord = this.className !== "undefined" ? "this" : "";
    const catchBodyBlock = this.indentBlock(catchBody, "					");
    const tryBodyBlock = this.indentBlock(tryBody, "		");
    const catchBlock = `
{
	${nodeEndsWithReturn ? "ret__ := " : ""}func${classPrefix} (ret_ any) {
		defer func() {
			if ${errorName} := recover(); ${errorName} != nil {
				if ${errorName} == "break" {
					return
				}
				ret_ = func${classPrefix} any {
					// catch block:
${catchBodyBlock}
					${catchBodyEndsWithReturn ? "" : returNil}
				}(${thisWord})
			}
		}()
		// try block:
${tryBodyBlock}
		${tryBodyEndsWithReturn ? "" : returNil}
	}(${thisWord})
	${nodeEndsWithReturn ? `if ret__ != nil {
		return ret__
	}
	return nil` : ""}
}`;
    const indentedBlock = catchBlock.split("\n").map((line) => line.trim().length ? this.getIden(identation) + line : "").join("\n");
    return indentedBlock;
  }
  /**
   * Strip the printer's own leading indentation from every line of a printed
   * statement block so the caller can re-place it at an explicit level. Only the
   * common prefix goes away: relative nesting (one tab per level) is preserved.
   */
  dedentBlock(block) {
    const lines = block.split("\n");
    const indents = lines.filter((line) => line.trim().length > 0).map((line) => line.match(/^[\t ]*/)[0].length);
    const common = indents.length ? Math.min(...indents) : 0;
    return lines.map((line) => line.slice(common)).join("\n");
  }
  /**
   * Re-place a printed statement block at `level` (a run of tabs): the block's own
   * leading indentation is dropped and every non-blank line is prefixed with `level`,
   * so relative nesting (one tab per level) survives the move.
   */
  indentBlock(block, level) {
    return this.dedentBlock(block).split("\n").map((line) => line.trim().length ? level + line : "").join("\n");
  }
  /**
   * gofmt writes blank lines with no whitespace at all. A multi-line statement template
   * opens on a fresh line, so the inherited `getIden(identation) + <statement>` prefix
   * lands on a line that carries nothing else: drop that prefix instead of leaving a
   * whitespace-only line behind. Only blank lines are touched, never printed content.
   */
  stripWhitespaceOnlyLines(block) {
    return block.split("\n").map((line) => line.trim().length ? line : "").join("\n");
  }
  printPrefixUnaryExpression(node, identation) {
    const { operand, operator } = node;
    if (operator === _typescript2.default.SyntaxKind.ExclamationToken) {
      return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
    }
    if (operator === _typescript2.default.SyntaxKind.MinusToken) {
      const printed = this.printNode(node.operand, 0);
      const inlined = this.printInlineOpNeg(node, printed);
      if (inlined !== void 0) {
        return this.getIden(identation) + inlined;
      }
      return this.getIden(identation) + `OpNeg(${printed})`;
    }
    return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printNode(operand, 0);
  }
  printNewExpression(node, identation) {
    let expression = _optionalChain([node, 'access', _375 => _375.expression, 'optionalAccess', _376 => _376.escapedText]);
    expression = expression ? expression : this.printNode(node.expression);
    if (node.arguments.length === 0) {
      return `New${this.capitalize(expression)}()`;
    }
    const args = node.arguments.map((n) => this.printNode(n, identation).trim()).join(", ");
    if (expression.endsWith("Error")) {
      return expression + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
    }
    return "New" + this.capitalize(expression) + this.LEFT_PARENTHESIS + args + this.RIGHT_PARENTHESIS;
  }
  /**
   * Override the default element-access printer with a version that walks the
   * entire `x[y][z]` chain and builds a properly nested sequence of helper
   * calls.  This removes the root cause of the unbalanced-parenthesis bug
   * without any post-processing or regex hacks.
   */
  // The Go static type of `printed` when the printer can name it as a native Go
  // map or slice, undefined while the value stays boxed in `any` (GetValue,
  // Ternary, a parameter, an untyped struct field). Only initializer shapes the
  // printer itself types — object/array literals, helper calls whose Go return
  // type it knows (GO_HELPER_RETURN_TYPES + the ccxt extension), and locals whose
  // declaration got that same concrete type — are reported.
  goIndexableTypeOf(node, printed) {
    if (node === void 0) {
      return void 0;
    }
    switch (node.kind) {
      case _typescript2.default.SyntaxKind.ParenthesizedExpression:
        return this.goIndexableTypeOf(node.expression, printed);
      case _typescript2.default.SyntaxKind.ObjectLiteralExpression:
        return "map[string]any";
      case _typescript2.default.SyntaxKind.ArrayLiteralExpression:
        return "[]any";
      case _typescript2.default.SyntaxKind.CallExpression:
        return this.goTypeOfInitializer(node, printed);
      case _typescript2.default.SyntaxKind.Identifier:
        return this.goDeclaredTypeOfIdentifier(node);
    }
    return void 0;
  }
  // the leftover chain after the first (native) step, still helper-wrapped:
  // `m["a"]["b"]["c"]` prints `GetValue(GetValue(m["a"], "b"), "c")`
  goElementAccessChain(containerStr, keyStrs) {
    let acc = containerStr;
    for (let i = 1; i < keyStrs.length; i++) {
      acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
    }
    return acc;
  }
  // true when the printed key is a Go string, so `m[key]` reads the map with the
  // same key GetValue resolves for a string operand (GetValue parses a non-string
  // key, which on map[string]any just yields nil)
  goKeyIsString(node, printed) {
    if (node === void 0) {
      return false;
    }
    switch (node.kind) {
      case _typescript2.default.SyntaxKind.StringLiteral:
      case _typescript2.default.SyntaxKind.NoSubstitutionTemplateLiteral:
        return true;
      case _typescript2.default.SyntaxKind.Identifier:
        return this.goDeclaredTypeOfIdentifier(node) === "string";
      case _typescript2.default.SyntaxKind.CallExpression:
        return this.goTypeOfInitializer(node, printed) === "string";
    }
    return false;
  }
  // true for `this.<field>` — the one property-access shape whose Go type the
  // printer itself cannot name (the fields live in the hand-written Go structs)
  isGoThisPropertyAccessExpression(node) {
    return _optionalChain([node, 'optionalAccess', _377 => _377.kind]) === _typescript2.default.SyntaxKind.PropertyAccessExpression && _optionalChain([node, 'access', _378 => _378.expression, 'optionalAccess', _379 => _379.kind]) === _typescript2.default.SyntaxKind.ThisKeyword;
  }
  // true when the element access is the target of an assignment: the binary
  // expression printer owns that shape (AddElementToObject / rewritten GetValue
  // chains), a native `x[k]` index there would drop the write
  isGoElementAccessAssignmentTarget(node) {
    const parent = node.parent;
    return _optionalChain([parent, 'optionalAccess', _380 => _380.kind]) === _typescript2.default.SyntaxKind.BinaryExpression && parent.left === node && (parent.operatorToken.kind === _typescript2.default.SyntaxKind.EqualsToken || parent.operatorToken.kind === _typescript2.default.SyntaxKind.PlusEqualsToken);
  }
  printElementAccessExpression(node, identation) {
    const special = this.printElementAccessExpressionExceptionIfAny(node);
    if (special) {
      return special;
    }
    const keys = [];
    let baseExpr = null;
    let current = node;
    while (_typescript2.default.isElementAccessExpression(current)) {
      keys.unshift(current.argumentExpression);
      const expr = current.expression;
      if (!_typescript2.default.isElementAccessExpression(expr)) {
        baseExpr = expr;
        break;
      }
      current = expr;
    }
    const indexDepth = this.goExprDepth + 1;
    const containerStr = this.goWithExprDepth(indexDepth, () => this.printNode(baseExpr, 0));
    const keyStrs = keys.map((k) => this.goWithExprDepth(indexDepth, () => this.printNode(k, 0)));
    if (this.goIndexableTypeOf(baseExpr, containerStr) === "map[string]any") {
      if (this.goKeyIsString(keys[0], keyStrs[0]) && !this.isGoElementAccessAssignmentTarget(node)) {
        return this.goElementAccessChain(`${containerStr}[${keyStrs[0]}]`, keyStrs);
      }
    }
    let acc = containerStr;
    keyStrs.forEach((k) => {
      acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${k}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
    });
    return acc;
  }
  isInsideVoidFunction(node) {
    for (let cur = node.parent; cur; cur = cur.parent) {
      if (_typescript2.default.isFunctionLike(cur)) {
        return cur.type === void 0 || cur.type.kind === _typescript2.default.SyntaxKind.VoidKeyword;
      }
    }
    return true;
  }
  /**
   * Check if a block or statement contains a return statement or throws an error
   */
  hasReturnInBlock(statement) {
    if (_typescript2.default.isBlock(statement)) {
      if (statement.statements.length === 0) {
        return false;
      }
      return this.hasReturnInBlock(statement.statements[statement.statements.length - 1]);
    } else if (_typescript2.default.isReturnStatement(statement)) {
      return true;
    } else if (_typescript2.default.isThrowStatement(statement)) {
      return true;
    } else if (_typescript2.default.isIfStatement(statement)) {
      const ifHasReturn = this.hasReturnInBlock(statement.thenStatement);
      if (statement.elseStatement) {
        const elseHasReturn = this.hasReturnInBlock(statement.elseStatement);
        return ifHasReturn && elseHasReturn;
      }
      return false;
    } else if (_typescript2.default.isTryStatement(statement)) {
      const tryHasReturn = this.hasReturnInBlock(statement.tryBlock);
      const catchHasReturn = this.hasReturnInBlock(statement.catchClause.block);
      return tryHasReturn && catchHasReturn;
    }
    return false;
  }
  /**
   * Check if the last statement in a block is a conditional with returns in all branches
   */
  blockEndsWithConditionalReturn(statements) {
    if (statements.length === 0) {
      return false;
    }
    const lastStatement = statements[statements.length - 1];
    if (_typescript2.default.isIfStatement(lastStatement)) {
      const ifHasReturn = this.hasReturnInBlock(lastStatement.thenStatement);
      if (lastStatement.elseStatement) {
        const elseHasReturn = this.hasReturnInBlock(lastStatement.elseStatement);
        return ifHasReturn && elseHasReturn;
      }
    }
    if (_typescript2.default.isTryStatement(lastStatement)) {
      const tryHasReturn = this.hasReturnInBlock(lastStatement.tryBlock);
      const catchHasReturn = this.hasReturnInBlock(lastStatement.catchClause.block);
      return tryHasReturn && catchHasReturn;
    }
    return false;
  }
};

// src/javaTranspiler.ts
init_cjs_shims();

var parserConfig5 = {
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
  VAR_TOKEN: "Object",
  // Java 10+ local var
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
  ELEMENT_ACCESS_WRAPPER_OPEN: "Helpers.GetValue(",
  ELEMENT_ACCESS_WRAPPER_CLOSE: ")",
  INFER_VAR_TYPE: false,
  INFER_ARG_TYPE: false
};
var JAVA_ASSIGNMENT_OPERATOR_KINDS = (() => {
  const kinds = _typescript2.default.SyntaxKind;
  const names = Object.keys(kinds).filter((name) => name.endsWith("EqualsToken") && !/^Equals|^Exclamation|^LessThan|^GreaterThan/.test(name));
  return new Set(["EqualsToken"].concat(names).map((name) => kinds[name]).filter((kind) => kind !== void 0));
})();
var JavaTranspiler = class extends BaseTranspiler {
  constructor(config = {}) {
    config["parser"] = Object.assign({}, parserConfig5, _nullishCoalesce(config["parser"], () => ( {})));
    super(config);
    this.varListFromObjectLiterals = {};
    // binary operators whose printed Java is a primitive boolean: Helpers.isEqual (and the
    // negated `!Helpers.isEqual` / `<` / `>` / `<=` / `>=` family), Helpers.inOp,
    // Helpers.isInstance and the native `&&` / `||`
    this.javaBooleanOperators = [
      _typescript2.default.SyntaxKind.EqualsEqualsToken,
      _typescript2.default.SyntaxKind.EqualsEqualsEqualsToken,
      _typescript2.default.SyntaxKind.ExclamationEqualsToken,
      _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken,
      _typescript2.default.SyntaxKind.LessThanToken,
      _typescript2.default.SyntaxKind.LessThanEqualsToken,
      _typescript2.default.SyntaxKind.GreaterThanToken,
      _typescript2.default.SyntaxKind.GreaterThanEqualsToken,
      _typescript2.default.SyntaxKind.AmpersandAmpersandToken,
      _typescript2.default.SyntaxKind.BarBarToken,
      _typescript2.default.SyntaxKind.InKeyword,
      _typescript2.default.SyntaxKind.InstanceOfKeyword
    ];
    // Per-function analysis results. Populated by analyzeFinalVars at the start of
    // printFunctionBody and consumed during printing of the same function body.
    this.usageToFinalName = /* @__PURE__ */ new WeakMap();
    // Stack of emitted-finalName sets, one entry per enclosing block. Pushed on block
    // entry, popped on exit. Used by buildFinalVarDeclarations to dedup: skip if the
    // finalName is already in scope via any ancestor.
    this.finalVarScopeStack = [];
    // Identifiers rewritten in place to their finalXxx name during the current emit.
    // The parsed ts.SourceFile is cached and reused across transpile calls, so the
    // rewrite has to be undone when the emit ends — otherwise a second emit of the
    // same file reads `finalX` where the first read `x`, the symbol no longer
    // resolves, and the hoisted `final Object finalX = x;` declaration is dropped
    // while its usages remain.
    this.finalVarMutations = [];
    // Java expression passed as the second supplyAsync argument for async methods.
    // Empty (the default) emits the single-argument, common-pool supplyAsync form.
    this.asyncExecutor = "";
    // Static method emitted in place of java.util.concurrent.CompletableFuture.supplyAsync
    // for async methods. The callee owns the executor choice, so no second argument is emitted.
    this.asyncSupplier = "";
    this.csModifiers = {};
    this.requiresParameterType = true;
    this.requiresReturnType = true;
    this.asyncTranspiling = true;
    this.implicitAsyncTranspiling = true;
    this.supportsFalsyOrTruthyValues = false;
    this.requiresCallExpressionCast = true;
    this.id = "Java";
    this.initConfig();
    this.applyUserOverrides(config);
    this.asyncExecutor = _nullishCoalesce(config["asyncExecutor"], () => ( ""));
    this.asyncSupplier = _nullishCoalesce(config["asyncSupplier"], () => ( ""));
  }
  countRequiredParameters(declaration) {
    const params = _nullishCoalesce(_optionalChain([declaration, 'optionalAccess', _381 => _381.parameters]), () => ( []));
    let required = 0;
    for (const p of params) {
      if (p.initializer === void 0 && p.questionToken === void 0 && p.dotDotDotToken === void 0) {
        required++;
      }
    }
    return required;
  }
  printArgsForCallExpression(node, identation) {
    let args = _nullishCoalesce(node.arguments, () => ( []));
    const callee = node.expression;
    const isThisCall = _optionalChain([callee, 'optionalAccess', _382 => _382.kind]) === _typescript2.default.SyntaxKind.PropertyAccessExpression && _optionalChain([callee, 'access', _383 => _383.expression, 'optionalAccess', _384 => _384.kind]) === _typescript2.default.SyntaxKind.ThisKeyword;
    if (isThisCall && args.length > 0) {
      const last = args[args.length - 1];
      const isNullish = last.kind === _typescript2.default.SyntaxKind.NullKeyword || last.kind === _typescript2.default.SyntaxKind.Identifier && last.escapedText === "undefined";
      let inOptionalTail = false;
      if (isNullish) {
        const signature = this.getChecker().getResolvedSignature(node);
        const declaration = _optionalChain([signature, 'optionalAccess', _385 => _385.declaration]);
        if (declaration !== void 0) {
          inOptionalTail = args.length > this.countRequiredParameters(declaration);
        }
      }
      if (isNullish && inOptionalTail) {
        args = args.slice(0, -1);
      }
    }
    return args.map((a) => this.printNode(a, identation).trim()).join(", ");
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
      toString: "toString"
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
      "Math.pow": "Math.pow"
      // 'Promise.all' handled via promiseAll wrapper
    };
    this.CallExpressionReplacements = {
      "parseInt": "Helpers.parseInt",
      "parseFloat": "Helpers.parseFloat"
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
      native: "nativeVar"
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
      object: "Object"
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
      object: "Object"
    };
    this.binaryExpressionsWrappers = {
      [_typescript2.default.SyntaxKind.EqualsEqualsToken]: [
        this.EQUALS_EQUALS_WRAPPER_OPEN,
        this.EQUALS_EQUALS_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.EqualsEqualsEqualsToken]: [
        this.EQUALS_EQUALS_WRAPPER_OPEN,
        this.EQUALS_EQUALS_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.ExclamationEqualsToken]: [
        this.DIFFERENT_WRAPPER_OPEN,
        this.DIFFERENT_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken]: [
        this.DIFFERENT_WRAPPER_OPEN,
        this.DIFFERENT_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.GreaterThanToken]: [
        this.GREATER_THAN_WRAPPER_OPEN,
        this.GREATER_THAN_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.GreaterThanEqualsToken]: [
        this.GREATER_THAN_EQUALS_WRAPPER_OPEN,
        this.GREATER_THAN_EQUALS_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.LessThanToken]: [
        this.LESS_THAN_WRAPPER_OPEN,
        this.LESS_THAN_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.LessThanEqualsToken]: [
        this.LESS_THAN_EQUALS_WRAPPER_OPEN,
        this.LESS_THAN_EQUALS_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.PlusToken]: [
        this.PLUS_WRAPPER_OPEN,
        this.PLUS_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.MinusToken]: [
        this.MINUS_WRAPPER_OPEN,
        this.MINUS_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.AsteriskToken]: [
        this.MULTIPLY_WRAPPER_OPEN,
        this.MULTIPLY_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.PercentToken]: [
        this.MOD_WRAPPER_OPEN,
        this.MOD_WRAPPER_CLOSE
      ],
      [_typescript2.default.SyntaxKind.SlashToken]: [
        this.DIVIDE_WRAPPER_OPEN,
        this.DIVIDE_WRAPPER_CLOSE
      ]
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
    return "";
  }
  printNumericLiteral(node) {
    const javaMax = 2147483647;
    const nodeText = node.text;
    if (Number(nodeText) > javaMax && Number.isInteger(Number(nodeText)) && node.text.indexOf("e") === -1) {
      return `${nodeText}L`;
    }
    return node.text;
  }
  printIdentifier(node) {
    let idValue = _nullishCoalesce(node.text, () => ( node.escapedText));
    if (this.ReservedKeywordsReplacements[idValue]) {
      idValue = this.ReservedKeywordsReplacements[idValue];
    }
    if (idValue === "undefined") {
      return this.UNDEFINED_TOKEN;
    }
    const isInsideNewExpression = _optionalChain([node, 'optionalAccess', _386 => _386.parent, 'optionalAccess', _387 => _387.kind]) === _typescript2.default.SyntaxKind.NewExpression;
    const isInsideCatch = _optionalChain([node, 'optionalAccess', _388 => _388.parent, 'optionalAccess', _389 => _389.kind]) === _typescript2.default.SyntaxKind.ThrowStatement;
    const isLeftSide = _optionalChain([node, 'optionalAccess', _390 => _390.parent, 'optionalAccess', _391 => _391.name]) === node || _optionalChain([node, 'optionalAccess', _392 => _392.parent, 'optionalAccess', _393 => _393.left]) === node;
    const isCallOrPropertyAccess = _optionalChain([node, 'optionalAccess', _394 => _394.parent, 'optionalAccess', _395 => _395.kind]) === _typescript2.default.SyntaxKind.PropertyAccessExpression || _optionalChain([node, 'optionalAccess', _396 => _396.parent, 'optionalAccess', _397 => _397.kind]) === _typescript2.default.SyntaxKind.ElementAccessExpression;
    if (!isLeftSide && !isCallOrPropertyAccess && !isInsideCatch && !isInsideNewExpression) {
      const type = this.getChecker().getTypeAtLocation(node);
      const typeSymbol = _optionalChain([type, 'optionalAccess', _398 => _398.symbol]);
      if (typeSymbol !== void 0) {
        const decl = _nullishCoalesce(_optionalChain([typeSymbol, 'optionalAccess', _399 => _399.declarations]), () => ( []));
        let isBuiltIn = void 0;
        if (decl.length > 0) {
          isBuiltIn = decl[0].getSourceFile().fileName.indexOf("typescript") > -1;
        }
        if (isBuiltIn !== void 0 && !isBuiltIn) {
          const symbol = this.getChecker().getSymbolAtLocation(node);
          let isClassDeclaration = false;
          if (symbol) {
            const first = symbol.declarations[0];
            if (first.kind === _typescript2.default.SyntaxKind.ClassDeclaration) {
              isClassDeclaration = true;
            }
            if (first.kind === _typescript2.default.SyntaxKind.ImportSpecifier) {
              const importedSymbol = this.getChecker().getAliasedSymbol(symbol);
              if (_optionalChain([importedSymbol, 'optionalAccess', _400 => _400.declarations, 'access', _401 => _401[0], 'optionalAccess', _402 => _402.kind]) === _typescript2.default.SyntaxKind.ClassDeclaration) {
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
    let superCallParams = "";
    let hasSuperCall = false;
    _optionalChain([node, 'access', _403 => _403.body, 'optionalAccess', _404 => _404.statements, 'access', _405 => _405.forEach, 'call', _406 => _406((statement) => {
      if (_typescript2.default.isExpressionStatement(statement)) {
        const expression = statement.expression;
        if (_typescript2.default.isCallExpression(expression)) {
          const expressionText = expression.expression.getText().trim();
          if (expressionText === "super") {
            hasSuperCall = true;
            superCallParams = expression.arguments.map((a) => {
              return this.printNode(a, identation).trim();
            }).join(", ");
          }
        }
      }
    })]);
    const header = this.getIden(identation) + className + "(" + args + ")";
    if (!hasSuperCall) {
      return header + constructorBody;
    }
    const injected = this.injectLeadingInBody(constructorBody, `super(${superCallParams});`);
    return header + injected;
  }
  injectLeadingInBody(body, firstLine) {
    const lines = body.split("\n");
    if (lines.length >= 2) {
      lines.splice(1, 0, this.getIden(1) + firstLine);
    }
    return lines.join("\n");
  }
  printDynamicCall(node, identation) {
    const elementAccess = node.expression;
    if (_optionalChain([elementAccess, 'optionalAccess', _407 => _407.kind]) === _typescript2.default.SyntaxKind.ElementAccessExpression) {
      const parsedArg = _optionalChain([node, 'access', _408 => _408.arguments, 'optionalAccess', _409 => _409.length]) > 0 ? node.arguments.map((n) => this.printNode(n, identation).trimStart()).join(", ") : "";
      const target = this.printNode(elementAccess.expression, 0);
      const propName = this.printNode(elementAccess.argumentExpression, 0);
      const argsArray = `new Object[] { ${parsedArg} }`;
      const open = this.DYNAMIC_CALL_OPEN;
      return `${open}${target}, ${propName}, ${argsArray})`;
    }
    return void 0;
  }
  getExpressionStatementPrefixesIfAny(node, identation) {
    const finalVars = [];
    if (_optionalChain([node, 'access', _410 => _410.expression, 'optionalAccess', _411 => _411.kind]) === _typescript2.default.SyntaxKind.CallExpression) {
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
    return void 0;
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
    if (_optionalChain([type, 'optionalAccess', _412 => _412.declaration]) === void 0) {
      let parsedArguments = _optionalChain([node, 'access', _413 => _413.arguments, 'optionalAccess', _414 => _414.map, 'call', _415 => _415((a) => this.printNode(a, 0)), 'access', _416 => _416.join, 'call', _417 => _417(", ")]);
      parsedArguments = parsedArguments ? parsedArguments : "";
      const propName = _optionalChain([node, 'access', _418 => _418.expression, 'optionalAccess', _419 => _419.name, 'access', _420 => _420.escapedText]);
      const isAsyncDecl = _optionalChain([node, 'optionalAccess', _421 => _421.parent, 'optionalAccess', _422 => _422.kind]) === _typescript2.default.SyntaxKind.AwaitExpression;
      const argsArray = `new Object[] { ${parsedArguments} }`;
      const open = this.DYNAMIC_CALL_OPEN;
      const statement = `${open}this, "${propName}", ${argsArray})`;
      return statement;
    }
    return void 0;
  }
  printOutOfOrderCallExpressionIfAny(node, identation) {
    if (node.expression.kind === _typescript2.default.SyntaxKind.PropertyAccessExpression) {
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
      const leftSide = _optionalChain([node, 'access', _423 => _423.expression, 'optionalAccess', _424 => _424.expression]);
      const leftSideText = leftSide ? this.printNode(leftSide, 0) : void 0;
      if (leftSideText === this.THIS_TOKEN || leftSide.getFullText().indexOf("(this as any)") > -1) {
        const res = this.printWrappedUnknownThisProperty(node);
        if (res)
          return res;
      }
    }
    if (node.expression.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
      return this.printDynamicCall(node, identation);
    }
    return void 0;
  }
  handleTypeOfInsideBinaryExpression(node, _identation) {
    const left = node.left;
    const right = node.right.text;
    const op = node.operatorToken.kind;
    const expression = left.expression;
    const isDifferentOperator = op === _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken || op === _typescript2.default.SyntaxKind.ExclamationEqualsToken;
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
        return `${notOperator}(${target} instanceof java.util.concurrent.Callable)`;
    }
    return void 0;
  }
  getVarMethodIfAny(node) {
    let current = _optionalChain([node, 'optionalAccess', _425 => _425.parent]);
    while (current) {
      if (_typescript2.default.isMethodDeclaration(current) || _typescript2.default.isFunctionDeclaration(current)) {
        return String(_nullishCoalesce(_optionalChain([current, 'access', _426 => _426.name, 'optionalAccess', _427 => _427.escapedText]), () => ( "")));
      }
      current = current.parent;
    }
    return "outsideAnyMethod";
  }
  getVarClassIfAny(node) {
    let current = _optionalChain([node, 'optionalAccess', _428 => _428.parent]);
    while (current) {
      if (_typescript2.default.isClassDeclaration(current)) {
        return String(_nullishCoalesce(_optionalChain([current, 'access', _429 => _429.name, 'optionalAccess', _430 => _430.escapedText]), () => ( "")));
      }
      current = current.parent;
    }
    return "";
  }
  getVarKey(node) {
    const varName = _nullishCoalesce(_optionalChain([node, 'optionalAccess', _431 => _431.escapedText]), () => ( _optionalChain([node, 'optionalAccess', _432 => _432.name, 'optionalAccess', _433 => _433.escapedText])));
    if (!varName) {
      return "";
    }
    return `${this.getVarClassIfAny(node)}-${this.getVarMethodIfAny(node)}-${varName}`;
  }
  // Static operand family of one side of an equality, undefined when the checker proves
  // nothing usable. Null/undefined union members are folded away: Objects.equals handles
  // those exactly like the helper, so `string | undefined` still counts as string.
  equalityOperandFamily(type) {
    if (type === void 0 || type === null) {
      return void 0;
    }
    const flags = type.flags;
    if (flags & _typescript2.default.TypeFlags.Intersection) {
      return void 0;
    }
    if (flags & _typescript2.default.TypeFlags.Union) {
      if (flags & _typescript2.default.TypeFlags.Boolean) {
        return "boolean";
      }
      const families = new Set((_nullishCoalesce(type.types, () => ( []))).map((t) => this.equalityOperandFamily(t)));
      families.delete(void 0);
      families.delete("null");
      return families.size === 1 ? families.values().next().value : void 0;
    }
    if (flags & (_typescript2.default.TypeFlags.String | _typescript2.default.TypeFlags.StringLiteral)) {
      return "string";
    }
    if (flags & (_typescript2.default.TypeFlags.Boolean | _typescript2.default.TypeFlags.BooleanLiteral)) {
      return "boolean";
    }
    if (flags & (_typescript2.default.TypeFlags.Null | _typescript2.default.TypeFlags.Undefined | _typescript2.default.TypeFlags.Void)) {
      return "null";
    }
    return void 0;
  }
  // The null/undefined literal: its Java text is `null`, so Objects.equals(x, null)
  // is literally the identity test Helpers.isEqual performs on that operand.
  isNullishLiteral(node) {
    return _optionalChain([node, 'optionalAccess', _434 => _434.kind]) === _typescript2.default.SyntaxKind.NullKeyword || _optionalChain([node, 'optionalAccess', _435 => _435.kind]) === _typescript2.default.SyntaxKind.Identifier && node.escapedText === "undefined";
  }
  // ==/===/!=/!== become java.util.Objects.equals once the checker proves one operand is
  // a string, a boolean or the null/undefined literal: for those Helpers.isEqual reduces
  // to Objects.equals (value compare, class-strict, no numeric promotion). Numbers stay.
  printNativeEqualityIfProvable(node, leftText, rightText) {
    const op = node.operatorToken.kind;
    const negated = op === _typescript2.default.SyntaxKind.ExclamationEqualsToken || op === _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken;
    if (!negated && op !== _typescript2.default.SyntaxKind.EqualsEqualsToken && op !== _typescript2.default.SyntaxKind.EqualsEqualsEqualsToken) {
      return void 0;
    }
    const checker = this.getChecker();
    const leftFamily = this.equalityOperandFamily(_optionalChain([checker, 'optionalAccess', _436 => _436.getTypeAtLocation, 'call', _437 => _437(node.left)]));
    const rightFamily = this.equalityOperandFamily(_optionalChain([checker, 'optionalAccess', _438 => _438.getTypeAtLocation, 'call', _439 => _439(node.right)]));
    const leftProved = leftFamily !== void 0 && (leftFamily !== "null" || this.isNullishLiteral(node.left));
    const rightProved = rightFamily !== void 0 && (rightFamily !== "null" || this.isNullishLiteral(node.right));
    if (!leftProved && !rightProved) {
      return void 0;
    }
    const equalCall = `java.util.Objects.equals(${leftText}, ${rightText})`;
    return negated ? `!${equalCall}` : equalCall;
  }
  // `x[k] = v` prints the runtime helper by default. Helpers.addElementToObject
  // exists for receivers the printer cannot type (Lists, arbitrary objects via
  // reflection) and for ConcurrentHashMap null-removal, so the native Map.put is
  // printed only when the checker excludes all of those.
  elementWriteTargetsMap(container, base, keys) {
    if (!_typescript2.default.isStringLiteral(keys[keys.length - 1])) {
      return false;
    }
    if (_typescript2.default.isPropertyAccessExpression(base) && base.expression.kind === _typescript2.default.SyntaxKind.ThisKeyword) {
      return false;
    }
    return this.isDictionaryType(container);
  }
  isDictionaryType(node) {
    try {
      const checker = this.getChecker();
      const type = checker.getTypeAtLocation(node);
      return this.isDictionaryTsType(type, checker, 0);
    } catch (e) {
      return false;
    }
  }
  // A TS dictionary (`{ [key: string]: any }`, i.e. ccxt's Dict) is a Map on every
  // print and run path. Arrays, class instances and unknown types are not, so they
  // keep the helper.
  isDictionaryTsType(type, checker, depth) {
    if (!type || depth > 3) {
      return false;
    }
    const flags = type.flags;
    if (flags & _typescript2.default.TypeFlags.Union) {
      const parts = _nullishCoalesce(type.types, () => ( []));
      return parts.length > 0 && parts.every((t) => this.isDictionaryTsType(t, checker, depth + 1));
    }
    if (!(flags & _typescript2.default.TypeFlags.Object)) {
      return false;
    }
    try {
      if (checker.isArrayType(type) || checker.isTupleType(type)) {
        return false;
      }
      return checker.getIndexTypeOfType(type, _typescript2.default.IndexKind.String) !== void 0;
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
    if (!node || !_typescript2.default.isNumericLiteral(node)) {
      return void 0;
    }
    const text = node.text;
    if (text.indexOf(".") !== -1 || text.indexOf("e") !== -1 || text.indexOf("E") !== -1) {
      return void 0;
    }
    return Number(text) > 2147483647 ? "long" : "int";
  }
  // A rest parameter is a Java varargs array, not a List, so a List cast on it
  // would throw ClassCastException; simple identifier aliases are followed too.
  isVarargsArrayReference(node, depth = 0) {
    if (!node || depth > 4 || node.kind !== _typescript2.default.SyntaxKind.Identifier) {
      return false;
    }
    const symbol = this.getChecker().getSymbolAtLocation(node);
    const declaration = _nullishCoalesce(_optionalChain([symbol, 'optionalAccess', _440 => _440.valueDeclaration]), () => ( _optionalChain([symbol, 'optionalAccess', _441 => _441.declarations, 'optionalAccess', _442 => _442[0]])));
    if (!declaration) {
      return false;
    }
    if (declaration.dotDotDotToken !== void 0) {
      return true;
    }
    const initializer = declaration.initializer;
    if (initializer && _typescript2.default.isIdentifier(initializer)) {
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
    return _optionalChain([type, 'access', _443 => _443.target, 'optionalAccess', _444 => _444.symbol, 'optionalAccess', _445 => _445.escapedName]) === "ReadonlyArray";
  }
  // `.length` is a Java int for exactly these two receivers; every other
  // receiver keeps Helpers.getArrayLength, whose result type is not proven
  javaLengthKind(expression) {
    const type = this.getChecker().getTypeAtLocation(expression);
    if (this.isStringType(type.flags)) {
      return "String";
    }
    if (this.isJavaListType(type) && !this.isVarargsArrayReference(expression)) {
      return "List";
    }
    return void 0;
  }
  // shared by printLengthProperty and transformPropertyAcessExpressionIfNeeded
  printJavaLength(expression, leftSide) {
    const kind = this.javaLengthKind(expression);
    if (kind === "String") {
      return `((String)${leftSide}).length()`;
    }
    if (kind === "List") {
      return `((java.util.List<?>)${leftSide}).size()`;
    }
    return `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`;
  }
  // `for (var i = <int literal>; ...; i++)`: printForStatement rewrites the
  // Object initializer into `var`, so javac infers a primitive counter there,
  // and only ++/-- writes keep it primitive
  isJavaPrimitiveForCounter(node) {
    if (node.kind !== _typescript2.default.SyntaxKind.Identifier) {
      return false;
    }
    const comparison = node.parent;
    if (!comparison || comparison.kind !== _typescript2.default.SyntaxKind.BinaryExpression) {
      return false;
    }
    const forStatement = comparison.parent;
    if (!forStatement || forStatement.kind !== _typescript2.default.SyntaxKind.ForStatement || forStatement.condition !== comparison) {
      return false;
    }
    const initializer = forStatement.initializer;
    if (!initializer || initializer.kind !== _typescript2.default.SyntaxKind.VariableDeclarationList) {
      return false;
    }
    const declarations = _nullishCoalesce(initializer.declarations, () => ( []));
    if (declarations.length !== 1) {
      return false;
    }
    const declaration = declarations[0];
    if (!_typescript2.default.isIdentifier(declaration.name) || declaration.name.escapedText !== node.escapedText) {
      return false;
    }
    if (this.javaIntegerLiteralKind(declaration.initializer) === void 0) {
      return false;
    }
    const counterSymbol = this.getChecker().getSymbolAtLocation(node);
    const declarationSymbol = this.getChecker().getSymbolAtLocation(declaration.name);
    if (counterSymbol !== void 0 && declarationSymbol !== void 0 && counterSymbol !== declarationSymbol) {
      return false;
    }
    const incrementor = forStatement.incrementor;
    if (!incrementor || _optionalChain([incrementor, 'access', _446 => _446.operand, 'optionalAccess', _447 => _447.kind]) !== _typescript2.default.SyntaxKind.Identifier || incrementor.operand.escapedText !== node.escapedText) {
      return false;
    }
    return incrementor.kind === _typescript2.default.SyntaxKind.PostfixUnaryExpression || incrementor.kind === _typescript2.default.SyntaxKind.PrefixUnaryExpression;
  }
  // Java primitive kind of a comparison operand; undefined keeps the helper
  javaPrimitiveOperandKind(node) {
    const literalKind = this.javaIntegerLiteralKind(node);
    if (literalKind !== void 0) {
      return literalKind;
    }
    if (this.isJavaPrimitiveForCounter(node)) {
      return "int";
    }
    if (node.kind === _typescript2.default.SyntaxKind.PropertyAccessExpression && node.name.escapedText === "length") {
      return this.javaLengthKind(node.expression) !== void 0 ? "int" : void 0;
    }
    return void 0;
  }
  // checker proof that the value is printed as a java.util.HashMap: TS object
  // shapes (interfaces, object literals, aliases) become HashMaps, while class
  // instances are real Java objects and arrays/unions are not proven here
  isJavaMapType(type) {
    if (!type || (type.flags & _typescript2.default.TypeFlags.Object) === 0) {
      return false;
    }
    const checker = this.getChecker();
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      return false;
    }
    if (type.getCallSignatures().length > 0) {
      return false;
    }
    const declarations = _nullishCoalesce(_optionalChain([type, 'access', _448 => _448.getSymbol, 'call', _449 => _449(), 'optionalAccess', _450 => _450.declarations]), () => ( []));
    return !declarations.some((declaration) => declaration.kind === _typescript2.default.SyntaxKind.ClassDeclaration || declaration.getSourceFile().fileName.indexOf("typescript") > -1);
  }
  // string keys (plain, literal or a union of literals) print as Java Strings
  isJavaStringType(type) {
    if (!type) {
      return false;
    }
    if (this.isStringType(type.flags)) {
      return true;
    }
    if ((type.flags & _typescript2.default.TypeFlags.Union) === 0) {
      return false;
    }
    return type.types.every((member) => this.isStringType(member.flags));
  }
  printCustomBinaryExpressionIfAny(node, identation) {
    const left = node.left;
    const right = node.right;
    const op = node.operatorToken.kind;
    if (left.kind === _typescript2.default.SyntaxKind.Identifier) {
      this.ReassignedVars[this.getVarKey(left)] = true;
    }
    if (left.kind === _typescript2.default.SyntaxKind.TypeOfExpression) {
      const typeOfExpression = this.handleTypeOfInsideBinaryExpression(
        node,
        identation
      );
      if (typeOfExpression)
        return typeOfExpression;
    }
    if (op === _typescript2.default.SyntaxKind.EqualsToken && left.kind === _typescript2.default.SyntaxKind.ArrayLiteralExpression) {
      const arrayBindingPatternElements = left.elements;
      const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => {
        this.ReassignedVars[this.getVarKey(e)] = true;
        return this.printNode(e, 0);
      });
      const syntheticName = parsedArrayBindingElements.join("") + "Variable";
      let arrayBindingStatement = `var ${syntheticName} = ${this.printNode(right, 0)};
`;
      parsedArrayBindingElements.forEach((e, index) => {
        const statement = this.getIden(identation) + `${e} = ((java.util.List<Object>) ${syntheticName}).get(${index})`;
        if (index < parsedArrayBindingElements.length - 1) {
          arrayBindingStatement += statement + ";\n";
        } else {
          arrayBindingStatement += statement;
        }
      });
      return arrayBindingStatement;
    }
    if (op === _typescript2.default.SyntaxKind.EqualsToken && left.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
      const keys = [];
      let baseExpr = null;
      let cur = left;
      while (_typescript2.default.isElementAccessExpression(cur)) {
        keys.unshift(cur.argumentExpression);
        const expr = cur.expression;
        if (!_typescript2.default.isElementAccessExpression(expr)) {
          baseExpr = expr;
          break;
        }
        cur = expr;
      }
      const containerStr = this.printNode(baseExpr, 0);
      const keyStrs = keys.map((k) => this.printNode(k, 0));
      let acc = containerStr;
      for (let i = 0; i < keyStrs.length - 1; i++) {
        acc = `${this.ELEMENT_ACCESS_WRAPPER_OPEN}${acc}, ${keyStrs[i]}${this.ELEMENT_ACCESS_WRAPPER_CLOSE}`;
      }
      let prefixes = this.getBinaryExpressionPrefixes(node, identation);
      prefixes = prefixes ? prefixes : "";
      const lastKey = keyStrs[keyStrs.length - 1];
      const rhs = this.printNode(right, 0);
      if (this.elementWriteTargetsMap(left.expression, baseExpr, keys)) {
        return `${prefixes}((${this.OBJECT_KEYWORD})${acc}).put(${lastKey}, ${rhs})`;
      }
      return `${prefixes}Helpers.addElementToObject(${acc}, ${lastKey}, ${rhs})`;
    }
    if (op === _typescript2.default.SyntaxKind.InKeyword) {
      const objectType = this.getChecker().getTypeAtLocation(right);
      const keyType = this.getChecker().getTypeAtLocation(left);
      if (this.isJavaMapType(objectType) && this.isJavaStringType(keyType)) {
        return `((java.util.Map<?, ?>)${this.printNode(right, 0)}).containsKey(${this.printNode(left, 0)})`;
      }
      return `Helpers.inOp(${this.printNode(right, 0)}, ${this.printNode(left, 0)})`;
    }
    if (op === _typescript2.default.SyntaxKind.LessThanToken || op === _typescript2.default.SyntaxKind.GreaterThanToken || op === _typescript2.default.SyntaxKind.LessThanEqualsToken || op === _typescript2.default.SyntaxKind.GreaterThanEqualsToken) {
      if (this.javaPrimitiveOperandKind(left) !== void 0 && this.javaPrimitiveOperandKind(right) !== void 0) {
        return `${this.printNode(left, 0)} ${this.SupportedKindNames[op]} ${this.printNode(right, 0)}`;
      }
    }
    if (op === _typescript2.default.SyntaxKind.PlusEqualsToken || op === _typescript2.default.SyntaxKind.MinusEqualsToken || op in this.binaryExpressionsWrappers) {
      const leftText = this.printNode(left, 0);
      const rightText = this.printNode(right, 0);
      const inlined = this.printInlineHelperArithmetic(left, right, leftText, rightText, op);
      if (inlined !== void 0) {
        return inlined;
      }
      if (op === _typescript2.default.SyntaxKind.PlusEqualsToken) {
        return `${leftText} = Helpers.add(${leftText}, ${rightText})`;
      }
      if (op === _typescript2.default.SyntaxKind.MinusEqualsToken) {
        return `${leftText} = Helpers.subtract(${leftText}, ${rightText})`;
      }
      const wrapper = this.binaryExpressionsWrappers[op];
      const nativeEquality = this.printNativeEqualityIfProvable(node, leftText, rightText);
      if (nativeEquality !== void 0) {
        return nativeEquality;
      }
      const open = wrapper[0];
      const close = wrapper[1];
      return `${open}${leftText}, ${rightText}${close}`;
    }
    return void 0;
  }
  // dict-shaped values are Map<String, Object> in the Java port: raw HashMap/ConcurrentHashMap
  // or a types.TypedMap view (AbstractMap<String, Object> over the raw payload). Proven by the
  // checker (string index signature, or an interface/alias declared in the base types file).
  isJavaMapStructureType(type) {
    if (type === void 0) {
      return false;
    }
    const excludedFlags = _typescript2.default.TypeFlags.Any | _typescript2.default.TypeFlags.Unknown | _typescript2.default.TypeFlags.Union | _typescript2.default.TypeFlags.Intersection | _typescript2.default.TypeFlags.Undefined | _typescript2.default.TypeFlags.Null | _typescript2.default.TypeFlags.TypeParameter | _typescript2.default.TypeFlags.Conditional | _typescript2.default.TypeFlags.Never;
    if ((type.flags & excludedFlags) !== 0) {
      return false;
    }
    const checker = this.getChecker();
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      return false;
    }
    if (type.getStringIndexType() !== void 0) {
      return true;
    }
    const symbol = _nullishCoalesce(type.aliasSymbol, () => ( type.symbol));
    const declaration = _optionalChain([symbol, 'optionalAccess', _451 => _451.declarations, 'optionalAccess', _452 => _452[0]]);
    const fileName = _optionalChain([declaration, 'optionalAccess', _453 => _453.getSourceFile, 'optionalCall', _454 => _454(), 'optionalAccess', _455 => _455.fileName]);
    return fileName !== void 0 && /(^|\/)ts\/src\/base\/types\.ts$/.test(fileName);
  }
  // tuples are List<Object> in the Java port (types.TypedList). Only an index inside the
  // tuple's required elements goes native: .get(i) throws out of range where the helper
  // returns null, so non-tuple array reads (any[], string[], ...) keep the helper.
  isJavaListStructureType(type) {
    if (type === void 0) {
      return false;
    }
    const excludedFlags = _typescript2.default.TypeFlags.Any | _typescript2.default.TypeFlags.Unknown | _typescript2.default.TypeFlags.Union | _typescript2.default.TypeFlags.Intersection | _typescript2.default.TypeFlags.Undefined | _typescript2.default.TypeFlags.Null | _typescript2.default.TypeFlags.TypeParameter | _typescript2.default.TypeFlags.Conditional | _typescript2.default.TypeFlags.Never;
    if ((type.flags & excludedFlags) !== 0) {
      return false;
    }
    return this.getChecker().isTupleType(type);
  }
  tupleRequiredElementCount(type) {
    const flags = _nullishCoalesce(_nullishCoalesce(_optionalChain([type, 'optionalAccess', _456 => _456.target, 'optionalAccess', _457 => _457.elementFlags]), () => ( _optionalChain([type, 'optionalAccess', _458 => _458.elementFlags]))), () => ( []));
    let required = 0;
    for (const flag of flags) {
      if (flag !== _typescript2.default.ElementFlags.Optional && flag !== _typescript2.default.ElementFlags.Rest) {
        required++;
      } else {
        break;
      }
    }
    return required;
  }
  isLeftSideOfAssignment(node) {
    const parent = node.parent;
    if (_optionalChain([parent, 'optionalAccess', _459 => _459.kind]) !== _typescript2.default.SyntaxKind.BinaryExpression || parent.left !== node) {
      return false;
    }
    return JAVA_ASSIGNMENT_OPERATOR_KINDS.has(parent.operatorToken.kind);
  }
  // `x[k]` reads: emit the native container accessor when the checker proves the Java
  // representation of `x`, otherwise return undefined so the base prints Helpers.GetValue.
  printCheckerTypedElementAccessRead(node) {
    const key = node.argumentExpression;
    const isStringKey = _typescript2.default.isStringLiteralLike(key);
    const isNumberKey = _typescript2.default.isNumericLiteral(key);
    if (!isStringKey && !isNumberKey) {
      return void 0;
    }
    if (this.printElementAccessExpressionExceptionIfAny(node) !== void 0) {
      return void 0;
    }
    if (this.isLeftSideOfAssignment(node)) {
      return void 0;
    }
    const type = this.getChecker().getTypeAtLocation(node.expression);
    if (isStringKey) {
      if (!this.isJavaMapStructureType(type)) {
        return void 0;
      }
      const target2 = this.printNode(node.expression, 0);
      return `((java.util.Map<String, Object>)${target2}).get(${this.printNode(key, 0)})`;
    }
    if (!this.isJavaListStructureType(type)) {
      return void 0;
    }
    const index = Number(key.text);
    if (!Number.isInteger(index) || index < 0 || index >= this.tupleRequiredElementCount(type)) {
      return void 0;
    }
    const target = this.printNode(node.expression, 0);
    return `((java.util.List<Object>)${target}).get(${this.printNode(key, 0)})`;
  }
  printElementAccessExpression(node, identation) {
    const native = this.printCheckerTypedElementAccessRead(node);
    if (native !== void 0) {
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
  javaScalarFamily(node) {
    let type;
    try {
      type = this.getChecker().getTypeAtLocation(node);
    } catch (e) {
      return void 0;
    }
    if (type === void 0 || type.aliasSymbol !== void 0) {
      return void 0;
    }
    const flags = type.flags;
    if (flags === _typescript2.default.TypeFlags.String || flags === _typescript2.default.TypeFlags.StringLiteral) {
      return "string";
    }
    if (flags === _typescript2.default.TypeFlags.Number || flags === _typescript2.default.TypeFlags.NumberLiteral) {
      return "number";
    }
    return void 0;
  }
  // true when the printed Java for this operand is statically a String: a string
  // literal, or a nested `+` this rule prints as a native concat (so every native
  // concat is anchored by a literal and Java concatenates the other side).
  javaProvableString(node) {
    if (node === void 0) {
      return false;
    }
    switch (node.kind) {
      case _typescript2.default.SyntaxKind.StringLiteral:
      case _typescript2.default.SyntaxKind.NoSubstitutionTemplateLiteral:
        return true;
      case _typescript2.default.SyntaxKind.ParenthesizedExpression:
        return this.javaProvableString(node.expression);
      case _typescript2.default.SyntaxKind.BinaryExpression:
        return this.javaNativeConcat(node);
    }
    return false;
  }
  // does this `+` node print as a native concat (both sides plain string, one side a
  // provable String)? Mirrors printInlineHelperArithmetic so callers can reason about
  // the printed text of a nested concat.
  javaNativeConcat(node) {
    if (_optionalChain([node, 'optionalAccess', _460 => _460.operatorToken, 'optionalAccess', _461 => _461.kind]) !== _typescript2.default.SyntaxKind.PlusToken) {
      return false;
    }
    if (this.javaScalarFamily(node.left) !== "string" || this.javaScalarFamily(node.right) !== "string") {
      return false;
    }
    return this.javaProvableString(node.left) || this.javaProvableString(node.right);
  }
  // the Java kind a numeric operand provably prints with: decimal integer literal ->
  // 'long', fractional literal -> 'double', a nested `+ - * /` this rule prints
  // natively -> that node's kind. Anything else (hex/binary literals, negative
  // literals printed as Helpers.opNeg, calls, identifiers) stays undefined.
  javaProvableNumericKind(node) {
    if (node === void 0) {
      return void 0;
    }
    if (node.kind === _typescript2.default.SyntaxKind.ParenthesizedExpression) {
      return this.javaProvableNumericKind(node.expression);
    }
    if (_typescript2.default.isNumericLiteral(node)) {
      const text = node.text;
      if (/^0[xXbBoO]/.test(text)) {
        return void 0;
      }
      return /[.eE]/.test(text) ? "double" : "long";
    }
    if (node.kind === _typescript2.default.SyntaxKind.BinaryExpression) {
      return this.javaNativeArithmeticKind(node);
    }
    return void 0;
  }
  // the kind of the native arithmetic this rule prints for `+ - * /`, or undefined when
  // the node keeps the helper. Mirrors printInlineHelperArithmetic operand-for-operand
  // so callers can reason about the printed text of a nested arithmetic operand.
  javaNativeArithmeticKind(node) {
    const op = _optionalChain([node, 'optionalAccess', _462 => _462.operatorToken, 'optionalAccess', _463 => _463.kind]);
    const isPlus = op === _typescript2.default.SyntaxKind.PlusToken;
    const isMinus = op === _typescript2.default.SyntaxKind.MinusToken;
    const isMultiply = op === _typescript2.default.SyntaxKind.AsteriskToken;
    const isDivide = op === _typescript2.default.SyntaxKind.SlashToken;
    if (!isPlus && !isMinus && !isMultiply && !isDivide) {
      return void 0;
    }
    if (this.javaScalarFamily(node.left) !== "number" || this.javaScalarFamily(node.right) !== "number") {
      return void 0;
    }
    const leftKind = this.javaProvableNumericKind(node.left);
    const rightKind = this.javaProvableNumericKind(node.right);
    if (leftKind === void 0 || leftKind !== rightKind) {
      return void 0;
    }
    if (isDivide) {
      return "double";
    }
    if (isMultiply && leftKind === "double") {
      return void 0;
    }
    return leftKind;
  }
  // integer literals print as Java `int`; the helpers normalize Integer to Long before
  // the arithmetic, so native integer arithmetic is emitted in long to keep the boxed
  // result identical
  javaPrintOperandAsLong(node, text) {
    if (!_typescript2.default.isNumericLiteral(node) || /[.eE]/.test(node.text)) {
      return text;
    }
    return /L$/.test(text) ? text : text + "L";
  }
  // the native form of a helper-family binary operator, or undefined to keep the helper
  printInlineHelperArithmetic(left, right, leftText, rightText, op) {
    const isPlus = op === _typescript2.default.SyntaxKind.PlusToken || op === _typescript2.default.SyntaxKind.PlusEqualsToken;
    const isMinus = op === _typescript2.default.SyntaxKind.MinusToken || op === _typescript2.default.SyntaxKind.MinusEqualsToken;
    const isMultiply = op === _typescript2.default.SyntaxKind.AsteriskToken;
    const isDivide = op === _typescript2.default.SyntaxKind.SlashToken;
    if (!isPlus && !isMinus && !isMultiply && !isDivide) {
      return void 0;
    }
    const leftFamily = this.javaScalarFamily(left);
    const rightFamily = this.javaScalarFamily(right);
    if (isPlus && leftFamily === "string" && rightFamily === "string") {
      if (!(this.javaProvableString(left) || this.javaProvableString(right))) {
        return void 0;
      }
      const concat = `(${leftText} + ${rightText})`;
      return op === _typescript2.default.SyntaxKind.PlusEqualsToken ? `${leftText} = ${concat}` : concat;
    }
    if (op === _typescript2.default.SyntaxKind.PlusEqualsToken || op === _typescript2.default.SyntaxKind.MinusEqualsToken) {
      return void 0;
    }
    if (leftFamily !== "number" || rightFamily !== "number") {
      return void 0;
    }
    const leftKind = this.javaProvableNumericKind(left);
    const rightKind = this.javaProvableNumericKind(right);
    if (leftKind === void 0 || leftKind !== rightKind) {
      return void 0;
    }
    if (isDivide) {
      return `(((double) ${leftText}) / ((double) ${rightText}))`;
    }
    if (isMultiply && leftKind === "double") {
      return void 0;
    }
    const operator = isPlus ? "+" : isMinus ? "-" : "*";
    return `(${this.javaPrintOperandAsLong(left, leftText)} ${operator} ${this.javaPrintOperandAsLong(right, rightText)})`;
  }
  getObjectLiteralFromCallExpressionArguments(node) {
    const res = [];
    if (!_optionalChain([node, 'optionalAccess', _464 => _464.arguments])) {
      return res;
    }
    const args = node.arguments;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.kind === _typescript2.default.SyntaxKind.ObjectLiteralExpression) {
        res.push(arg);
      } else if (arg.kind === _typescript2.default.SyntaxKind.CallExpression) {
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
  collectCapturingObjectLiterals(node) {
    const found = [];
    const walk = (n) => {
      if (!n)
        return;
      if (n.kind === _typescript2.default.SyntaxKind.ObjectLiteralExpression) {
        found.push(n);
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.FunctionExpression || n.kind === _typescript2.default.SyntaxKind.ArrowFunction || n.kind === _typescript2.default.SyntaxKind.MethodDeclaration || n.kind === _typescript2.default.SyntaxKind.FunctionDeclaration) {
        return;
      }
      _typescript2.default.forEachChild(n, walk);
    };
    walk(node);
    return found;
  }
  getBinaryExpressionPrefixes(node, identation) {
    let right = _optionalChain([node, 'optionalAccess', _465 => _465.right]);
    if (_optionalChain([right, 'optionalAccess', _466 => _466.kind]) === _typescript2.default.SyntaxKind.AwaitExpression) {
      right = right.expression;
    }
    if (!right) {
      return void 0;
    }
    if (right.kind === _typescript2.default.SyntaxKind.ObjectLiteralExpression) {
      const objVariables = this.getVarListFromObjectLiteralAndUpdateInPlace(right);
      if (objVariables.length > 0) {
        const decls = this.buildFinalVarDeclarations(objVariables, identation);
        if (decls) {
          return decls + "\n" + this.getIden(identation);
        }
      }
    } else if (right.kind === _typescript2.default.SyntaxKind.CallExpression) {
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
    return void 0;
  }
  getFinalVarName(varName) {
    if (this.ReservedKeywordsReplacements[varName]) {
      varName = this.ReservedKeywordsReplacements[varName];
    }
    if (varName.startsWith("final")) {
      return varName;
    }
    return `final${this.capitalize(varName)}`;
  }
  getOriginalVarName(name) {
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
  getAsyncParamWrapperNames(paramName) {
    const javaName = this.getOriginalVarName(paramName);
    return {
      sigName: `${javaName}2`,
      snapName: `${javaName}3`,
      localName: javaName
    };
  }
  isAssignmentOperator(op) {
    return op === _typescript2.default.SyntaxKind.EqualsToken || op === _typescript2.default.SyntaxKind.PlusEqualsToken || op === _typescript2.default.SyntaxKind.MinusEqualsToken || op === _typescript2.default.SyntaxKind.AsteriskEqualsToken || op === _typescript2.default.SyntaxKind.AsteriskAsteriskEqualsToken || op === _typescript2.default.SyntaxKind.SlashEqualsToken || op === _typescript2.default.SyntaxKind.PercentEqualsToken || op === _typescript2.default.SyntaxKind.LessThanLessThanEqualsToken || op === _typescript2.default.SyntaxKind.GreaterThanGreaterThanEqualsToken || op === _typescript2.default.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken || op === _typescript2.default.SyntaxKind.AmpersandEqualsToken || op === _typescript2.default.SyntaxKind.BarEqualsToken || op === _typescript2.default.SyntaxKind.CaretEqualsToken || op === _typescript2.default.SyntaxKind.BarBarEqualsToken || op === _typescript2.default.SyntaxKind.AmpersandAmpersandEqualsToken || op === _typescript2.default.SyntaxKind.QuestionQuestionEqualsToken;
  }
  isIncDecOperator(op) {
    return op === _typescript2.default.SyntaxKind.PlusPlusToken || op === _typescript2.default.SyntaxKind.MinusMinusToken;
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
  analyzeFinalVars(fnBody) {
    this.usageToFinalName = /* @__PURE__ */ new WeakMap();
    if (!fnBody)
      return;
    const symbolIdOf = (n) => {
      try {
        const checker = this.getChecker();
        const sym = _optionalChain([checker, 'optionalAccess', _467 => _467.getSymbolAtLocation, 'optionalCall', _468 => _468(n)]);
        const decl = _nullishCoalesce(_optionalChain([sym, 'optionalAccess', _469 => _469.declarations, 'optionalAccess', _470 => _470[0]]), () => ( _optionalChain([sym, 'optionalAccess', _471 => _471.valueDeclaration])));
        if (decl)
          return `s:${decl.pos}:${decl.end}`;
      } catch (e5) {
      }
      return `n:${n.escapedText}`;
    };
    const reassignedSyms = /* @__PURE__ */ new Set();
    const discoverPotentialReassignments = (node) => {
      if (!node)
        return;
      if (node.kind === _typescript2.default.SyntaxKind.BinaryExpression) {
        if (_optionalChain([node, 'access', _472 => _472.left, 'optionalAccess', _473 => _473.kind]) === _typescript2.default.SyntaxKind.Identifier) {
          reassignedSyms.add(symbolIdOf(node.left));
        } else if (node.operatorToken.kind === _typescript2.default.SyntaxKind.EqualsToken && _optionalChain([node, 'access', _474 => _474.left, 'optionalAccess', _475 => _475.kind]) === _typescript2.default.SyntaxKind.ArrayLiteralExpression) {
          for (const elem of _nullishCoalesce(node.left.elements, () => ( []))) {
            if (_optionalChain([elem, 'optionalAccess', _476 => _476.kind]) === _typescript2.default.SyntaxKind.Identifier) {
              reassignedSyms.add(symbolIdOf(elem));
            }
          }
        }
      }
      if ((node.kind === _typescript2.default.SyntaxKind.PrefixUnaryExpression || node.kind === _typescript2.default.SyntaxKind.PostfixUnaryExpression) && this.isIncDecOperator(node.operator) && _optionalChain([node, 'access', _477 => _477.operand, 'optionalAccess', _478 => _478.kind]) === _typescript2.default.SyntaxKind.Identifier) {
        reassignedSyms.add(symbolIdOf(node.operand));
      }
      if (node.kind === _typescript2.default.SyntaxKind.Identifier) {
        const name = node.escapedText;
        if (name && name !== "undefined" && !_optionalChain([name, 'access', _479 => _479.startsWith, 'optionalCall', _480 => _480("null")])) {
          if (this.ReassignedVars[this.getVarKey(node)]) {
            reassignedSyms.add(symbolIdOf(node));
          }
        }
        return;
      }
      _typescript2.default.forEachChild(node, discoverPotentialReassignments);
    };
    discoverPotentialReassignments(fnBody);
    if (reassignedSyms.size === 0)
      return;
    const events = [];
    const visitExprInObjLit = (n) => {
      if (!n)
        return;
      if (n.kind === _typescript2.default.SyntaxKind.Identifier) {
        const name = n.escapedText;
        if (name && name !== "undefined" && !_optionalChain([name, 'access', _481 => _481.startsWith, 'optionalCall', _482 => _482("null")])) {
          const sym = symbolIdOf(n);
          if (reassignedSyms.has(sym)) {
            events.push({ kind: "use", sym, name, node: n });
          }
        }
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.BinaryExpression) {
        visitExprInObjLit(n.left);
        visitExprInObjLit(n.right);
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.ParenthesizedExpression) {
        visitExprInObjLit(n.expression);
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.ConditionalExpression) {
        visitExprInObjLit(n.condition);
        visitExprInObjLit(n.whenTrue);
        visitExprInObjLit(n.whenFalse);
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.CallExpression) {
        _optionalChain([n, 'access', _483 => _483.arguments, 'optionalAccess', _484 => _484.forEach, 'call', _485 => _485(visitExprInObjLit)]);
        if (_optionalChain([n, 'access', _486 => _486.expression, 'optionalAccess', _487 => _487.kind]) === _typescript2.default.SyntaxKind.PropertyAccessExpression) {
          visitExprInObjLit(n.expression.expression);
        }
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.PrefixUnaryExpression) {
        visitExprInObjLit(n.operand);
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
        let left = n.expression;
        while (_optionalChain([left, 'optionalAccess', _488 => _488.kind]) === _typescript2.default.SyntaxKind.ElementAccessExpression) {
          left = left.expression;
        }
        visitExprInObjLit(left);
        visitExprInObjLit(n.argumentExpression);
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.ObjectLiteralExpression) {
        _optionalChain([n, 'access', _489 => _489.properties, 'optionalAccess', _490 => _490.forEach, 'call', _491 => _491((p) => {
          if (p.initializer)
            visitExprInObjLit(p.initializer);
        })]);
        return;
      }
      _typescript2.default.forEachChild(n, visitExprInObjLit);
    };
    const walk = (node) => {
      if (!node)
        return;
      if (node.kind === _typescript2.default.SyntaxKind.BinaryExpression && this.isAssignmentOperator(node.operatorToken.kind)) {
        walk(node.right);
        if (_optionalChain([node, 'access', _492 => _492.left, 'optionalAccess', _493 => _493.kind]) === _typescript2.default.SyntaxKind.Identifier) {
          const sym = symbolIdOf(node.left);
          if (reassignedSyms.has(sym)) {
            events.push({ kind: "reassign", sym });
          }
        } else {
          walk(node.left);
        }
        return;
      }
      if ((node.kind === _typescript2.default.SyntaxKind.PrefixUnaryExpression || node.kind === _typescript2.default.SyntaxKind.PostfixUnaryExpression) && this.isIncDecOperator(node.operator) && _optionalChain([node, 'access', _494 => _494.operand, 'optionalAccess', _495 => _495.kind]) === _typescript2.default.SyntaxKind.Identifier) {
        const sym = symbolIdOf(node.operand);
        if (reassignedSyms.has(sym)) {
          events.push({ kind: "reassign", sym });
        }
        return;
      }
      if (node.kind === _typescript2.default.SyntaxKind.ObjectLiteralExpression) {
        _optionalChain([node, 'access', _496 => _496.properties, 'optionalAccess', _497 => _497.forEach, 'call', _498 => _498((prop) => {
          if (prop.initializer) {
            visitExprInObjLit(prop.initializer);
            walk(prop.initializer);
          }
        })]);
        return;
      }
      const walkBlockAndBump = (subNode) => {
        const usedInBlock = /* @__PURE__ */ new Set();
        if (!subNode)
          return usedInBlock;
        const eventsBefore = events.length;
        walk(subNode);
        for (let i = eventsBefore; i < events.length; i++) {
          const e = events[i];
          if (e.kind === "use")
            usedInBlock.add(e.sym);
        }
        for (const sym of usedInBlock) {
          events.push({ kind: "reassign", sym });
        }
        return usedInBlock;
      };
      if (node.kind === _typescript2.default.SyntaxKind.IfStatement) {
        walk(node.expression);
        walkBlockAndBump(node.thenStatement);
        walkBlockAndBump(node.elseStatement);
        return;
      }
      if (node.kind === _typescript2.default.SyntaxKind.TryStatement) {
        walkBlockAndBump(node.tryBlock);
        walkBlockAndBump(_optionalChain([node, 'access', _499 => _499.catchClause, 'optionalAccess', _500 => _500.block]));
        walkBlockAndBump(node.finallyBlock);
        return;
      }
      _typescript2.default.forEachChild(node, walk);
    };
    walk(fnBody);
    const counters = /* @__PURE__ */ new Map();
    const perSym = /* @__PURE__ */ new Map();
    for (const e of events) {
      if (e.kind === "reassign") {
        counters.set(e.sym, (_nullishCoalesce(counters.get(e.sym), () => ( 0))) + 1);
      } else {
        const v = _nullishCoalesce(counters.get(e.sym), () => ( 0));
        if (!perSym.has(e.sym))
          perSym.set(e.sym, { name: e.name, byVer: /* @__PURE__ */ new Map() });
        const entry = perSym.get(e.sym);
        if (!entry.byVer.has(v))
          entry.byVer.set(v, []);
        entry.byVer.get(v).push(e.node);
      }
    }
    for (const { name, byVer } of perSym.values()) {
      const versions = [...byVer.keys()].sort((a, b) => a - b);
      const baseName = this.getFinalVarName(name);
      if (versions.length === 1) {
        for (const n of byVer.get(versions[0])) {
          this.usageToFinalName.set(n, baseName);
        }
      } else {
        versions.forEach((v, idx) => {
          const finalName = idx === 0 ? baseName : `${baseName}_${idx + 1}`;
          for (const n of byVer.get(v)) {
            this.usageToFinalName.set(n, finalName);
          }
        });
      }
    }
  }
  finalNameInAncestorScope(finalName) {
    for (const scope of this.finalVarScopeStack) {
      if (scope.has(finalName))
        return true;
    }
    return false;
  }
  buildFinalVarDeclarations(pairs, identation) {
    if (pairs.length === 0)
      return "";
    const current = this.finalVarScopeStack.length > 0 ? this.finalVarScopeStack[this.finalVarScopeStack.length - 1] : null;
    const lines = [];
    const seenHere = /* @__PURE__ */ new Set();
    for (const p of pairs) {
      if (seenHere.has(p.final))
        continue;
      if (this.finalNameInAncestorScope(p.final))
        continue;
      seenHere.add(p.final);
      if (current)
        current.add(p.final);
      const indent = lines.length === 0 ? 0 : identation;
      lines.push(`${this.getIden(indent)}final Object ${p.final} = ${this.getOriginalVarName(p.orig)};`);
    }
    return lines.join("\n");
  }
  getObjectLiteralId(node) {
    const start = node.getStart();
    const end = node.getEnd();
    const fileName = _nullishCoalesce(_optionalChain([node, 'access', _501 => _501.getSourceFile, 'optionalCall', _502 => _502(), 'optionalAccess', _503 => _503.fileName]), () => ( ""));
    return `${fileName}:${start}-${end}`;
  }
  // Remember an identifier's pre-rewrite state so restoreFinalVarMutations can put
  // the shared AST back exactly as it was parsed.
  recordFinalVarMutation(node) {
    this.finalVarMutations.push({
      node,
      escapedText: node.escapedText,
      ownGetFullText: Object.prototype.hasOwnProperty.call(node, "getFullText"),
      getFullText: node.getFullText
    });
  }
  // Undo every in-place identifier rewrite made during the current emit, newest
  // first so repeated rewrites of one node unwind to the original value.
  restoreFinalVarMutations() {
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
  printNode(node, identation = 0) {
    if (node && node.kind === _typescript2.default.SyntaxKind.SourceFile) {
      this.restoreFinalVarMutations();
      this.ReassignedVars = {};
      this.varListFromObjectLiterals = {};
      this.usageToFinalName = /* @__PURE__ */ new WeakMap();
      this.finalVarScopeStack = [];
      try {
        return super.printNode(node, identation);
      } finally {
        this.restoreFinalVarMutations();
      }
    }
    return super.printNode(node, identation);
  }
  createNewNodeForFinalVar(originalName) {
    const newNode = _typescript2.default.factory.createIdentifier(this.getFinalVarName(originalName));
    newNode.getFullText = () => this.getFinalVarName(originalName);
    return newNode;
  }
  getVarListFromObjectLiteralAndUpdateInPlace(node) {
    let res = [];
    const nodeId = this.getObjectLiteralId(node);
    if (nodeId in this.varListFromObjectLiterals) {
      return this.varListFromObjectLiterals[nodeId];
    }
    const finalNameFor = (n, origName) => {
      return _nullishCoalesce(this.usageToFinalName.get(n), () => ( this.getFinalVarName(origName)));
    };
    const traverseAndReplace = (n) => {
      if (!n)
        return;
      if (n.kind === _typescript2.default.SyntaxKind.Identifier) {
        const name = n.escapedText;
        if (name && name !== "undefined" && !name.startsWith("null")) {
          const isReassignedAhead = this.usageToFinalName.has(n);
          if (isReassignedAhead || this.ReassignedVars[this.getVarKey(n)]) {
            const finalName = finalNameFor(n, name);
            res.push({ orig: name, final: finalName });
            this.recordFinalVarMutation(n);
            n.escapedText = finalName;
            n.getFullText = () => finalName;
          }
        }
        return;
      }
      if (n.kind === _typescript2.default.SyntaxKind.ObjectLiteralExpression) {
        const innerVars = this.getVarListFromObjectLiteralAndUpdateInPlace(n);
        res = res.concat(innerVars);
        return;
      }
      _typescript2.default.forEachChild(n, traverseAndReplace);
    };
    node.properties.forEach((prop) => {
      if (!prop.initializer)
        return;
      traverseAndReplace(prop.initializer);
    });
    const seen = /* @__PURE__ */ new Set();
    const dedup = [];
    for (const p of res) {
      const key = `${p.orig}|${p.final}`;
      if (seen.has(key))
        continue;
      seen.add(key);
      dedup.push(p);
    }
    this.varListFromObjectLiterals[nodeId] = dedup;
    return dedup;
  }
  printVariableDeclarationList(node, identation) {
    const declaration = node.declarations[0];
    let finalVars = "";
    if (declaration.initializer) {
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
    if (this.removeVariableDeclarationForFunctionExpression && _optionalChain([declaration, 'optionalAccess', _504 => _504.initializer]) && _typescript2.default.isFunctionExpression(declaration.initializer)) {
      return this.printNode(declaration.initializer, identation).trimEnd();
    }
    if (_optionalChain([declaration, 'optionalAccess', _505 => _505.name, 'access', _506 => _506.kind]) === _typescript2.default.SyntaxKind.ArrayBindingPattern) {
      const arrayBindingPattern = declaration.name;
      const arrayBindingPatternElements = arrayBindingPattern.elements;
      const parsedArrayBindingElements = arrayBindingPatternElements.map(
        (e) => this.printNode(e.name, 0)
      );
      const syntheticName = parsedArrayBindingElements.join("") + "Variable";
      let arrayBindingStatement = `${this.getIden(identation)}var ${syntheticName} = ${this.printNode(
        declaration.initializer,
        0
      )};
`;
      parsedArrayBindingElements.forEach((e, index) => {
        const statement = this.getIden(identation) + `var ${e} = ((java.util.List<Object>) ${syntheticName}).get(${index})`;
        if (index < parsedArrayBindingElements.length - 1) {
          arrayBindingStatement += statement + ";\n";
        } else {
          arrayBindingStatement += statement;
        }
      });
      return arrayBindingStatement;
    }
    const isNew = _optionalChain([declaration, 'optionalAccess', _507 => _507.initializer]) && declaration.initializer.kind === _typescript2.default.SyntaxKind.NewExpression;
    const varToken = isNew ? "var " : this.VAR_TOKEN + " ";
    if (!declaration.initializer) {
      return this.getIden(identation) + "Object " + this.printNode(declaration.name) + " = " + this.UNDEFINED_TOKEN;
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
      return this.getIden(identation) + specificVarToken + " " + this.printNode(declaration.name) + " = " + parsedValue;
    }
    finalVars = finalVars.length > 0 ? this.getIden(identation) + finalVars + "\n" : finalVars;
    return finalVars + this.getIden(identation) + varToken + this.printNode(declaration.name) + " = " + parsedValue;
  }
  printThisKeyword(node, identation) {
    let current = _optionalChain([node, 'optionalAccess', _508 => _508.parent]);
    while (current) {
      if (current.kind === _typescript2.default.SyntaxKind.PropertyAssignment) {
        const className = this.currentClassName;
        return `${this.capitalize(className)}.this`;
      }
      current = _optionalChain([current, 'optionalAccess', _509 => _509.parent]);
    }
    return this.THIS_TOKEN;
  }
  transformPropertyAcessExpressionIfNeeded(node) {
    const expression = node.expression;
    const leftSide = this.printNode(expression, 0);
    const rightSide = node.name.escapedText;
    let rawExpression = void 0;
    switch (rightSide) {
      case "length": {
        const type = this.getChecker().getTypeAtLocation(
          expression
        );
        this.warnIfAnyType(node, type.flags, leftSide, "length");
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
    if (_typescript2.default.isArrayLiteralExpression(node) || _typescript2.default.isObjectLiteralExpression(node) || _typescript2.default.isStringLiteral(node) || _typescript2.default.isBooleanLiteral(node)) {
      return this.UNDEFINED_TOKEN;
    }
    if (_typescript2.default.isNumericLiteral(node)) {
      return this.UNDEFINED_TOKEN;
    }
    if (_optionalChain([node, 'optionalAccess', _510 => _510.escapedText]) === "undefined" && _optionalChain([this, 'access', _511 => _511.getChecker, 'call', _512 => _512(), 'access', _513 => _513.getTypeAtLocation, 'call', _514 => _514(_optionalChain([node, 'optionalAccess', _515 => _515.parent])), 'optionalAccess', _516 => _516.flags]) === _typescript2.default.TypeFlags.Number) {
      return this.UNDEFINED_TOKEN;
    }
    return void 0;
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
    switch (_optionalChain([node, 'optionalAccess', _517 => _517.kind])) {
      case _typescript2.default.SyntaxKind.NullKeyword:
      case _typescript2.default.SyntaxKind.TrueKeyword:
      case _typescript2.default.SyntaxKind.FalseKeyword:
      case _typescript2.default.SyntaxKind.StringLiteral:
      case _typescript2.default.SyntaxKind.NoSubstitutionTemplateLiteral:
      case _typescript2.default.SyntaxKind.NumericLiteral:
        return true;
      case _typescript2.default.SyntaxKind.Identifier:
        return node.escapedText === "undefined";
      case _typescript2.default.SyntaxKind.ArrayLiteralExpression:
        return node.elements.every((element) => this.isPureInitializer(element));
      case _typescript2.default.SyntaxKind.ObjectLiteralExpression:
        return node.properties.every((property) => _typescript2.default.isPropertyAssignment(property) && this.isPureInitializer(property.initializer));
      case _typescript2.default.SyntaxKind.ParenthesizedExpression:
      case _typescript2.default.SyntaxKind.AsExpression:
      case _typescript2.default.SyntaxKind.TypeAssertionExpression:
      case _typescript2.default.SyntaxKind.NonNullExpression:
        return this.isPureInitializer(node.expression);
      default:
        return false;
    }
  }
  printFunctionBody(node, identation) {
    const savedVarList = this.varListFromObjectLiterals;
    const savedUsageToFinalName = this.usageToFinalName;
    const savedScopeStack = this.finalVarScopeStack;
    this.varListFromObjectLiterals = {};
    this.analyzeFinalVars(node.body);
    this.finalVarScopeStack = [/* @__PURE__ */ new Set()];
    const funcParams = _nullishCoalesce(node.parameters, () => ( []));
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
    let firstStatement = processedParts[0] || "";
    const remainingString = processedParts.slice(1).join("\n");
    let offSetIndex = 0;
    funcParams.forEach((param, i) => {
      const initializer = param.initializer;
      if (initializer) {
        const index = i + offSetIndex;
        const paramName = this.printNode(param.name, 0);
        initParams.push(this.printOptionalArgInit(paramName, index, initializer));
      } else {
        offSetIndex--;
      }
    });
    if (initParams.length > 0) {
      const defaultInitializers = initParams.map((l) => this.getIden(identation + 1) + l).join("\n") + "\n";
      const bodyParts = firstStatement.split("\n");
      const commentPart = bodyParts.filter((line) => this.isComment(line));
      const isComment = commentPart.length > 0;
      if (isComment) {
        const commentPartString = commentPart.map((c) => this.getIden(identation + 1) + c.trim()).join("\n");
        const firstStmNoComment = bodyParts.filter((line) => !this.isComment(line)).join("\n");
        firstStatement = commentPartString + "\n" + defaultInitializers + firstStmNoComment;
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
      const body = (firstStatement + remainingString).split("\n").map((line) => this.getIden(identation) + line).join("\n");
      const lastStatement = bodyStatements.length > 1 ? bodyStatements[bodyStatements.length - 1] : bodyStatements.length > 0 ? bodyStatements[0] : void 0;
      const lastStmtIsReturn = lastStatement && (_typescript2.default.isReturnStatement(lastStatement) || this.allBranchesTerminate(lastStatement));
      const returnNull = lastStmtIsReturn ? "" : this.getIden(identation + 2) + "return null;\n";
      const supplier = this.asyncSupplier || "java.util.concurrent.CompletableFuture.supplyAsync";
      const executorArg = !this.asyncSupplier && this.asyncExecutor ? `, ${this.asyncExecutor}` : "";
      const asyncBody = this.getIden(identation + 1) + `return ${supplier}(() -> {
` + insideWrappers + body + "\n" + returnNull + this.getIden(identation + 1) + `}${executorArg});
`;
      return blockOpen + finalWrapperVars + asyncBody + blockClose;
    }
    return blockOpen + firstStatement + remainingString + blockClose;
  }
  printBlock(node, identation, chainBlock = false) {
    const managed = this.finalVarScopeStack.length > 0;
    if (managed)
      this.finalVarScopeStack.push(/* @__PURE__ */ new Set());
    try {
      return super.printBlock(node, identation, chainBlock);
    } finally {
      if (managed)
        this.finalVarScopeStack.pop();
    }
  }
  printInstanceOfExpression(node, identation) {
    const right = node.right.escapedText;
    const left = this.printNode(node.left, 0);
    return this.getIden(identation) + `Helpers.isInstance(${left}, ${right}.class)`;
  }
  printAwaitExpression(node, identation) {
    const expression = this.printNode(node.expression, identation);
    return `(${expression}).join()`;
  }
  printAsExpression(node, identation) {
    const type = node.type;
    if (type.kind === _typescript2.default.SyntaxKind.AnyKeyword) {
      return `((${this.VariableTypeReplacements["object"]})${this.printNode(
        node.expression,
        identation
      )})`;
    }
    if (type.kind === _typescript2.default.SyntaxKind.StringKeyword) {
      return `((String)${this.printNode(node.expression, identation)})`;
    }
    if (type.kind === _typescript2.default.SyntaxKind.ArrayType) {
      if (type.elementType.kind === _typescript2.default.SyntaxKind.AnyKeyword) {
        return `(java.util.List<Object>)(${this.printNode(
          node.expression,
          identation
        )})`;
      }
      if (type.elementType.kind === _typescript2.default.SyntaxKind.StringKeyword) {
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
        const customDefaultValue = this.printCustomDefaultValueIfNeeded(initializer);
        const def = customDefaultValue ? customDefaultValue : this.printNode(initializer, 0);
        type = def === "null" && type !== "Object" ? type + " " : type + " ";
        return type + name + this.SPACE_DEFAULT_PARAM + "=" + this.SPACE_DEFAULT_PARAM + def;
      }
      return type + " " + name;
    }
    return name;
  }
  printMethodParameters(node) {
    const isAsyncMethod = this.isAsyncFunction(node);
    const params = node.parameters.map((param) => {
      const isReassignedVar = this.ReassignedVars[this.getVarKey(param)];
      let printedParam = this.printParameter(param);
      if (isAsyncMethod && isReassignedVar) {
        const paramName = param.name.escapedText;
        const { localName, sigName } = this.getAsyncParamWrapperNames(paramName);
        printedParam = printedParam.replace(localName, sigName);
      }
      return printedParam;
    });
    const hasOptionalParameter = node.parameters.some((p) => p.initializer !== void 0 || p.questionToken !== void 0);
    if (!hasOptionalParameter) {
      return params.join(", ");
    }
    const paramsWithOptional = params.filter((param) => param.indexOf("=") === -1);
    paramsWithOptional.push("Object... optionalArgs");
    return paramsWithOptional.join(", ");
  }
  printArrayLiteralExpression(node) {
    const elements = node.elements.map((e) => this.printNode(e)).join(", ");
    return `${this.ARRAY_OPENING_TOKEN}${elements}${this.ARRAY_CLOSING_TOKEN}`;
  }
  printFinalOutsideMethodVariableWrappersIfAny(node, identation) {
    const parameters = _optionalChain([node, 'optionalAccess', _518 => _518.parameters]);
    const finalVarWrappers = [];
    if (parameters) {
      const isAsyncMethod = this.isAsyncFunction(node);
      parameters.forEach((param) => {
        const isOptionalParam = param.initializer !== void 0 || param.questionToken !== void 0;
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
    const parameters = _optionalChain([node, 'optionalAccess', _519 => _519.parameters]);
    const finalVarWrappers = [];
    if (parameters) {
      const isAsyncMethod = this.isAsyncFunction(node);
      parameters.forEach((param) => {
        const isOptionalParam = param.initializer !== void 0 || param.questionToken !== void 0;
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
    const funcBody = this.printFunctionBody(node, identation);
    let methodDef = this.printMethodDefinition(node, identation);
    methodDef += funcBody;
    return methodDef;
  }
  printMethodDefinition(node, identation) {
    let name = node.name.escapedText;
    name = this.transformMethodNameIfNeeded(name);
    let returnType = this.printFunctionType(node);
    if (returnType === "java.util.concurrent.CompletableFuture") {
      returnType = "java.util.concurrent.CompletableFuture<Object>";
    }
    const defaultAccess = this.METHOD_DEFAULT_ACCESS ? this.METHOD_DEFAULT_ACCESS + " " : "";
    const modifiers = defaultAccess;
    let parsedArgs = void 0;
    parsedArgs = parsedArgs ? parsedArgs : this.printMethodParameters(node);
    returnType = returnType ? returnType + " " : returnType;
    const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
    const signature = this.getIden(identation) + modifiers + returnType + methodToken + name + "(" + parsedArgs + ")";
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
  printArrayIsArrayCall(_node, _identation, parsedArg = void 0) {
    return `Helpers.isArray(${parsedArg})`;
  }
  printObjectKeysCall(_node, _identation, parsedArg = void 0) {
    return `Helpers.objectKeys(${parsedArg})`;
  }
  printObjectValuesCall(_node, _identation, parsedArg = void 0) {
    return `Helpers.objectValues(${parsedArg})`;
  }
  printJsonParseCall(_node, _identation, parsedArg = void 0) {
    return `Helpers.parseJson(${parsedArg})`;
  }
  printJsonStringifyCall(_node, _identation, parsedArg = void 0) {
    return `Helpers.json(${parsedArg})`;
  }
  printPromiseAllCall(_node, _identation, parsedArg = void 0) {
    return `Helpers.promiseAll(${parsedArg})`;
  }
  printMathFloorCall(_node, _identation, parsedArg = void 0) {
    return `(Math.floor(Double.parseDouble(Helpers.toString(${parsedArg}))))`;
  }
  printMathRoundCall(_node, _identation, parsedArg = void 0) {
    return `Math.round(Double.parseDouble(Helpers.toString(${parsedArg})))`;
  }
  printMathCeilCall(_node, _identation, parsedArg = void 0) {
    return `Math.ceil(Double.parseDouble(Helpers.toString(${parsedArg})))`;
  }
  printNumberIsIntegerCall(_node, _identation, parsedArg = void 0) {
    return `((${parsedArg} instanceof Integer) || (${parsedArg} instanceof Long))`;
  }
  printArrayPushCall(_node, _identation, name = void 0, parsedArg = void 0) {
    return `((java.util.List<Object>)${name}).add(${parsedArg})`;
  }
  printIncludesCall(_node, _identation, name = void 0, parsedArg = void 0) {
    return `${name}.contains(${parsedArg})`;
  }
  printIndexOfCall(_node, _identation, name = void 0, parsedArg = void 0) {
    return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
  }
  printSearchCall(_node, _identation, name = void 0, parsedArg = void 0) {
    return `((String)${name}).indexOf(${parsedArg})`;
  }
  printStartsWithCall(_node, _identation, name = void 0, parsedArg = void 0) {
    return `((String)${name}).startsWith(((String)${parsedArg}))`;
  }
  printEndsWithCall(_node, _identation, name = void 0, parsedArg = void 0) {
    return `((String)${name}).endsWith(((String)${parsedArg}))`;
  }
  printTrimCall(_node, _identation, name = void 0) {
    return `((String)${name}).trim()`;
  }
  printJoinCall(_node, _identation, name = void 0, parsedArg = void 0) {
    return `String.join((String)${parsedArg}, (java.util.List<String>)${name})`;
  }
  printSplitCall(_node, _identation, name = void 0, parsedArg = void 0) {
    return `Helpers.split(${name}, ${parsedArg})`;
  }
  printConcatCall(_node, _identation, name = void 0, parsedArg = void 0) {
    return `Helpers.concat(${name}, ${parsedArg})`;
  }
  printToFixedCall(_node, _identation, name = void 0, parsedArg = void 0) {
    return `toFixed(${name}, ${parsedArg})`;
  }
  printToStringCall(_node, _identation, name = void 0) {
    return `String.valueOf(${name})`;
  }
  printToUpperCaseCall(_node, _identation, name = void 0) {
    return `((String)${name}).toUpperCase()`;
  }
  printToLowerCaseCall(_node, _identation, name = void 0) {
    return `((String)${name}).toLowerCase()`;
  }
  printShiftCall(_node, _identation, name = void 0) {
    return `((java.util.List<Object>)${name}).get(0)`;
  }
  printReverseCall(_node, _identation, name = void 0) {
    return `java.util.Collections.reverse((java.util.List<Object>)${name})`;
  }
  printPopCall(_node, _identation, name = void 0) {
    return `((java.util.List<Object>)${name}).get(((java.util.List<Object>)${name}).size()-1)`;
  }
  printAssertCall(_node, _identation, parsedArgs) {
    return `assert(${parsedArgs})`;
  }
  printSliceCall(_node, _identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    if (parsedArg2 === void 0) {
      parsedArg2 = "null";
    }
    return `Helpers.slice(${name}, ${parsedArg}, ${parsedArg2})`;
  }
  printReplaceCall(_node, _identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return `Helpers.replace((String)${name}, (String)${parsedArg}, (String)${parsedArg2})`;
  }
  printReplaceAllCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    const pattern = this.stringLiteralArgument(_optionalChain([node, 'optionalAccess', _520 => _520.arguments, 'optionalAccess', _521 => _521[0]]));
    const replacement = this.stringLiteralArgument(_optionalChain([node, 'optionalAccess', _522 => _522.arguments, 'optionalAccess', _523 => _523[1]]));
    const receiver = this.sideEffectFreeReceiver(_optionalChain([node, 'optionalAccess', _524 => _524.expression]));
    if (pattern !== void 0 && replacement !== void 0 && receiver) {
      return `(${name} == null ? null : ((String)${name}).replace(${pattern}, ${replacement}))`;
    }
    return `Helpers.replaceAll((String)${name}, (String)${parsedArg}, (String)${parsedArg2})`;
  }
  // Printed form of a non-empty string-literal argument with no escapes, or undefined when the
  // argument is not a literal, prints with an escape sequence, or is the empty pattern.
  stringLiteralArgument(argument) {
    if (argument === void 0 || !_typescript2.default.isStringLiteral(argument)) {
      return void 0;
    }
    const printed = this.printNode(argument, 0);
    return /^"[^"\\]+"$/.test(printed) ? printed : void 0;
  }
  // True for receivers that read a value without calling anything: `x`, `x.y`, `this.x`,
  // `(x as string)` and parenthesised forms of those. Guards the double read of the ternary.
  sideEffectFreeReceiver(expression) {
    if (expression === void 0) {
      return false;
    }
    if (_typescript2.default.isParenthesizedExpression(expression) || _typescript2.default.isAsExpression(expression) || _typescript2.default.isTypeAssertionExpression(expression)) {
      return this.sideEffectFreeReceiver(expression.expression);
    }
    if (_typescript2.default.isIdentifier(expression) || expression.kind === _typescript2.default.SyntaxKind.ThisKeyword) {
      return true;
    }
    if (_typescript2.default.isPropertyAccessExpression(expression)) {
      return this.sideEffectFreeReceiver(expression.expression);
    }
    return false;
  }
  printPadEndCall(_node, _identation, name, parsedArg, parsedArg2) {
    return `Helpers.padEnd((String)${name}, ((Number)${parsedArg}).intValue(), ((String)${parsedArg2}).charAt(0))`;
  }
  printPadStartCall(_node, _identation, name, parsedArg, parsedArg2) {
    return `Helpers.padStart((String)${name}, ((Number)${parsedArg}).intValue(), ((String)${parsedArg2}).charAt(0))`;
  }
  printDateNowCall(_node, _identation) {
    return "System.currentTimeMillis()";
  }
  printLengthProperty(node, _identation, _name = void 0) {
    const leftSide = this.printNode(node.expression, 0);
    const type = this.getChecker().getTypeAtLocation(node.expression);
    this.warnIfAnyType(node, type.flags, leftSide, "length");
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
    if (operator === _typescript2.default.SyntaxKind.ExclamationToken) {
      return this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
    }
    const leftSide = this.printNode(operand, 0);
    if (operator === _typescript2.default.SyntaxKind.PlusToken) {
      return `+(${leftSide})`;
    } else if (operator === _typescript2.default.SyntaxKind.MinusToken) {
      return `Helpers.opNeg(${leftSide})`;
    }
    return super.printPrefixUnaryExpression(node, identation);
  }
  javaBooleanCondition(node) {
    if (node.kind === _typescript2.default.SyntaxKind.ParenthesizedExpression) {
      return this.javaBooleanCondition(node.expression);
    }
    if (node.kind === _typescript2.default.SyntaxKind.PrefixUnaryExpression) {
      return node.operator === _typescript2.default.SyntaxKind.ExclamationToken && this.javaBooleanCondition(node.operand);
    }
    if (node.kind !== _typescript2.default.SyntaxKind.BinaryExpression) {
      return false;
    }
    return this.javaBooleanOperators.includes(node.operatorToken.kind);
  }
  // the printer already emits these conditions as Java `boolean` (the comparison helpers,
  // `in`/`instanceof` and the logical operators all return/print primitive boolean), so
  // Helpers.isTrue would only re-test a value the checker proves is boolean
  javaConditionPrintsBoolean(node) {
    if (!this.javaBooleanCondition(node)) {
      return false;
    }
    return (this.getChecker().getTypeAtLocation(node).flags & _typescript2.default.TypeFlags.Boolean) !== 0;
  }
  printCondition(node, identation) {
    if (this.javaConditionPrintsBoolean(node)) {
      return this.getIden(identation) + this.printNode(node, 0);
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
    if (node.expression.kind === _typescript2.default.SyntaxKind.Identifier) {
      const name = this.printNode(node.expression, 0);
      return this.getIden(identation) + `${this.THROW_TOKEN} (${name} instanceof RuntimeException ? (RuntimeException)${name} : new RuntimeException(${name}))${this.LINE_TERMINATOR}`;
    }
    if (node.expression.kind === _typescript2.default.SyntaxKind.NewExpression) {
      const expression = node.expression;
      const argumentsExp = _nullishCoalesce(_optionalChain([expression, 'optionalAccess', _525 => _525.arguments]), () => ( []));
      const parsedArg = _nullishCoalesce(argumentsExp.map((n) => this.printNode(n, 0)).join(","), () => ( ""));
      const newExpression = this.printNode(expression.expression, 0);
      if (expression.expression.kind === _typescript2.default.SyntaxKind.Identifier) {
        const id = expression.expression;
        const exceptionName = id.escapedText === "Error" ? "RuntimeException" : id.escapedText;
        const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
        if (symbol) {
          const declarations = _nullishCoalesce(_optionalChain([this, 'access', _526 => _526.getChecker, 'call', _527 => _527(), 'access', _528 => _528.getDeclaredTypeOfSymbol, 'call', _529 => _529(symbol), 'access', _530 => _530.symbol, 'optionalAccess', _531 => _531.declarations]), () => ( []));
          const isClassDeclaration = declarations.find(
            (l) => l.kind === _typescript2.default.SyntaxKind.InterfaceDeclaration || l.kind === _typescript2.default.SyntaxKind.ClassDeclaration
          );
          if (isClassDeclaration) {
            return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${exceptionName}((String)${parsedArg}) ${this.LINE_TERMINATOR}`;
          } else {
            return this.getIden(identation) + `Helpers.throwDynamicException(${exceptionName}, ${parsedArg});return null;`;
          }
        }
        return this.getIden(identation) + `${this.THROW_TOKEN} ${this.NEW_TOKEN} ${exceptionName}(${parsedArg}) ${this.LINE_TERMINATOR}`;
      } else if (expression.expression.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
        return this.getIden(identation) + `Helpers.throwDynamicException(${newExpression}, ${parsedArg});`;
      }
      return super.printThrowStatement(node, identation);
    }
  }
  printPropertyAccessModifiers(node) {
    let modifiers = this.printModifiers(node);
    if (modifiers === "") {
      modifiers = this.defaultPropertyAccess;
    }
    let typeText = "Object";
    if (node.type) {
      typeText = this.getType(node);
      if (!typeText) {
        if (node.type.kind === _typescript2.default.SyntaxKind.AnyKeyword) {
          typeText = this.OBJECT_KEYWORD + " ";
        }
      }
    }
    return modifiers + " " + typeText + " ";
  }
  printModifiers(node) {
    let modifiers = node.modifiers;
    if (modifiers === void 0) {
      return "";
    }
    modifiers = modifiers.filter((mod) => this.FuncModifiers[mod.kind]);
    modifiers = modifiers.filter((mod) => mod.kind !== _typescript2.default.SyntaxKind.AsyncKeyword);
    const res = modifiers.map((modifier) => this.FuncModifiers[modifier.kind]).join(" ");
    return res;
  }
  printObjectLiteralExpression(node, identation) {
    const objectBody = this.printObjectLiteralBody(node, identation);
    const formattedObjectBody = objectBody ? "\n" + objectBody + "\n" + this.getIden(identation) : objectBody;
    return this.OBJECT_OPENING + formattedObjectBody + this.OBJECT_CLOSING;
  }
  printObjectLiteralBody(node, identation) {
    const body = node.properties.map((p) => this.printNode(p, identation + 1)).join("\n");
    return body;
  }
  printForStatement(node, identation) {
    const initializer = this.printNode(node.initializer, 0).replace("Object ", "var ");
    const condition = this.printNode(node.condition, 0);
    const incrementor = this.printNode(node.incrementor, 0);
    const forStm = this.getIden(identation) + this.FOR_TOKEN + " " + this.CONDITION_OPENING + initializer + "; " + condition + "; " + incrementor + this.CONDITION_CLOSE + this.printBlock(node.statement, identation);
    return this.printNodeCommentsIfAny(node, identation, forStm);
  }
  printReturnStatement(node, identation) {
    const leadingComment = this.printLeadingComments(node, identation);
    let trailingComment = this.printTraillingComment(node, identation);
    trailingComment = trailingComment ? " " + trailingComment : trailingComment;
    let exp = node.expression;
    if (exp && exp.kind === _typescript2.default.SyntaxKind.AsExpression && (exp.expression.kind === _typescript2.default.SyntaxKind.ObjectLiteralExpression || _typescript2.default.SyntaxKind.CallExpression)) {
      exp = exp.expression;
    }
    const allVarNames = [];
    if (exp) {
      const objLiterals = this.collectCapturingObjectLiterals(exp);
      for (const objLiteral of objLiterals) {
        const varsList = this.getVarListFromObjectLiteralAndUpdateInPlace(objLiteral);
        allVarNames.push(...varsList);
      }
    }
    let finalVars = allVarNames.length > 0 ? this.buildFinalVarDeclarations(allVarNames, identation) : "";
    let rightPart = exp ? " " + this.printNode(exp, identation) : "";
    rightPart = rightPart.trim();
    if (!rightPart) {
      let parent = node.parent;
      while (parent) {
        if (_typescript2.default.isFunctionDeclaration(parent) || _typescript2.default.isMethodDeclaration(parent) || _typescript2.default.isFunctionExpression(parent) || _typescript2.default.isArrowFunction(parent)) {
          if (this.isAsyncFunction(parent)) {
            rightPart = "null";
          }
          break;
        }
        parent = parent.parent;
      }
    }
    rightPart = rightPart ? " " + rightPart + this.LINE_TERMINATOR : this.LINE_TERMINATOR;
    finalVars = finalVars.length > 0 ? this.getIden(identation) + finalVars + "\n" : finalVars;
    return leadingComment + finalVars + this.getIden(identation) + this.RETURN_TOKEN + rightPart + trailingComment;
  }
  allBranchesTerminate(node) {
    if (_typescript2.default.isReturnStatement(node) || _typescript2.default.isThrowStatement(node)) {
      return true;
    }
    if (_typescript2.default.isBlock(node)) {
      const stmts = node.statements;
      return stmts.length > 0 && this.allBranchesTerminate(stmts[stmts.length - 1]);
    }
    if (_typescript2.default.isIfStatement(node)) {
      if (!node.elseStatement) {
        return false;
      }
      return this.allBranchesTerminate(node.thenStatement) && this.allBranchesTerminate(node.elseStatement);
    }
    return false;
  }
};

// src/rustTranspiler.ts
init_cjs_shims();

var SyntaxKind4 = _typescript2.default.SyntaxKind;
var parserConfig6 = {
  "ELSEIF_TOKEN": "else if",
  "OBJECT_OPENING": "{",
  "OBJECT_CLOSING": "}",
  "ARRAY_OPENING_TOKEN": "Value::List(vec![",
  "ARRAY_CLOSING_TOKEN": "])",
  "PROPERTY_ASSIGNMENT_TOKEN": ":",
  "VAR_TOKEN": "let mut",
  "METHOD_TOKEN": "fn",
  "FUNCTION_TOKEN": "fn",
  "PROPERTY_ASSIGNMENT_OPEN": "",
  "PROPERTY_ASSIGNMENT_CLOSE": "",
  "SUPER_TOKEN": "super",
  "SUPER_CALL_TOKEN": "super",
  "FALSY_WRAPPER_OPEN": "is_true(&",
  "FALSY_WRAPPER_CLOSE": ")",
  "COMPARISON_WRAPPER_OPEN": "is_equal(&",
  "COMPARISON_WRAPPER_CLOSE": ")",
  "UKNOWN_PROP_WRAPPER_OPEN": "",
  "UNKOWN_PROP_WRAPPER_CLOSE": "",
  "UKNOWN_PROP_ASYNC_WRAPPER_OPEN": "",
  "UNKOWN_PROP_ASYNC_WRAPPER_CLOSE": "",
  "DYNAMIC_CALL_OPEN": "",
  "EQUALS_EQUALS_WRAPPER_OPEN": "is_equal(&",
  "EQUALS_EQUALS_WRAPPER_CLOSE": ")",
  "DIFFERENT_WRAPPER_OPEN": "!is_equal(&",
  "DIFFERENT_WRAPPER_CLOSE": ")",
  "GREATER_THAN_WRAPPER_OPEN": "is_greater_than(&",
  "GREATER_THAN_WRAPPER_CLOSE": ")",
  "GREATER_THAN_EQUALS_WRAPPER_OPEN": "is_greater_than_or_equal(&",
  "GREATER_THAN_EQUALS_WRAPPER_CLOSE": ")",
  "LESS_THAN_WRAPPER_OPEN": "is_less_than(&",
  "LESS_THAN_WRAPPER_CLOSE": ")",
  "LESS_THAN_EQUALS_WRAPPER_OPEN": "is_less_than_or_equal(&",
  "LESS_THAN_EQUALS_WRAPPER_CLOSE": ")",
  "PLUS_WRAPPER_OPEN": "add(&",
  "PLUS_WRAPPER_CLOSE": ")",
  "MINUS_WRAPPER_OPEN": "subtract(&",
  "MINUS_WRAPPER_CLOSE": ")",
  "ARRAY_LENGTH_WRAPPER_OPEN": "get_array_length(&",
  "ARRAY_LENGTH_WRAPPER_CLOSE": ")",
  "DIVIDE_WRAPPER_OPEN": "divide(&",
  "DIVIDE_WRAPPER_CLOSE": ")",
  "MULTIPLY_WRAPPER_OPEN": "multiply(&",
  "MULTIPLY_WRAPPER_CLOSE": ")",
  "INDEXOF_WRAPPER_OPEN": "get_index_of(&",
  "INDEXOF_WRAPPER_CLOSE": ")",
  "MOD_WRAPPER_OPEN": "mod_val(&",
  "MOD_WRAPPER_CLOSE": ")",
  "LINE_TERMINATOR": ";",
  "CONDITION_OPENING": "",
  "CONDITION_CLOSE": "",
  "AWAIT_TOKEN": "",
  "NULL_TOKEN": "Value::Null",
  "UNDEFINED_TOKEN": "Value::Null",
  "WHILE_TOKEN": "while",
  "ELEMENT_ACCESS_WRAPPER_OPEN": "get_value(&",
  "ELEMENT_ACCESS_WRAPPER_CLOSE": ")",
  "DEFAULT_PARAMETER_TYPE": "Value",
  "DEFAULT_RETURN_TYPE": "Value",
  "BLOCK_OPENING_TOKEN": "{",
  "TRUE_KEYWORD": "Value::Bool(true)",
  "FALSE_KEYWORD": "Value::Bool(false)"
};
var _RustTranspiler = class _RustTranspiler extends BaseTranspiler {
  constructor(config = {}) {
    config["parser"] = Object.assign({}, parserConfig6, _nullishCoalesce(config["parser"], () => ( {})));
    super(config);
    this.requiresParameterType = true;
    this.requiresReturnType = false;
    this.asyncTranspiling = true;
    this.supportsFalsyOrTruthyValues = false;
    this.id = "Rust";
    this.className = "undefined";
    this.methodSignatures = {};
    this.forLoopCounter = 0;
    this.initConfig();
    this.applyUserOverrides(config);
  }
  initConfig() {
    this.LeftPropertyAccessReplacements = {};
    this.RightPropertyAccessReplacements = {};
    this.FullPropertyAccessReplacements = {
      "console.log": "println_val",
      "Math.floor": "math_floor",
      "Math.ceil": "math_ceil",
      "Math.round": "math_round"
    };
    this.CallExpressionReplacements = {};
    this.ReservedKeywordsReplacements = {
      "type": "type_var",
      "move": "move_val",
      "ref": "ref_val",
      "str": "str_val",
      "use": "use_val",
      "mod": "mod_kw",
      "loop": "loop_val",
      "match": "match_val",
      "where": "where_val",
      "final": "final_val",
      "box": "box_val",
      "become": "become_val",
      "priv": "priv_val",
      "override": "override_val",
      "unsized": "unsized_val",
      "async": "async_val",
      "await": "await_val",
      "try": "try_val",
      "abstract": "abstract_val",
      "dyn": "dyn_val",
      "fn": "fn_val",
      "impl": "impl_val",
      "pub": "pub_val",
      "self": "self_val",
      "super": "super_val",
      "crate": "crate_val"
    };
    this.binaryExpressionsWrappers = {
      [SyntaxKind4.EqualsEqualsToken]: ["is_equal(", ")"],
      [SyntaxKind4.EqualsEqualsEqualsToken]: ["is_equal(", ")"],
      [SyntaxKind4.ExclamationEqualsToken]: ["!is_equal(", ")"],
      [SyntaxKind4.ExclamationEqualsEqualsToken]: ["!is_equal(", ")"],
      [SyntaxKind4.GreaterThanToken]: ["is_greater_than(", ")"],
      [SyntaxKind4.GreaterThanEqualsToken]: ["is_greater_than_or_equal(", ")"],
      [SyntaxKind4.LessThanToken]: ["is_less_than(", ")"],
      [SyntaxKind4.LessThanEqualsToken]: ["is_less_than_or_equal(", ")"],
      [SyntaxKind4.PlusToken]: ["add(", ")"],
      [SyntaxKind4.MinusToken]: ["subtract(", ")"],
      [SyntaxKind4.AsteriskToken]: ["multiply(", ")"],
      [SyntaxKind4.PercentToken]: ["mod_val(", ")"],
      [SyntaxKind4.SlashToken]: ["divide(", ")"]
    };
  }
  capitalize(str) {
    return str[0].toUpperCase() + str.slice(1);
  }
  // Escaped Rust string literal for the given TS literal text — shared by
  // the `Value::Str(..)` form and the `&str` key form below.
  quotedStringLiteral(text) {
    const backslashPlaceholder = "\0";
    text = text.replaceAll("\\", backslashPlaceholder);
    text = text.replaceAll("\b", "\\b");
    text = text.replaceAll("\f", "\\f");
    text = text.replaceAll("\n", "\\n");
    text = text.replaceAll("\r", "\\r");
    text = text.replaceAll("	", "\\t");
    text = text.replaceAll(backslashPlaceholder, "\\\\");
    text = text.replaceAll('"', '\\"');
    return `"${text}"`;
  }
  printStringLiteral(node) {
    const text = node.text;
    if (text in this.StringLiteralReplacements) {
      return this.StringLiteralReplacements[text];
    }
    return `Value::Str(${this.quotedStringLiteral(text)}.to_string())`;
  }
  printNumericLiteral(node) {
    const text = node.text;
    if (text.includes(".") || /[eE]/.test(text)) {
      return `Value::Float(${text})`;
    }
    return `Value::Int(${text})`;
  }
  printBooleanLiteral(node) {
    if (_typescript2.default.SyntaxKind.TrueKeyword === node.kind) {
      return "Value::Bool(true)";
    }
    return "Value::Bool(false)";
  }
  printNullKeyword(node, identation) {
    return "Value::Null";
  }
  // Primitive kind the checker proves for `type`; a union keeps the kind only
  // when every non-nullable member is that same primitive.
  primitiveKindOfType(type) {
    if (type === void 0) {
      return void 0;
    }
    const flags = type.flags;
    if (this.isStringType(flags)) {
      return "string";
    }
    if (flags === _typescript2.default.TypeFlags.Number || flags === _typescript2.default.TypeFlags.NumberLiteral) {
      return "number";
    }
    if (flags === _typescript2.default.TypeFlags.Boolean || flags === _typescript2.default.TypeFlags.BooleanLiteral) {
      return "boolean";
    }
    if (flags & _typescript2.default.TypeFlags.Union) {
      let kind = void 0;
      for (const member of _nullishCoalesce(type.types, () => ( []))) {
        if (member.flags & (_typescript2.default.TypeFlags.Undefined | _typescript2.default.TypeFlags.Null)) {
          continue;
        }
        const memberKind = this.primitiveKindOfType(member);
        if (memberKind === void 0 || kind !== void 0 && kind !== memberKind) {
          return void 0;
        }
        kind = memberKind;
      }
      return kind;
    }
    return void 0;
  }
  // Kind of a literal operand whose printed Value variant is exactly known.
  literalKindOfNode(node) {
    if (node === void 0) {
      return void 0;
    }
    switch (node.kind) {
      case SyntaxKind4.StringLiteral:
        return "string";
      case SyntaxKind4.NumericLiteral:
        return "number";
      case SyntaxKind4.TrueKeyword:
      case SyntaxKind4.FalseKeyword:
        return "boolean";
      case SyntaxKind4.NullKeyword:
        return "null";
      case SyntaxKind4.Identifier:
        return node.escapedText === "undefined" ? "null" : void 0;
    }
    return void 0;
  }
  // Does printNode() render `node` as a Rust `Value` (and not a bare bool)?
  printsValueExpression(node) {
    if (node === void 0) {
      return false;
    }
    switch (node.kind) {
      case SyntaxKind4.ParenthesizedExpression:
        return this.printsValueExpression(node.expression);
      case SyntaxKind4.AwaitExpression:
        return this.printsValueExpression(node.expression);
      case SyntaxKind4.BinaryExpression:
        return !_RustTranspiler.BOOL_PRODUCING_OPERATORS.has(node.operatorToken.kind);
      case SyntaxKind4.PrefixUnaryExpression:
        return node.operator !== SyntaxKind4.ExclamationToken;
      case SyntaxKind4.CallExpression:
        return !_RustTranspiler.BOOL_PRODUCING_CALLS.has(this.callExpressionName(node));
      case SyntaxKind4.Identifier:
      case SyntaxKind4.PropertyAccessExpression:
      case SyntaxKind4.ElementAccessExpression:
        return !this.isClassInstanceType(this.getChecker().getTypeAtLocation(node));
      case SyntaxKind4.StringLiteral:
      case SyntaxKind4.NumericLiteral:
      case SyntaxKind4.TrueKeyword:
      case SyntaxKind4.FalseKeyword:
      case SyntaxKind4.NullKeyword:
      case SyntaxKind4.ArrayLiteralExpression:
      case SyntaxKind4.ObjectLiteralExpression:
      case SyntaxKind4.ConditionalExpression:
        return true;
    }
    return false;
  }
  // Class instances are emitted as their Rust struct (not a Value), so they
  // can neither be compared to Value::Null nor unwrapped with as_*().
  callExpressionName(node) {
    const expression = node.expression;
    if (_typescript2.default.isIdentifier(expression)) {
      return expression.escapedText;
    }
    if (_typescript2.default.isPropertyAccessExpression(expression)) {
      return expression.name.escapedText;
    }
    return "";
  }
  // A string literal whose text parses as a number — is_equal() coerces those
  // against numeric/bool operands, a plain string compare does not.
  stringLiteralCoercesToNumber(node) {
    const text = node.text;
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) {
      return true;
    }
    return /^[+-]?(inf|infinity|nan)$/i.test(text);
  }
  // f64 literal text for a numeric literal; undefined when it is not a Rust
  // decimal/float literal (hex/octal/binary fall back to the helper).
  numericLiteralF64Text(node) {
    const text = node.text;
    if (text.startsWith("0x") || text.startsWith("0o") || text.startsWith("0b")) {
      return void 0;
    }
    if (text.startsWith(".")) {
      return `0${text}`;
    }
    if (text.includes(".") || text.includes("e") || text.includes("E")) {
      return text;
    }
    return `${text}.0`;
  }
  // Native `==`/`!=` on the unwrapped payload when the checker proves the
  // Value variants line up; undefined keeps the is_equal() helper.
  printNativeEqualityComparison(left, right, op) {
    const operator = op === SyntaxKind4.EqualsEqualsToken || op === SyntaxKind4.EqualsEqualsEqualsToken ? "==" : "!=";
    const leftLiteral = this.literalKindOfNode(left);
    const rightLiteral = this.literalKindOfNode(right);
    if (leftLiteral !== void 0 && rightLiteral !== void 0) {
      return void 0;
    }
    if (leftLiteral !== void 0 || rightLiteral !== void 0) {
      const literal = leftLiteral !== void 0 ? left : right;
      const literalKind = _nullishCoalesce(leftLiteral, () => ( rightLiteral));
      const other = leftLiteral !== void 0 ? right : left;
      if (!this.printsValueExpression(other)) {
        return void 0;
      }
      const otherKind = this.primitiveKindOfType(this.getChecker().getTypeAtLocation(other));
      if (literalKind === "null") {
        return `${this.printNode(other, 0)} ${operator} Value::Null`;
      }
      if (literalKind === "string") {
        if (literal.text in this.StringLiteralReplacements) {
          return void 0;
        }
        if (this.stringLiteralCoercesToNumber(literal) && otherKind !== "string") {
          return void 0;
        }
        return `${this.printNode(other, 0)}.as_str() ${operator} Some(${this.quotedStringLiteral(literal.text)})`;
      }
      if (literalKind === "number") {
        if (otherKind !== "number") {
          return void 0;
        }
        const text = this.numericLiteralF64Text(literal);
        if (text === void 0) {
          return void 0;
        }
        return `${this.printNode(other, 0)}.as_f64() ${operator} Some(${text})`;
      }
      if (literalKind === "boolean") {
        if (otherKind !== "boolean") {
          return void 0;
        }
        const value = literal.kind === SyntaxKind4.TrueKeyword ? "true" : "false";
        return `${this.printNode(other, 0)}.as_bool() ${operator} Some(${value})`;
      }
      return void 0;
    }
    if (!this.printsValueExpression(left) || !this.printsValueExpression(right)) {
      return void 0;
    }
    const leftKind = this.primitiveKindOfType(this.getChecker().getTypeAtLocation(left));
    const rightKind = this.primitiveKindOfType(this.getChecker().getTypeAtLocation(right));
    if (leftKind === void 0 || leftKind !== rightKind) {
      return void 0;
    }
    const accessor = _RustTranspiler.PAYLOAD_ACCESSORS[leftKind];
    return `${this.printNode(left, 0)}.${accessor}() ${operator} ${this.printNode(right, 0)}.${accessor}()`;
  }
  // ── checker-typed helper elimination ─────────────────────────────────
  // Each predicate proves a static TS shape for which the native Rust form
  // is exactly what the runtime helper computes; only then is the helper
  // call dropped, anything unproven keeps the helper.
  typeOfNodeIfAny(node) {
    try {
      return this.getChecker().getTypeAtLocation(node);
    } catch (e) {
      return void 0;
    }
  }
  // Arrays/tuples/strings: `.length` is exactly what `Value::len()` returns.
  // Other shapes (Dict) keep the helper — ArrayCache / OrderBookSide markers
  // hold their length in the marker dict, which get_array_length unwraps.
  isValueLengthType(type) {
    if (type === void 0) {
      return false;
    }
    if (type.flags & _typescript2.default.TypeFlags.Union) {
      const parts = _nullishCoalesce(type.types, () => ( []));
      return parts.length > 0 && parts.every((part) => this.isValueLengthType(part));
    }
    return this.getChecker().isArrayType(type) || this.getChecker().isTupleType(type) || this.isStringType(type.flags);
  }
  printArrayLength(node, identation, leftExpr = void 0) {
    const receiver = _nullishCoalesce(leftExpr, () => ( this.printNode(node.expression, 0)));
    if (this.isValueLengthType(this.typeOfNodeIfAny(node.expression))) {
      return `Value::Int(${receiver}.len() as i64)`;
    }
    return `get_array_length(&${receiver})`;
  }
  // Object-typed values are Dicts at runtime, so `key in obj` is a plain
  // key lookup. Arrays keep the helper: `in_op` searches them element-wise.
  isDictShapedType(type) {
    if (type === void 0 || !(type.flags & _typescript2.default.TypeFlags.Object)) {
      return false;
    }
    const checker = this.getChecker();
    if (checker.isArrayType(type) || checker.isTupleType(type) || checker.isArrayLikeType(type)) {
      return false;
    }
    const objectFlags = type.objectFlags;
    if (objectFlags & (_typescript2.default.ObjectFlags.Class | _typescript2.default.ObjectFlags.Reference)) {
      return false;
    }
    return type.getCallSignatures().length === 0;
  }
  // `"key" in obj` → `matches!(&obj, Value::Dict(__d) if __d.contains_key("key"))`
  // In the TS AST `key` is the left operand and `obj` the right one.
  printNativeInOperator(key, obj) {
    if (!_typescript2.default.isStringLiteral(key)) {
      return void 0;
    }
    if (!this.isDictShapedType(this.typeOfNodeIfAny(obj))) {
      return void 0;
    }
    const printedKey = this.printStringLiteral(key);
    const keyLiteral = printedKey.match(/^Value::Str\((.+)\.to_string\(\)\)$/);
    if (!keyLiteral) {
      return void 0;
    }
    const objExpr = this.printNode(obj, 0);
    return `Value::Bool(matches!(&${objExpr}, Value::Dict(__d) if __d.contains_key(${keyLiteral[1]})))`;
  }
  // `negate(&Value::Int(n))` is `Value::Int(-n)` (same for Float) — fold the
  // literal so no helper call is needed. Runtime `negate` also coerces
  // strings/bools/floats, so only Int/Float literals can be folded.
  foldNegateLiteral(operandText) {
    const match = operandText.match(/^Value::(Int|Float)\((-?)(\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\)$/);
    if (!match) {
      return void 0;
    }
    const digits = match[3].replaceAll("_", "");
    if (digits.replace(".", "").length > 18) {
      return void 0;
    }
    const sign = match[2] === "-" ? "" : "-";
    return `Value::${match[1]}(${sign}${match[3]})`;
  }
  // Ensure a & ref prefix — skip only if already a reference
  ensureRef(expr) {
    if (expr.startsWith("&")) {
      return expr;
    }
    return `&${expr}`;
  }
  // TS `number` / number-literal type proof for a comparison operand. Unions
  // (`number | undefined`) and `any` are rejected — those keep the helper.
  isNumberTyped(node) {
    const type = this.getChecker().getTypeAtLocation(node);
    if (type === void 0) {
      return false;
    }
    return (type.flags & (_typescript2.default.TypeFlags.Number | _typescript2.default.TypeFlags.NumberLiteral)) !== 0;
  }
  // Positions whose emitted Rust is a native `bool`: if/while/do/for
  // conditions, `? :` conditions, `!` operands and `&&` / `||` operands.
  // Parentheses are transparent.
  isBooleanPosition(node) {
    let current = node;
    let parent = current.parent;
    while (parent !== void 0 && _typescript2.default.isParenthesizedExpression(parent)) {
      current = parent;
      parent = parent.parent;
    }
    if (parent === void 0) {
      return false;
    }
    switch (parent.kind) {
      case SyntaxKind4.IfStatement:
      case SyntaxKind4.WhileStatement:
      case SyntaxKind4.DoStatement:
        return parent.expression === current;
      case SyntaxKind4.ForStatement:
        return parent.condition === current;
      case SyntaxKind4.ConditionalExpression:
        return parent.condition === current;
      case SyntaxKind4.PrefixUnaryExpression:
        return parent.operator === SyntaxKind4.ExclamationToken;
      case SyntaxKind4.BinaryExpression:
        return parent.operatorToken.kind === SyntaxKind4.AmpersandAmpersandToken || parent.operatorToken.kind === SyntaxKind4.BarBarToken;
    }
    return false;
  }
  // `is_less_than` & co. compare two `Value`s and answer `false` for
  // non-numbers; with both operands checker-typed numbers the same f64
  // comparison runs natively on `Value::as_f64()` unwraps.
  printNativeNumericComparison(node, operator, leftText, rightText) {
    const unwrap = (text) => `${text}.as_f64().unwrap_or(f64::NAN)`;
    const comparison = `${unwrap(leftText)} ${operator} ${unwrap(rightText)}`;
    return this.isBooleanPosition(node) ? comparison : `Value::Bool(${comparison})`;
  }
  // ── native arithmetic (`+ - * /`) ────────────────────────────────────────
  // When the checker proves both operands are numbers (`Int`/`Float` at
  // runtime) or, for `+`, both are strings, the helper call is replaced by
  // the arithmetic itself: a 4-arm `Value` match reproducing the helper's
  // Int/Float dispatch, `as_f64()` division, or a `format!` string concat.
  // Anything the checker cannot prove keeps the runtime helper.
  isNumberLikeType(type) {
    if (!type) {
      return false;
    }
    if (type.flags === _typescript2.default.TypeFlags.Number || type.flags === _typescript2.default.TypeFlags.NumberLiteral) {
      return true;
    }
    if (type.flags === _typescript2.default.TypeFlags.Union && Array.isArray(type.types)) {
      return type.types.length > 0 && type.types.every((member) => this.isNumberLikeType(member));
    }
    return false;
  }
  isStringLikeType(type) {
    if (!type) {
      return false;
    }
    if (type.flags === _typescript2.default.TypeFlags.String || type.flags === _typescript2.default.TypeFlags.StringLiteral) {
      return true;
    }
    if (type.flags === _typescript2.default.TypeFlags.Union && Array.isArray(type.types)) {
      return type.types.length > 0 && type.types.every((member) => this.isStringLikeType(member));
    }
    return false;
  }
  // `(+|-)` with the left operand of `+=`/`-=`: assignment plus the same
  // native emission as the plain binary form.
  printNativeAssignmentArithmetic(op, left, right, leftText, rightText) {
    let leftType, rightType;
    try {
      const checker = this.getChecker();
      leftType = checker.getTypeAtLocation(left);
      rightType = checker.getTypeAtLocation(right);
    } catch (e) {
      return void 0;
    }
    if (op === SyntaxKind4.PlusToken && this.isStringLikeType(leftType) && this.isStringLikeType(rightType)) {
      return `${leftText} = ${this.printNativeStringConcat(leftText, rightText)}`;
    }
    if (!this.isNumberLikeType(leftType) || !this.isNumberLikeType(rightType)) {
      return void 0;
    }
    return `${leftText} = ${this.printNativeNumeric(op, leftText, rightText)}`;
  }
  printNativeArithmetic(op, left, right, leftText, rightText) {
    if (op !== SyntaxKind4.PlusToken && op !== SyntaxKind4.MinusToken && op !== SyntaxKind4.AsteriskToken && op !== SyntaxKind4.SlashToken) {
      return void 0;
    }
    let leftType, rightType;
    try {
      const checker = this.getChecker();
      leftType = checker.getTypeAtLocation(left);
      rightType = checker.getTypeAtLocation(right);
    } catch (e) {
      return void 0;
    }
    if (op === SyntaxKind4.PlusToken && this.isStringLikeType(leftType) && this.isStringLikeType(rightType)) {
      return this.printNativeStringConcat(leftText, rightText);
    }
    if (!this.isNumberLikeType(leftType) || !this.isNumberLikeType(rightType)) {
      return void 0;
    }
    return this.printNativeNumeric(op, leftText, rightText);
  }
  printNativeStringConcat(leftText, rightText) {
    return `Value::Str(format!("{}{}", ${leftText}, ${rightText}))`;
  }
  // Both operands are `Int`/`Float` at runtime; `-> Value::Null` covers the
  // `Null`/non-numeric values the same way the helper's fallthrough does.
  // Always parenthesised so it composes under `&`, in argument position and
  // as an operand of another native match.
  printNativeNumeric(op, leftText, rightText) {
    const left = `(${leftText})`;
    const right = `(${rightText})`;
    if (op === SyntaxKind4.SlashToken) {
      return `(match (${left}.as_f64(), ${right}.as_f64()) { (Some(x), Some(y)) if y != 0.0 => Value::Float(x / y), _ => Value::Null })`;
    }
    const sign = op === SyntaxKind4.PlusToken ? "+" : op === SyntaxKind4.MinusToken ? "-" : "*";
    return `(match (&${left}, &${right}) { (Value::Int(x), Value::Int(y)) => Value::Int(x ${sign} y), (Value::Int(x), Value::Float(y)) => Value::Float(*x as f64 ${sign} *y), (Value::Float(x), Value::Int(y)) => Value::Float(*x ${sign} *y as f64), (Value::Float(x), Value::Float(y)) => Value::Float(x ${sign} y), _ => Value::Null })`;
  }
  printCustomBinaryExpressionIfAny(node, identation) {
    const left = node.left;
    const right = node.right;
    const op = node.operatorToken.kind;
    if (op === SyntaxKind4.EqualsToken && left.kind === SyntaxKind4.ArrayLiteralExpression) {
      const elements = left.elements;
      const rhs = this.printNode(right, 0);
      const tmpName = "__destr_tmp";
      const nativeList = this.isProvenListExpression(right);
      const assignments = elements.map((e, idx) => {
        const target = this.printNode(e, 0);
        if (nativeList) {
          return `${target} = ${this.printNativeListIndex(tmpName, idx)}`;
        }
        return `${target} = get_value(&${tmpName}, &Value::Int(${idx}))`;
      }).join("; ");
      return `{ let ${tmpName} = ${rhs}; ${assignments}; }`;
    }
    if (op === SyntaxKind4.EqualsToken && left.kind === SyntaxKind4.ElementAccessExpression) {
      const keys = [];
      let baseExpr = null;
      let cur = left;
      while (_typescript2.default.isElementAccessExpression(cur)) {
        keys.unshift(cur.argumentExpression);
        const expr = cur.expression;
        if (!_typescript2.default.isElementAccessExpression(expr)) {
          baseExpr = expr;
          break;
        }
        cur = expr;
      }
      const containerStr = this.printNode(baseExpr, 0);
      const keyStrs = keys.map((k) => this.printNode(k, 0));
      let acc = `&mut ${containerStr}`;
      for (let i = 0; i < keyStrs.length - 1; i++) {
        acc = `get_value_mut(${acc}, &${keyStrs[i]})`;
      }
      const lastKey = keyStrs[keyStrs.length - 1];
      const rhs = this.printNode(right, 0);
      return `add_element_to_object(${acc}, &${lastKey}, ${rhs})`;
    }
    if (left.kind === SyntaxKind4.TypeOfExpression) {
      const expression = left.expression;
      const rightText = right.text;
      const target = this.printNode(expression, 0);
      const isDiff = op === SyntaxKind4.ExclamationEqualsEqualsToken || op === SyntaxKind4.ExclamationEqualsToken;
      const not = isDiff ? "!" : "";
      switch (rightText) {
        case "string":
          return `${not}is_string(&${target})`;
        case "number":
          return `${not}is_number(&${target})`;
        case "boolean":
          return `${not}is_bool(&${target})`;
        case "object":
          return `${not}is_object(&${target})`;
        case "function":
          return `${not}is_function(&${target})`;
      }
    }
    if (op === SyntaxKind4.InKeyword) {
      const native = this.printNativeInOperator(left, right);
      if (native !== void 0) {
        return native;
      }
      return `Value::Bool(in_op(&${this.printNode(right, 0)}, &${this.printNode(left, 0)}))`;
    }
    if (op === SyntaxKind4.PlusEqualsToken && left.kind !== SyntaxKind4.ElementAccessExpression) {
      const leftText = this.printNode(left, 0);
      const rightText = this.printNode(right, 0);
      const native = this.printNativeAssignmentArithmetic(SyntaxKind4.PlusToken, left, right, leftText, rightText);
      if (native !== void 0) {
        return native;
      }
      return `${leftText} = add(&${leftText}, &${rightText})`;
    }
    if (op === SyntaxKind4.MinusEqualsToken && left.kind !== SyntaxKind4.ElementAccessExpression) {
      const leftText = this.printNode(left, 0);
      const rightText = this.printNode(right, 0);
      const native = this.printNativeAssignmentArithmetic(SyntaxKind4.MinusToken, left, right, leftText, rightText);
      if (native !== void 0) {
        return native;
      }
      return `${leftText} = subtract(&${leftText}, &${rightText})`;
    }
    if (op === SyntaxKind4.EqualsEqualsToken || op === SyntaxKind4.EqualsEqualsEqualsToken || op === SyntaxKind4.ExclamationEqualsToken || op === SyntaxKind4.ExclamationEqualsEqualsToken) {
      const nativeEquality = this.printNativeEqualityComparison(left, right, op);
      if (nativeEquality) {
        return `Value::Bool(${nativeEquality})`;
      }
    }
    if (op === SyntaxKind4.AmpersandAmpersandToken || op === SyntaxKind4.BarBarToken) {
      if (this.hasNativeComparisonOperand(left) || this.hasNativeComparisonOperand(right)) {
        return `Value::Bool(${this.printLogicalInBooleanContext(node)})`;
      }
    }
    if (op in this.binaryExpressionsWrappers) {
      const nativeOperator = _RustTranspiler.NATIVE_COMPARISON_OPERATORS[op];
      if (nativeOperator !== void 0 && this.isNumberTyped(left) && this.isNumberTyped(right)) {
        return this.printNativeNumericComparison(node, nativeOperator, this.printNode(left, 0), this.printNode(right, 0));
      }
      const [fnName, close] = this.binaryExpressionsWrappers[op];
      const leftText = this.printNode(left, 0);
      const rightText = this.printNode(right, 0);
      const native = this.printNativeArithmetic(op, left, right, leftText, rightText);
      if (native !== void 0) {
        return native;
      }
      const leftRef = this.ensureRef(leftText);
      const rightRef = this.ensureRef(rightText);
      return `${fnName}${leftRef}, ${rightRef}${close}`;
    }
    return void 0;
  }
  printBinaryExpression(node, identation) {
    const custom = this.printCustomBinaryExpressionIfAny(node, identation);
    if (custom) {
      return custom;
    }
    return super.printBinaryExpression(node, identation);
  }
  // `Date.now()` → runtime helper returning current epoch millis.
  printDateNowCall(node, identation) {
    return "date_now()";
  }
  // `str.padStart(len, pad)` / `str.padEnd(len, pad)` → runtime helpers
  // (`pad_start` / `pad_end` take `(&Value, &Value, &Value)`).
  printPadStartCall(node, identation, name, parsedArg, parsedArg2) {
    return `pad_start(${this.ensureRef(name)}, ${this.ensureRef(parsedArg)}, ${this.ensureRef(parsedArg2)})`;
  }
  printPadEndCall(node, identation, name, parsedArg, parsedArg2) {
    return `pad_end(${this.ensureRef(name)}, ${this.ensureRef(parsedArg)}, ${this.ensureRef(parsedArg2)})`;
  }
  printVariableDeclarationList(node, identation) {
    const declaration = node.declarations[0];
    const isNew = declaration.initializer && declaration.initializer.kind === SyntaxKind4.NewExpression;
    if (_optionalChain([declaration, 'optionalAccess', _532 => _532.name, 'access', _533 => _533.kind]) === SyntaxKind4.ArrayBindingPattern) {
      const elements = declaration.name.elements;
      const parsedElements = elements.map((e) => this.printNode(e.name, 0));
      const syntheticName = parsedElements.join("") + "Variable";
      let stmt = `${this.getIden(identation)}let mut ${syntheticName} = ${this.printNode(declaration.initializer, 0)};
`;
      const nativeList = this.isProvenListExpression(declaration.initializer);
      parsedElements.forEach((e, idx) => {
        const access = nativeList ? this.printNativeListIndex(syntheticName, idx) : `get_value(&${syntheticName}, &Value::Int(${idx}))`;
        const line = `${this.getIden(identation)}let mut ${e}: Value = ${access}`;
        stmt += idx < parsedElements.length - 1 ? line + ";\n" : line;
      });
      return stmt;
    }
    const varName = this.printNode(declaration.name, 0);
    if (!declaration.initializer) {
      return `${this.getIden(identation)}let mut ${varName}: Value = Value::Null`;
    }
    const parsedValue = this.printNode(declaration.initializer, identation).trim();
    if (isNew) {
      return `${this.getIden(identation)}let mut ${varName} = ${parsedValue}`;
    }
    const boolValue = this.getRustBoolLocalInitializer(declaration, parsedValue);
    if (boolValue !== void 0) {
      return `${this.getIden(identation)}let mut ${varName}: bool = ${boolValue}`;
    }
    return `${this.getIden(identation)}let mut ${varName}: Value = ${parsedValue}`;
  }
  // `Value::Bool(<expr>)` spanning the whole expression → `<expr>`.
  peelValueBoolBox(printedValue) {
    const prefix = "Value::Bool(";
    if (!printedValue.startsWith(prefix) || !printedValue.endsWith(")")) {
      return void 0;
    }
    let depth = 0;
    for (let i = prefix.length - 1; i < printedValue.length; i++) {
      const char = printedValue[i];
      if (char === '"') {
        i++;
        while (i < printedValue.length && printedValue[i] !== '"') {
          if (printedValue[i] === "\\")
            i++;
          i++;
        }
        continue;
      }
      if (char === "(")
        depth++;
      else if (char === ")") {
        depth--;
        if (depth === 0) {
          return i === printedValue.length - 1 ? printedValue.slice(prefix.length, i) : void 0;
        }
      }
    }
    return void 0;
  }
  // `((expr))` → `expr` — a redundant layer kept from the TS source; the
  // right-hand side of a declaration binds the whole expression anyway.
  stripOuterParens(printedValue) {
    let value = printedValue.trim();
    while (value.startsWith("(") && value.endsWith(")")) {
      let depth = 0;
      let closesAtEnd = true;
      for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if (char === '"') {
          i++;
          while (i < value.length && value[i] !== '"') {
            if (value[i] === "\\")
              i++;
            i++;
          }
          continue;
        }
        if (char === "(")
          depth++;
        else if (char === ")") {
          depth--;
          if (depth === 0 && i !== value.length - 1) {
            closesAtEnd = false;
            break;
          }
        }
      }
      if (!closesAtEnd || depth !== 0)
        break;
      value = value.slice(1, -1).trim();
    }
    return value;
  }
  // `is_equal(...)` / `!is_true(...)` / `contains(...)` — bare bool helper calls.
  printedBoolHelperCall(printedValue) {
    const stripped = printedValue.startsWith("!") ? printedValue.slice(1).trim() : printedValue;
    const match = /^([a-z_][a-z0-9_]*)\(/.exec(stripped);
    return match !== null && _RustTranspiler.RUST_BOOL_RESULT_HELPERS.has(match[1]);
  }
  // Source shapes the printer turns into a bool: comparisons, `&&`/`||`
  // (each operand is is_true-wrapped), `!`, `in`, `instanceof`, true/false.
  rustNodeIsBoolExpression(node) {
    switch (_optionalChain([node, 'optionalAccess', _534 => _534.kind])) {
      case SyntaxKind4.TrueKeyword:
      case SyntaxKind4.FalseKeyword:
        return true;
      case SyntaxKind4.ParenthesizedExpression:
        return this.rustNodeIsBoolExpression(node.expression);
      case SyntaxKind4.PrefixUnaryExpression:
        return node.operator === SyntaxKind4.ExclamationToken;
      case SyntaxKind4.BinaryExpression:
        return _RustTranspiler.COMPARISON_OPS.has(node.operatorToken.kind) || node.operatorToken.kind === SyntaxKind4.AmpersandAmpersandToken || node.operatorToken.kind === SyntaxKind4.BarBarToken || node.operatorToken.kind === SyntaxKind4.InKeyword || node.operatorToken.kind === SyntaxKind4.InstanceOfKeyword;
    }
    return false;
  }
  rustTypeIsBoolean(node) {
    try {
      const type = this.getChecker().getTypeAtLocation(node);
      if ((type.flags & _typescript2.default.TypeFlags.BooleanLike) !== 0) {
        return true;
      }
      return this.getChecker().typeToString(type).trim() === "boolean";
    } catch (e) {
      return false;
    }
  }
  rustEnclosingFunction(node) {
    let current = _optionalChain([node, 'optionalAccess', _535 => _535.parent]);
    while (current) {
      switch (current.kind) {
        case SyntaxKind4.MethodDeclaration:
        case SyntaxKind4.FunctionDeclaration:
        case SyntaxKind4.FunctionExpression:
        case SyntaxKind4.ArrowFunction:
        case SyntaxKind4.Constructor:
        case SyntaxKind4.SourceFile:
          return current;
      }
      current = current.parent;
    }
    return void 0;
  }
  rustBindsName(node, name) {
    switch (_optionalChain([node, 'optionalAccess', _536 => _536.kind])) {
      case SyntaxKind4.VariableDeclaration:
      case SyntaxKind4.Parameter:
      case SyntaxKind4.FunctionDeclaration:
      case SyntaxKind4.ClassDeclaration:
      case SyntaxKind4.PropertyDeclaration:
      case SyntaxKind4.FunctionExpression:
      case SyntaxKind4.ArrowFunction:
        return _optionalChain([node, 'access', _537 => _537.name, 'optionalAccess', _538 => _538.kind]) === SyntaxKind4.Identifier && node.name.escapedText === name;
    }
    return false;
  }
  // Only these uses compile against a native `bool` local today: `is_true(&x)`
  // (under any depth of `(...)`, `!`, `&&`/`||`), and the condition slot of
  // if/while/for/ternary — all printed is_true-wrapped.
  rustIdentifierUseIsCondition(node) {
    let current = node;
    let parent = current.parent;
    while (parent) {
      switch (parent.kind) {
        case SyntaxKind4.ParenthesizedExpression:
          if (parent.expression !== current)
            return false;
          break;
        case SyntaxKind4.PrefixUnaryExpression:
          if (parent.operator !== SyntaxKind4.ExclamationToken || parent.operand !== current)
            return false;
          break;
        case SyntaxKind4.BinaryExpression:
          if (parent.operatorToken.kind !== SyntaxKind4.AmpersandAmpersandToken && parent.operatorToken.kind !== SyntaxKind4.BarBarToken)
            return false;
          break;
        case SyntaxKind4.IfStatement:
        case SyntaxKind4.WhileStatement:
        case SyntaxKind4.DoStatement:
          return parent.expression === current;
        case SyntaxKind4.ForStatement:
        case SyntaxKind4.ConditionalExpression:
          return parent.condition === current;
        default:
          return false;
      }
      current = parent;
      parent = current.parent;
    }
    return false;
  }
  rustLocalUsesAcceptBool(declaration, sourceName) {
    const scope = this.rustEnclosingFunction(declaration);
    if (scope === void 0 || sourceName === void 0) {
      return false;
    }
    let safe = true;
    const visit = (n) => {
      if (!safe)
        return;
      if (n !== declaration && this.rustBindsName(n, sourceName)) {
        safe = false;
        return;
      }
      if (n.kind === SyntaxKind4.Identifier && n.escapedText === sourceName && n !== declaration.name) {
        if (!this.rustIdentifierUseIsCondition(n)) {
          safe = false;
          return;
        }
      }
      _typescript2.default.forEachChild(n, visit);
    };
    _typescript2.default.forEachChild(scope, visit);
    return safe;
  }
  // `let x = <bool expr>` → the printed bool expression, or undefined.
  getRustBoolLocalInitializer(declaration, printedValue) {
    const initializer = declaration.initializer;
    if (initializer === void 0 || _optionalChain([declaration, 'access', _539 => _539.name, 'optionalAccess', _540 => _540.kind]) !== SyntaxKind4.Identifier) {
      return void 0;
    }
    const inner = this.stripOuterParens(printedValue);
    const peeled = this.peelValueBoolBox(inner);
    if (peeled === void 0 && !this.printedBoolHelperCall(inner) && !this.rustNodeIsBoolExpression(initializer)) {
      return void 0;
    }
    if (!this.rustTypeIsBoolean(initializer)) {
      return void 0;
    }
    if (!this.rustLocalUsesAcceptBool(declaration, declaration.name.escapedText)) {
      return void 0;
    }
    return peeled !== void 0 ? peeled : inner;
  }
  printPropertyDeclaration(node, identation) {
    const name = this.printNode(node.name, 0);
    if (node.initializer) {
      const init = this.printNode(node.initializer, 0);
      return `${this.getIden(identation)}${name}: Value, // default: ${init}`;
    }
    return `${this.getIden(identation)}${name}: Value,`;
  }
  // Collect property declarations with their initializers for use in new()
  getStructFields(node) {
    const propDecls = node.members.filter((m) => m.kind === SyntaxKind4.PropertyDeclaration);
    return propDecls.map((p) => {
      const name = this.printNode(p.name, 0);
      const init = p.initializer ? this.printNode(p.initializer, 0) : "Value::Null";
      return { name, init };
    });
  }
  printStruct(node, identation) {
    const fields = this.getStructFields(node);
    const fieldLines = fields.map((f) => `${this.getIden(identation + 1)}pub ${f.name}: Value,`).join("\n");
    return `#[derive(Debug, Clone)]
pub struct ${this.className} {
${fieldLines}
}`;
  }
  printNewMethod(node, identation) {
    const fields = this.getStructFields(node);
    const fieldInits = fields.map((f) => `${this.getIden(identation + 2)}${f.name}: ${f.init},`).join("\n");
    return `
impl ${this.className} {
${this.getIden(identation + 1)}pub fn new() -> Self {
${this.getIden(identation + 2)}${this.className} {
${fieldInits}
${this.getIden(identation + 2)}}
${this.getIden(identation + 1)}}
}`;
  }
  printClass(node, identation) {
    this.className = node.name.escapedText;
    const methods = node.members.filter((m) => m.kind === SyntaxKind4.MethodDeclaration);
    methods.forEach((method) => {
      const name = method.name.escapedText;
      const params = method.parameters;
      const requiredCount = params.filter((p) => !p.initializer && !p.questionToken).length;
      const hasOptional = params.some((p) => p.initializer !== void 0 || p.questionToken !== void 0);
      if (hasOptional) {
        this.methodSignatures[name] = { requiredCount };
      }
    });
    const struct = this.printStruct(node, identation);
    const newMethod = this.printNewMethod(node, identation);
    const classMethods = methods.map((m) => this.printMethodDeclaration(m, identation)).join("\n\n");
    const implBlock = `
impl ${this.className} {
${classMethods}
}`;
    return struct + newMethod + implBlock;
  }
  printMethodDefinition(node, identation) {
    const name = node.name.escapedText;
    const params = node.parameters;
    const hasOptional = params.some((p) => p.initializer !== void 0 || p.questionToken !== void 0);
    const requiredParams = params.filter((p) => !p.initializer && !p.questionToken);
    const optionalParams = params.filter((p) => p.initializer !== void 0 || p.questionToken !== void 0);
    let parsedArgs = "&self";
    if (requiredParams.length > 0) {
      const reqArgs = requiredParams.map((p) => `${this.printNode(p.name, 0)}: Value`).join(", ");
      parsedArgs += ", " + reqArgs;
    }
    if (hasOptional) {
      parsedArgs += ", optional_args: &[Value]";
    }
    const returnType = this.printRustFunctionType(node);
    const retStr = returnType ? ` -> ${returnType}` : "";
    return `${this.getIden(identation + 1)}pub fn ${name}(${parsedArgs})${retStr}`;
  }
  printRustFunctionType(node) {
    try {
      const type = this.getChecker().getReturnTypeOfSignature(this.getChecker().getSignatureFromDeclaration(node));
      if (type.flags === _typescript2.default.TypeFlags.Void) {
        return "";
      }
    } catch (e) {
    }
    return "Value";
  }
  printMethodDeclaration(node, identation) {
    const methodDef = this.printMethodDefinition(node, identation);
    const params = node.parameters;
    const optionalParams = params.filter((p) => p.initializer !== void 0 || p.questionToken !== void 0);
    let optionalInits = "";
    if (optionalParams.length > 0) {
      const requiredCount = params.filter((p) => !p.initializer && !p.questionToken).length;
      optionalInits = optionalParams.map((p, idx) => {
        const pname = this.printNode(p.name, 0);
        const defaultVal = p.initializer ? this.printNode(p.initializer, 0) : "Value::Null";
        return `${this.getIden(identation + 2)}let ${pname} = get_arg(optional_args, ${idx}, ${defaultVal});`;
      }).join("\n") + "\n";
    }
    const blockOpen = this.getBlockOpen(identation);
    const blockClose = this.getBlockClose(identation);
    const statements = node.body.statements.map((s) => this.printNode(s, identation + 2)).join("\n");
    const body = blockOpen + optionalInits + statements + blockClose;
    return this.printNodeCommentsIfAny(node, identation, methodDef + body);
  }
  printFunctionDefinition(node, identation) {
    const name = _nullishCoalesce(_optionalChain([node, 'access', _541 => _541.name, 'optionalAccess', _542 => _542.escapedText]), () => ( ""));
    const params = node.parameters;
    const parsedArgs = params.map((p) => `${this.printNode(p.name, 0)}: Value`).join(", ");
    const returnType = this.printRustFunctionType(node);
    const retStr = returnType ? ` -> ${returnType}` : "";
    return `${this.getIden(identation)}fn ${name}(${parsedArgs})${retStr}`;
  }
  printFunctionDeclaration(node, identation) {
    if (_typescript2.default.isArrowFunction(node)) {
      const parameters = node.parameters.map((p) => `${this.printNode(p.name, 0)}: Value`).join(", ");
      const body = this.printNode(node.body);
      return `|${parameters}| ${body}`;
    }
    const funcDef = this.printFunctionDefinition(node, identation);
    const funcBody = super.printFunctionBody(node, identation);
    return this.printNodeCommentsIfAny(node, identation, funcDef + funcBody);
  }
  printOutOfOrderCallExpressionIfAny(node, identation) {
    if (node.expression.kind !== SyntaxKind4.PropertyAccessExpression) {
      return void 0;
    }
    const expr = node.expression;
    const args = node.arguments;
    if (expr.expression.kind === SyntaxKind4.ThisKeyword) {
      const methodName = expr.name.escapedText;
      const sig = this.methodSignatures[methodName];
      if (sig) {
        const requiredArgs = args.slice(0, sig.requiredCount).map((a) => this.printNode(a, 0)).join(", ");
        const optionalArgsList = args.slice(sig.requiredCount).map((a) => this.printNode(a, 0)).join(", ");
        const optSlice = optionalArgsList ? `&[${optionalArgsList}]` : "&[]";
        const reqPart = requiredArgs ? `${requiredArgs}, ` : "";
        return `self.${methodName}(${reqPart}${optSlice})`;
      }
    }
    return void 0;
  }
  printCallExpression(node, identation) {
    const expression = node.expression;
    if (expression.kind === SyntaxKind4.PropertyAccessExpression) {
      const exprText = expression.getText().trim();
      if (exprText === "console.log") {
        const args = node.arguments;
        if (args.length === 1) {
          const argText = this.printNode(args[0], 0).trim();
          const ref = argText.startsWith("Value::") ? `&${argText}` : argText.startsWith("&") ? argText : `&${argText}`;
          return `println_val(${ref})`;
        }
        const argParts = Array.from(args).map((a) => {
          const t = this.printNode(a, 0).trim();
          return t.startsWith("Value::") || !t.startsWith("&") ? `&${t}` : t;
        }).join(", ");
        return `println_val(${argParts})`;
      }
    }
    const outOfOrder = this.printOutOfOrderCallExpressionIfAny(node, identation);
    if (outOfOrder)
      return outOfOrder;
    return super.printCallExpression(node, identation);
  }
  printThisKeyword(node, identation) {
    return "self";
  }
  printNewExpression(node, identation) {
    let expression = _optionalChain([node, 'access', _543 => _543.expression, 'optionalAccess', _544 => _544.escapedText]);
    expression = expression ? expression : this.printNode(node.expression);
    const args = node.arguments.map((a) => this.printNode(a, identation)).join(", ");
    if (expression === "Error") {
      return args || "Value::Null";
    }
    const errorClassPattern = /^(?:[A-Z][a-zA-Z]*(?:Error|Required|Found|Failed|Rejected|Available|Exceeded|Limit|Pending|Funds|Address|Order|Cached|Fillable|Closed|Maintenance|Nonce|Timeout|Response|Settings|User|Supported|Implemented|Denied|Enabled|Suspended|Symbol|Change|Unavailable|Proxy|Set|Needed))$/;
    if (typeof expression === "string" && errorClassPattern.test(expression)) {
      const snake = expression.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").replace(/([a-z\d])([A-Z])/g, "$1_$2").toLowerCase();
      return `crate::exchange_errors::${snake}(${args})`;
    }
    return `${expression}::new(${args})`;
  }
  printPropertyAccessExpression(node, identation) {
    const transformedProperty = this.transformPropertyAcessExpressionIfNeeded(node);
    if (transformedProperty) {
      return this.getIden(identation) + transformedProperty;
    }
    const rightSide = node.name.escapedText;
    const rawExpression = node.getText().trim();
    if (this.FullPropertyAccessReplacements.hasOwnProperty(rawExpression)) {
      return this.FullPropertyAccessReplacements[rawExpression];
    }
    const leftExpr = this.printNode(node.expression, 0);
    if (rightSide === "length") {
      return this.printArrayLength(node, 0, leftExpr);
    }
    if (_typescript2.default.isIdentifier(node.name) && this.isShallowValueReceiver(node.expression) && this.isNativeAccessPositionSafe(node)) {
      const native = this.printNativeMapAccess(leftExpr, node.expression, String(rightSide));
      if (native)
        return native;
    }
    return `${leftExpr}.${rightSide}`;
  }
  toSnakeCaseName(name) {
    return name.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").replace(/([a-z\d])([A-Z])/g, "$1_$2").toLowerCase();
  }
  escapeRustStringLiteral(text) {
    return String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  }
  getCheckedTypeOf(node) {
    try {
      return this.getChecker().getTypeAtLocation(node);
    } catch (e) {
      return void 0;
    }
  }
  typeSymbolOf(type) {
    if (type === void 0 || type === null)
      return void 0;
    return _nullishCoalesce(_nullishCoalesce(_optionalChain([type, 'access', _545 => _545.getSymbol, 'optionalCall', _546 => _546()]), () => ( type.symbol)), () => ( type.aliasSymbol));
  }
  /** Types declared outside ts/src (Date, Response, Array, Promise, …) are never
   *  backed by a plain `Value` map in the rust port. */
  isLibDeclaredType(type) {
    const declarations = _nullishCoalesce(_optionalChain([this, 'access', _547 => _547.typeSymbolOf, 'call', _548 => _548(type), 'optionalAccess', _549 => _549.declarations]), () => ( []));
    return declarations.some((d) => {
      const file = _nullishCoalesce(_optionalChain([d, 'optionalAccess', _550 => _550.getSourceFile, 'optionalCall', _551 => _551(), 'optionalAccess', _552 => _552.fileName]), () => ( ""));
      return /[\\/]lib\.[^\\/]*\.d\.ts$/.test(file) || /[\\/]node_modules[\\/]typescript[\\/]/.test(file);
    });
  }
  isClassInstanceType(type) {
    if (type === void 0)
      return false;
    if (type.flags & (_typescript2.default.TypeFlags.Union | _typescript2.default.TypeFlags.Intersection)) {
      return (_nullishCoalesce(type.types, () => ( []))).some((member) => this.isClassInstanceType(member));
    }
    const symbol = _nullishCoalesce(this.typeSymbolOf(type), () => ( type.aliasSymbol));
    if (_optionalChain([symbol, 'optionalAccess', _553 => _553.flags]) & _typescript2.default.SymbolFlags.Class)
      return true;
    const declarations = _nullishCoalesce(_optionalChain([symbol, 'optionalAccess', _554 => _554.declarations]), () => ( []));
    return declarations.some((d) => _typescript2.default.isClassDeclaration(d) || _typescript2.default.isClassExpression(d));
  }
  hasCallableShape(type) {
    const checker = this.getChecker();
    return checker.getSignaturesOfType(type, _typescript2.default.SignatureKind.Call).length > 0 || checker.getSignaturesOfType(type, _typescript2.default.SignatureKind.Construct).length > 0;
  }
  isProvenListType(type) {
    if (!(type.flags & _typescript2.default.TypeFlags.Object))
      return false;
    const objectFlags = (_nullishCoalesce(type.objectFlags, () => ( 0))) | (_nullishCoalesce(_optionalChain([type, 'access', _555 => _555.target, 'optionalAccess', _556 => _556.objectFlags]), () => ( 0)));
    if (objectFlags & _typescript2.default.ObjectFlags.Tuple)
      return true;
    const name = _optionalChain([this, 'access', _557 => _557.typeSymbolOf, 'call', _558 => _558(type), 'optionalAccess', _559 => _559.getName, 'optionalCall', _560 => _560()]);
    if (name === "Array" || name === "ReadonlyArray")
      return true;
    const targetName = _optionalChain([this, 'access', _561 => _561.typeSymbolOf, 'call', _562 => _562(type.target), 'optionalAccess', _563 => _563.getName, 'optionalCall', _564 => _564()]);
    return targetName === "Array" || targetName === "ReadonlyArray";
  }
  /** True only for object types the rust port represents as `Value::Dict`
   *  (plain interfaces / index-signature / literal types — never classes). */
  isProvenMapType(type) {
    if (!(type.flags & _typescript2.default.TypeFlags.Object))
      return false;
    if (this.isProvenListType(type))
      return false;
    if (this.hasCallableShape(type))
      return false;
    if (this.isClassInstanceType(type))
      return false;
    if (this.isLibDeclaredType(type))
      return false;
    const hasStringIndex = this.getChecker().getIndexTypeOfType(type, _typescript2.default.IndexKind.String) !== void 0;
    return hasStringIndex || this.typeSymbolOf(type) !== void 0;
  }
  isProvenMapExpression(node) {
    const type = this.getCheckedTypeOf(node);
    return type !== void 0 && this.isProvenMapType(type);
  }
  isProvenListExpression(node) {
    const type = this.getCheckedTypeOf(node);
    return type !== void 0 && this.isProvenListType(type);
  }
  /** Native list-index read of a generator temp (`__destr_tmp.as_array()…`). */
  printNativeListIndex(receiverText, index) {
    return `${receiverText}.as_array().and_then(|__arr| __arr.get(${index})).cloned().unwrap_or(Value::Null)`;
  }
  /** Native read for one chain level, or undefined to keep `get_value`. */
  printNativeContainerAccess(receiverText, receiverNode, keyNode) {
    if (_typescript2.default.isStringLiteralLike(keyNode)) {
      return this.printNativeMapAccess(receiverText, receiverNode, keyNode.text);
    }
    if (_typescript2.default.isNumericLiteral(keyNode)) {
      const index = Number(keyNode.text);
      if (!Number.isInteger(index) || index < 0)
        return void 0;
      if (!this.isProvenListExpression(receiverNode))
        return void 0;
      return this.printNativeListIndex(receiverText, index);
    }
    return void 0;
  }
  printNativeMapAccess(receiverText, receiverNode, keyText) {
    if (!this.isProvenMapExpression(receiverNode))
      return void 0;
    const key = this.escapeRustStringLiteral(keyText);
    return `${receiverText}.as_map().and_then(|__m| __m.get("${key}")).cloned().unwrap_or(Value::Null)`;
  }
  isNodeInsideNode(node, container) {
    return node.pos >= container.pos && node.end <= container.end;
  }
  /** Root place of an access chain (`x` for `x['a']['b']`, `this.balance` for
   *  `this.balance['usdt']`), or undefined for a temporary. */
  rootPlaceText(node) {
    let current = node;
    while (current) {
      if (_typescript2.default.isPropertyAccessExpression(current) || _typescript2.default.isElementAccessExpression(current)) {
        if (current.expression.kind === _typescript2.default.SyntaxKind.ThisKeyword)
          return current.getText().trim();
        current = current.expression;
        continue;
      }
      if (_typescript2.default.isParenthesizedExpression(current)) {
        current = current.expression;
        continue;
      }
      if (_typescript2.default.isIdentifier(current) || current.kind === _typescript2.default.SyntaxKind.ThisKeyword) {
        return current.getText().trim();
      }
      return void 0;
    }
    return void 0;
  }
  /** The ccxt post-passes hoist `get_value(...)` reads out of `&mut` calls by
   *  matching their text; the native form is invisible to them, so it is only
   *  emitted where no such hoist is needed. */
  isNativeAccessPositionSafe(node) {
    const parent = node.parent;
    if (parent && _typescript2.default.isPropertyAccessExpression(parent) && parent.expression === node)
      return false;
    if (parent && _typescript2.default.isCallExpression(parent) && parent.expression === node)
      return false;
    const root = this.rootPlaceText(node);
    let current = node.parent;
    while (current) {
      if (_typescript2.default.isStatement(current) || _typescript2.default.isSourceFile(current) || _typescript2.default.isFunctionLike(current))
        break;
      if (_typescript2.default.isBinaryExpression(current) && this.isNodeInsideNode(node, current.right)) {
        const op = current.operatorToken.kind;
        const isAssign = op === _typescript2.default.SyntaxKind.EqualsToken || op >= _typescript2.default.SyntaxKind.PlusEqualsToken && op <= _typescript2.default.SyntaxKind.CaretEqualsToken;
        if (isAssign && root !== void 0 && this.rootPlaceText(current.left) === root)
          return false;
      }
      if (_typescript2.default.isCallExpression(current) && _typescript2.default.isPropertyAccessExpression(current.expression) && this.isNodeInsideNode(node, current) && current.arguments.some((a) => this.isNodeInsideNode(node, a))) {
        const callee = current.expression;
        if (root !== void 0 && this.rootPlaceText(callee.expression) === root)
          return false;
        if (callee.expression.kind === _typescript2.default.SyntaxKind.ThisKeyword && _RustTranspiler.MUT_SELF_METHODS.has(this.toSnakeCaseName(String(callee.name.escapedText))))
          return false;
      }
      current = current.parent;
    }
    return true;
  }
  /** Receiver shapes whose printed text is a single `Value` place (`x`, `this.x`). */
  isShallowValueReceiver(node) {
    if (_typescript2.default.isIdentifier(node))
      return true;
    return _typescript2.default.isPropertyAccessExpression(node) && node.expression.kind === _typescript2.default.SyntaxKind.ThisKeyword;
  }
  transformPropertyAcessExpressionIfNeeded(node) {
    const rightSide = node.name.escapedText;
    const leftExpr = this.printNode(node.expression, 0);
    if (rightSide === "length") {
      return this.printArrayLength(node, 0, leftExpr);
    }
    return void 0;
  }
  // `crate::value::get_value_k` is `get_value` for a `&str` key — the same
  // dict lookup minus the per-read `Value::Str` allocation. Three literal-key
  // families reach branches only `get_value` has (numeric cache/side indices,
  // the cache `hashmap` bucket, live client `subscriptions`/`futures`) and a
  // `this`/class receiver is not a `Value`, so those keep `get_value`.
  staticKeyLookup(node, container) {
    if (!_typescript2.default.isStringLiteral(node)) {
      return void 0;
    }
    const source = node.getSourceFile ? node.getSourceFile().fileName : "";
    if (typeof source === "string" && /\/test\//.test(source)) {
      return void 0;
    }
    if (container.kind === SyntaxKind4.ThisKeyword) {
      return void 0;
    }
    const text = node.text;
    if (text === "" || text in this.StringLiteralReplacements) {
      return void 0;
    }
    if (/^\d+$/.test(text) || text === "hashmap" || text === "subscriptions" || text === "futures") {
      return void 0;
    }
    let type;
    try {
      type = this.getChecker().getTypeAtLocation(container);
    } catch (e) {
      return void 0;
    }
    if (type !== void 0 && type.objectFlags & _typescript2.default.ObjectFlags.Class) {
      return void 0;
    }
    return this.quotedStringLiteral(text);
  }
  printElementAccessExpression(node, identation) {
    const special = this.printElementAccessExpressionExceptionIfAny(node);
    if (special)
      return special;
    const parent = node.parent;
    const isAssignmentTarget = parent !== void 0 && _typescript2.default.isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind >= SyntaxKind4.FirstAssignment && parent.operatorToken.kind <= SyntaxKind4.LastAssignment;
    const isCallOrPropertyTarget = parent !== void 0 && (_typescript2.default.isPropertyAccessExpression(parent) && parent.expression === node || _typescript2.default.isCallExpression(parent) && parent.expression === node);
    const keys = [];
    const receivers = [];
    const containers = [];
    let baseExpr = null;
    let current = node;
    while (_typescript2.default.isElementAccessExpression(current)) {
      keys.unshift(current.argumentExpression);
      receivers.unshift(current.expression);
      containers.unshift(current.expression);
      const expr = current.expression;
      if (!_typescript2.default.isElementAccessExpression(expr)) {
        baseExpr = expr;
        break;
      }
      current = expr;
    }
    const nativeAllowed = this.isNativeAccessPositionSafe(node);
    let acc = this.printNode(baseExpr, 0);
    keys.forEach((key, index) => {
      const native = nativeAllowed ? this.printNativeContainerAccess(acc, receivers[index], key) : void 0;
      if (native !== void 0) {
        acc = native;
        return;
      }
      const staticKey = isAssignmentTarget || isCallOrPropertyTarget ? void 0 : this.staticKeyLookup(key, containers[index]);
      if (staticKey !== void 0) {
        acc = `crate::value::get_value_k(&${acc}, ${staticKey})`;
        return;
      }
      const kRef = `&${this.printNode(key, 0)}`;
      acc = `get_value(&${acc}, ${kRef})`;
    });
    return acc;
  }
  printForStatement(node, identation) {
    const initNode = node.initializer;
    const condNode = node.condition;
    const incrNode = node.incrementor;
    const idn = this.getIden(identation);
    const idn1 = this.getIden(identation + 1);
    const initStr = initNode ? this.printNode(initNode, identation + 1) + ";\n" : "";
    const condStr = condNode ? this.printComparisonInBooleanContext(condNode, 0).trim() : "true";
    const incrStr = incrNode ? this.printNode(incrNode, 0) : "";
    const statements = node.statement.statements.map((s) => this.printNode(s, identation + 1)).join("\n");
    const body = `{
${statements}
${idn}}`;
    if (incrStr !== "") {
      const flag = `__for_first_${this.forLoopCounter++}`;
      const cond = `{ if !${flag} { ${incrStr}; } ${flag} = false; ${condStr} }`;
      return `${idn}{
${idn1}${initStr}${idn1}let mut ${flag}: bool = true;
${idn1}while ${cond} ${body}
${idn}}`;
    }
    return `${idn}{
${idn1}${initStr}${idn1}while ${condStr} ${body}
${idn}}`;
  }
  printCondition(node, identation) {
    if (node.kind === SyntaxKind4.BinaryExpression) {
      const opKind = node.operatorToken.kind;
      if (_RustTranspiler.COMPARISON_OPS.has(opKind)) {
        return this.printComparisonInBooleanContext(node, identation);
      }
      if (opKind === SyntaxKind4.AmpersandAmpersandToken || opKind === SyntaxKind4.BarBarToken) {
        if (this.hasNativeComparisonOperand(node.left) || this.hasNativeComparisonOperand(node.right)) {
          return `${this.getIden(identation)}${this.printLogicalInBooleanContext(node)}`;
        }
        return `${this.getIden(identation)}${this.printNode(node, 0)}`;
      }
    }
    if (node.kind === SyntaxKind4.PrefixUnaryExpression && node.operator === SyntaxKind4.ExclamationToken) {
      return this.printPrefixUnaryExpression(node, identation);
    }
    const expression = this.printNode(node, 0);
    return `${this.getIden(identation)}is_true(&${expression})`;
  }
  // Bool-position text for a comparison: the native payload compare (already
  // bool) when the checker proves it, the is_equal() helper otherwise.
  printComparisonInBooleanContext(node, identation) {
    const native = this.nativeEqualityText(node);
    if (native) {
      return `${this.getIden(identation)}(${native})`;
    }
    return `${this.getIden(identation)}${this.printNode(node, 0)}`;
  }
  // Native equality text of `node` (parens unwrapped), if the checker proves it.
  nativeEqualityText(node) {
    const inner = this.unwrapParens(node);
    if (inner === void 0 || inner.kind !== SyntaxKind4.BinaryExpression) {
      return void 0;
    }
    const op = inner.operatorToken.kind;
    if (op !== SyntaxKind4.EqualsEqualsToken && op !== SyntaxKind4.EqualsEqualsEqualsToken && op !== SyntaxKind4.ExclamationEqualsToken && op !== SyntaxKind4.ExclamationEqualsEqualsToken) {
      return void 0;
    }
    return this.printNativeEqualityComparison(inner.left, inner.right, op);
  }
  unwrapParens(node) {
    let inner = node;
    while (inner !== void 0 && inner.kind === SyntaxKind4.ParenthesizedExpression) {
      inner = inner.expression;
    }
    return inner;
  }
  // Does `node` carry a native payload compare in a position where the old
  // text started with a bool helper? The post-pass types locals by that token.
  hasNativeComparisonOperand(node) {
    const inner = this.unwrapParens(node);
    if (inner === void 0) {
      return false;
    }
    if (inner.kind === SyntaxKind4.PrefixUnaryExpression && inner.operator === SyntaxKind4.ExclamationToken) {
      return this.hasNativeComparisonOperand(inner.operand);
    }
    if (this.nativeEqualityText(inner) !== void 0) {
      return true;
    }
    if (inner.kind === SyntaxKind4.BinaryExpression) {
      const op = inner.operatorToken.kind;
      if (op === SyntaxKind4.AmpersandAmpersandToken || op === SyntaxKind4.BarBarToken) {
        return this.hasNativeComparisonOperand(inner.left) || this.hasNativeComparisonOperand(inner.right);
      }
    }
    return false;
  }
  // Bare `&&`/`||` text of a logical expression (its operands are bools).
  printLogicalInBooleanContext(node) {
    const token = node.operatorToken.kind === SyntaxKind4.AmpersandAmpersandToken ? "&&" : "||";
    const left = this.printCondition(node.left, 0).trim();
    const right = this.printCondition(node.right, 0).trim();
    return `${left} ${token} ${right}`;
  }
  printWhileStatement(node, identation) {
    const expr = this.printCondition(node.expression, 0);
    const body = this.printBlock(node.statement, identation);
    return `${this.getIden(identation)}while ${expr}${body}`;
  }
  printIfStatement(node, identation) {
    const expression = this.printCondition(node.expression, 0);
    const elseExists = node.elseStatement !== void 0;
    const ifBody = this.printBlock(node.thenStatement, identation, elseExists);
    let ifComplete = `${expression}${ifBody}`;
    const isElseIf = node.parent.kind === SyntaxKind4.IfStatement;
    if (isElseIf) {
      ifComplete = `else if ${ifComplete}`;
    } else {
      ifComplete = `${this.getIden(identation)}if ${ifComplete}`;
    }
    const elseStatement = node.elseStatement;
    if (_optionalChain([elseStatement, 'optionalAccess', _565 => _565.kind]) === SyntaxKind4.Block) {
      ifComplete += ` else${this.printBlock(elseStatement, identation)}`;
    } else if (_optionalChain([elseStatement, 'optionalAccess', _566 => _566.kind]) === SyntaxKind4.IfStatement) {
      ifComplete += " " + this.printIfStatement(elseStatement, identation);
    }
    return this.printNodeCommentsIfAny(node, identation, ifComplete);
  }
  printPostFixUnaryExpression(node, identation) {
    const { operand, operator } = node;
    const operandText = this.printNode(operand, 0);
    if (operator === SyntaxKind4.PlusPlusToken) {
      const native = this.printNativeIncrement(SyntaxKind4.PlusToken, operand, operandText);
      if (native !== void 0) {
        return `${this.getIden(identation)}${operandText} = ${native}`;
      }
      return `${this.getIden(identation)}${operandText} = add(&${operandText}, &Value::Int(1))`;
    }
    if (operator === SyntaxKind4.MinusMinusToken) {
      const native = this.printNativeIncrement(SyntaxKind4.MinusToken, operand, operandText);
      if (native !== void 0) {
        return `${this.getIden(identation)}${operandText} = ${native}`;
      }
      return `${this.getIden(identation)}${operandText} = subtract(&${operandText}, &Value::Int(1))`;
    }
    return super.printPostFixUnaryExpression(node, identation);
  }
  // `x++` / `x--` on a checker-typed number: native `+`/`-` with `Value::Int(1)`.
  printNativeIncrement(op, operand, operandText) {
    try {
      if (!this.isNumberLikeType(this.getChecker().getTypeAtLocation(operand))) {
        return void 0;
      }
    } catch (e) {
      return void 0;
    }
    return this.printNativeNumeric(op, operandText, "Value::Int(1)");
  }
  printPrefixUnaryExpression(node, identation) {
    const { operand, operator } = node;
    if (operator === SyntaxKind4.ExclamationToken) {
      return this.getIden(identation) + "!" + this.printCondition(node.operand, 0);
    }
    if (operator === SyntaxKind4.MinusToken) {
      const operandText = this.printNode(operand, 0);
      const folded = this.foldNegateLiteral(operandText);
      if (folded !== void 0) {
        return this.getIden(identation) + folded;
      }
      return this.getIden(identation) + `negate(&${operandText})`;
    }
    return this.getIden(identation) + this.PrefixFixOperators[operator] + this.printNode(operand, 0);
  }
  printObjectLiteralExpression(node, identation) {
    if (node.properties.length === 0) {
      return "Value::Map({\n" + this.getIden(identation + 1) + "let mut m = std::collections::HashMap::new();\n" + this.getIden(identation + 1) + "m\n" + this.getIden(identation) + "})";
    }
    const escapeKey = (s) => {
      return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    };
    const lines = node.properties.map((p) => {
      if (_typescript2.default.isShorthandPropertyAssignment(p)) {
        const name2 = p.name.escapedText;
        return `${this.getIden(identation + 2)}m.insert("${escapeKey(name2)}".to_string(), ${name2}.clone());`;
      }
      const { name, initializer } = p;
      const keyText = _typescript2.default.isStringLiteral(name) ? name.text : name.escapedText;
      const valText = this.printNode(initializer, 0);
      return `${this.getIden(identation + 2)}m.insert("${escapeKey(keyText)}".to_string(), ${valText});`;
    }).join("\n");
    return `Value::Map({
${this.getIden(identation + 1)}let mut m = std::collections::HashMap::new();
${lines}
${this.getIden(identation + 1)}m
${this.getIden(identation)}})`;
  }
  printArrayLiteralExpression(node, identation) {
    const elements = node.elements.map((e) => this.printNode(e, 0)).join(", ");
    return `Value::List(vec![${elements}])`;
  }
  printDeleteExpression(node, identation) {
    const object = this.printNode(node.expression.expression, 0);
    const key = this.printNode(node.expression.argumentExpression, 0);
    const keyRef = key.startsWith("Value::") ? `&${key}` : `&${key}`;
    return `remove(&mut ${object}, ${keyRef})`;
  }
  printInstanceOfExpression(node, identation) {
    const left = this.printNode(node.left, 0);
    const right = this.printNode(node.right, 0);
    return `${this.getIden(identation)}is_instance(&${left}, &${right})`;
  }
  printConditionalExpression(node, identation) {
    const condition = this.printCondition(node.condition, 0);
    const whenTrue = this.printTernaryArm(node.whenTrue);
    const whenFalse = this.printTernaryArm(node.whenFalse);
    return `(if ${condition} { ${whenTrue} } else { ${whenFalse} })`;
  }
  static isBoolValueExpression(text) {
    let value = text.trim();
    for (; ; ) {
      if (!(value.startsWith("(") && value.endsWith(")"))) {
        break;
      }
      let depth = 0;
      let wrapsWhole = true;
      for (let i = 0; i < value.length; i++) {
        if (value[i] === "(") {
          depth++;
        } else if (value[i] === ")") {
          depth--;
          if (depth === 0 && i < value.length - 1) {
            wrapsWhole = false;
            break;
          }
        }
      }
      if (!wrapsWhole) {
        break;
      }
      value = value.slice(1, -1).trim();
    }
    if (value.startsWith("!")) {
      value = value.slice(1).trim();
    }
    return _RustTranspiler.BOOL_VALUE_PREFIXES.some((fn) => value.startsWith(fn + "("));
  }
  // An if-expression arm keeps the type `ternary()`'s `Value` parameters gave
  // it: box bool expressions, and clone bare identifiers so the arm does not
  // move a local the caller still uses.
  printTernaryArm(node, identation = 0) {
    const text = this.printNode(node, identation);
    const trimmed = text.trim();
    if (_RustTranspiler.isBoolValueExpression(trimmed)) {
      return `Value::Bool(${trimmed})`;
    }
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed) && trimmed !== "self" && trimmed !== "true" && trimmed !== "false") {
      return `${trimmed}.clone()`;
    }
    return text;
  }
  // Built-in method call overrides
  printArrayIsArrayCall(node, identation, parsedArg = void 0) {
    return `Value::Bool(is_array(&${parsedArg}))`;
  }
  printObjectKeysCall(node, identation, parsedArg = void 0) {
    return `object_keys(&${parsedArg})`;
  }
  printObjectValuesCall(node, identation, parsedArg = void 0) {
    return `object_values(&${parsedArg})`;
  }
  printJsonParseCall(node, identation, parsedArg = void 0) {
    return `json_parse(&${parsedArg})`;
  }
  printJsonStringifyCall(node, identation, parsedArg = void 0) {
    return `json_stringify(&${parsedArg})`;
  }
  printMathFloorCall(node, identation, parsedArg = void 0) {
    return `math_floor(&${parsedArg})`;
  }
  printPromiseAllCall(node, identation, parsedArg = void 0) {
    return `promise_all(&${parsedArg})`;
  }
  // Rust uses postfix `.await`; the base transpiler defaults to prefix.
  printAwaitExpression(node, identation) {
    const expr = this.printNode(node.expression, identation);
    return `${expr}.await`;
  }
  printMathRoundCall(node, identation, parsedArg = void 0) {
    return `math_round(&${parsedArg})`;
  }
  printMathCeilCall(node, identation, parsedArg = void 0) {
    return `math_ceil(&${parsedArg})`;
  }
  printNumberIsIntegerCall(node, identation, parsedArg = void 0) {
    return `is_integer(&${parsedArg})`;
  }
  printArrayPushCall(node, identation, name = void 0, parsedArg = void 0) {
    return `append_to_array(&mut ${name}, ${parsedArg})`;
  }
  printIncludesCall(node, identation, name = void 0, parsedArg = void 0) {
    const pRef = _optionalChain([parsedArg, 'optionalAccess', _567 => _567.startsWith, 'call', _568 => _568("Value::")]) ? `&${parsedArg}` : `&${parsedArg}`;
    return `Value::Bool(contains(&${name}, ${pRef}))`;
  }
  printIndexOfCall(node, identation, name = void 0, parsedArg = void 0) {
    return `get_index_of(&${name}, &${parsedArg})`;
  }
  printStartsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `Value::Bool(starts_with(&${name}, &${parsedArg}))`;
  }
  printEndsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `Value::Bool(ends_with(&${name}, &${parsedArg}))`;
  }
  printTrimCall(node, identation, name = void 0) {
    return `trim(&${name})`;
  }
  printJoinCall(node, identation, name = void 0, parsedArg = void 0) {
    return `join(&${name}, &${parsedArg})`;
  }
  printSplitCall(node, identation, name = void 0, parsedArg = void 0) {
    return `split(&${name}, &${parsedArg})`;
  }
  printConcatCall(node, identation, name = void 0, parsedArg = void 0) {
    return `concat(${name}.clone(), ${parsedArg}.clone())`;
  }
  printToFixedCall(node, identation, name = void 0, parsedArg = void 0) {
    return `to_fixed(&${name}, &${parsedArg})`;
  }
  printToStringCall(node, identation, name = void 0) {
    return `to_string_val(&${name})`;
  }
  printToUpperCaseCall(node, identation, name = void 0) {
    return `to_upper(&${name})`;
  }
  printToLowerCaseCall(node, identation, name = void 0) {
    return `to_lower(&${name})`;
  }
  printShiftCall(node, identation, name = void 0) {
    return `shift(${name}.clone())`;
  }
  printReverseCall(node, identation, name = void 0) {
    return `${name} = reverse(${name}.clone())`;
  }
  printPopCall(node, identation, name = void 0) {
    return `pop(${name}.clone())`;
  }
  printSliceCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    const arg2 = _nullishCoalesce(parsedArg2, () => ( "Value::Null"));
    return `slice(&${name}, &${parsedArg}, &${arg2})`;
  }
  printReplaceCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return `replace_str(&${name}, &${parsedArg}, &${parsedArg2})`;
  }
  printReplaceAllCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return `replace_all_str(&${name}, &${parsedArg}, &${parsedArg2})`;
  }
  printThrowStatement(node, identation) {
    const expression = this.printNode(node.expression, 0);
    return `${this.getIden(identation)}panic!("{}", ${expression});`;
  }
  printTryStatement(node, identation) {
    const tryBody = node.tryBlock.statements.map((s) => this.printNode(s, identation + 1)).join("\n");
    const catchBody = node.catchClause.block.statements.map((s) => this.printNode(s, identation + 1)).join("\n");
    const rawName = _optionalChain([node, 'access', _569 => _569.catchClause, 'optionalAccess', _570 => _570.variableDeclaration, 'optionalAccess', _571 => _571.name, 'optionalAccess', _572 => _572.escapedText]);
    const errorName = rawName ? `_${rawName}` : "_e";
    const iden = this.getIden(identation);
    return `${iden}let _try_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
${tryBody}
${iden}}));
${iden}if let Err(${errorName}) = _try_result {
${catchBody}
${iden}}`;
  }
  printReturnStatement(node, identation) {
    const exp = node.expression;
    if (!exp) {
      return `${this.getIden(identation)}return;`;
    }
    const rightPart = this.printNode(exp, 0).trim();
    return `${this.getIden(identation)}return ${rightPart};`;
  }
  printBreakStatement(node, identation) {
    return `${this.getIden(identation)}break;`;
  }
  printContinueStatement(node, identation) {
    return `${this.getIden(identation)}continue;`;
  }
  printConstructorDeclaration(node, identation) {
    return "";
  }
  printSpreadElement(node, identation) {
    const expression = this.printNode(node.expression, 0);
    return `${this.getIden(identation)}${expression}`;
  }
};
// ── native equality emission ────────────────────────────────────────────
// When the checker proves both operands hold the same primitive payload
// (string / number / boolean, or one side is a matching literal) the
// unwrapped payloads are compared with `==`/`!=` instead of is_equal().
// Operators whose printed form is a bare Rust `bool` (not a Value).
_RustTranspiler.BOOL_PRODUCING_OPERATORS = /* @__PURE__ */ new Set([
  SyntaxKind4.EqualsEqualsToken,
  SyntaxKind4.EqualsEqualsEqualsToken,
  SyntaxKind4.ExclamationEqualsToken,
  SyntaxKind4.ExclamationEqualsEqualsToken,
  SyntaxKind4.LessThanToken,
  SyntaxKind4.LessThanEqualsToken,
  SyntaxKind4.GreaterThanToken,
  SyntaxKind4.GreaterThanEqualsToken,
  SyntaxKind4.AmpersandAmpersandToken,
  SyntaxKind4.BarBarToken,
  SyntaxKind4.InstanceOfKeyword
]);
// Method names whose Rust helper returns a bare `bool` (not a Value).
_RustTranspiler.BOOL_PRODUCING_CALLS = /* @__PURE__ */ new Set([
  "isInteger",
  "isSafeInteger",
  "some",
  "every",
  "test"
]);
// Payload accessor used to compare each primitive kind natively.
_RustTranspiler.PAYLOAD_ACCESSORS = {
  "string": "as_str",
  "number": "as_f64",
  "boolean": "as_bool"
};
// ── native-typed locals ───────────────────────────────────────────────────
//
// A local is declared `bool` (instead of `Value`) when its initializer is
// already a bool-valued Rust expression and every use is a condition sink
// (`is_true(&x)`) — the one sink that accepts a native bool today.
//
// `is_true` is generic over `IsTruthy` (impl for `bool`/`&bool` in
// runtime.rs); every other sink takes `&Value`, so any other use keeps the
// local boxed. Bools come in two shapes: helpers whose Rust return type is
// already `bool` (below), and the printer's own `Value::Bool(...)` box,
// which the declaration drops at the init site.
_RustTranspiler.RUST_BOOL_RESULT_HELPERS = /* @__PURE__ */ new Set([
  "is_true",
  "is_equal",
  "is_greater_than",
  "is_greater_than_or_equal",
  "is_less_than",
  "is_less_than_or_equal",
  "is_array",
  "is_object",
  "is_string",
  "is_number",
  "is_bool",
  "is_integer",
  "is_function",
  "is_instance",
  "starts_with",
  "ends_with",
  "in_op",
  "contains"
]);
// ── native container access (`get_value(...)` -> `.get(...)`) ─────────────
// When the TypeScript checker proves the receiver is a plain Map/List value
// and the key is a literal, the runtime `get_value` key-marker / `__live_id`
// paths cannot apply, so the access is emitted natively. Missing keys still
// fall back to `Value::Null`.
/** Methods whose Rust counterpart takes `&mut self`: a `self.<field>` read in
 *  their args must keep the `get_value(...)` shape the ccxt post-pass hoists. */
_RustTranspiler.MUT_SELF_METHODS = /* @__PURE__ */ new Set([
  "watch",
  "watch_multiple",
  "fetch_order_book_snapshot",
  "un_watch",
  "client",
  "spawn",
  "delay",
  "fetch_tickers",
  "extend",
  "fetch",
  "send_evm_transaction"
]);
_RustTranspiler.COMPARISON_OPS = /* @__PURE__ */ new Set([
  SyntaxKind4.EqualsEqualsToken,
  SyntaxKind4.EqualsEqualsEqualsToken,
  SyntaxKind4.ExclamationEqualsToken,
  SyntaxKind4.ExclamationEqualsEqualsToken,
  SyntaxKind4.LessThanToken,
  SyntaxKind4.LessThanEqualsToken,
  SyntaxKind4.GreaterThanToken,
  SyntaxKind4.GreaterThanEqualsToken
]);
// Comparison helpers that can be replaced by a native numeric operator.
_RustTranspiler.NATIVE_COMPARISON_OPERATORS = {
  [SyntaxKind4.LessThanToken]: "<",
  [SyntaxKind4.LessThanEqualsToken]: "<=",
  [SyntaxKind4.GreaterThanToken]: ">",
  [SyntaxKind4.GreaterThanEqualsToken]: ">="
};
// Free runtime functions that print as `bool` (not `Value`) — mirror of the
// Rust pipeline's `ternary()` bool-boxing list.
_RustTranspiler.BOOL_VALUE_PREFIXES = [
  "is_equal",
  "is_true",
  "is_greater_than",
  "is_less_than",
  "is_greater_than_or_equal",
  "is_less_than_or_equal",
  "is_array",
  "is_object",
  "in_op",
  "is_number",
  "is_string"
];
var RustTranspiler = _RustTranspiler;

// src/cppTranspiler.ts
init_cjs_shims();

var parserConfig7 = {
  "ELSEIF_TOKEN": "else if",
  "OBJECT_OPENING": "std::unordered_map<std::string, std::any> {",
  "OBJECT_CLOSING": "}",
  "ARRAY_OPENING_TOKEN": "std::vector<std::any>{",
  "ARRAY_CLOSING_TOKEN": "}",
  "PROPERTY_ASSIGNMENT_TOKEN": ",",
  "VAR_TOKEN": "std::any",
  // object
  "METHOD_TOKEN": "",
  "PROPERTY_ASSIGNMENT_OPEN": "{",
  "PROPERTY_ASSIGNMENT_CLOSE": "}",
  "SUPER_TOKEN": "base",
  "SUPER_CALL_TOKEN": "base",
  "FALSY_WRAPPER_OPEN": "isTrue(",
  "FALSY_WRAPPER_CLOSE": ")",
  "COMPARISON_WRAPPER_OPEN": "isEqual(",
  "COMPARISON_WRAPPER_CLOSE": ")",
  "UKNOWN_PROP_WRAPPER_OPEN": "this.call(",
  "UNKOWN_PROP_WRAPPER_CLOSE": ")",
  "UKNOWN_PROP_ASYNC_WRAPPER_OPEN": "this.callAsync(",
  "UNKOWN_PROP_ASYNC_WRAPPER_CLOSE": ")",
  "DYNAMIC_CALL_OPEN": "callDynamically(",
  "EQUALS_EQUALS_WRAPPER_OPEN": "isEqual(",
  "EQUALS_EQUALS_WRAPPER_CLOSE": ")",
  "DIFFERENT_WRAPPER_OPEN": "!isEqual(",
  "DIFFERENT_WRAPPER_CLOSE": ")",
  "GREATER_THAN_WRAPPER_OPEN": "isGreaterThan(",
  "GREATER_THAN_WRAPPER_CLOSE": ")",
  "GREATER_THAN_EQUALS_WRAPPER_OPEN": "isGreaterThanOrEqual(",
  "GREATER_THAN_EQUALS_WRAPPER_CLOSE": ")",
  "LESS_THAN_WRAPPER_OPEN": "isLessThan(",
  "LESS_THAN_WRAPPER_CLOSE": ")",
  "LESS_THAN_EQUALS_WRAPPER_OPEN": "isLessThanOrEqual(",
  "LESS_THAN_EQUALS_WRAPPER_CLOSE": ")",
  "PLUS_WRAPPER_OPEN": "add(",
  "PLUS_WRAPPER_CLOSE": ")",
  "MINUS_WRAPPER_OPEN": "subtract(",
  "MINUS_WRAPPER_CLOSE": ")",
  "ARRAY_LENGTH_WRAPPER_OPEN": "getArrayLength(",
  "ARRAY_LENGTH_WRAPPER_CLOSE": ")",
  "DIVIDE_WRAPPER_OPEN": "divide(",
  "DIVIDE_WRAPPER_CLOSE": ")",
  "MULTIPLY_WRAPPER_OPEN": "multiply(",
  "MULTIPLY_WRAPPER_CLOSE": ")",
  "INDEXOF_WRAPPER_OPEN": "getIndexOf(",
  "INDEXOF_WRAPPER_CLOSE": ")",
  "MOD_WRAPPER_OPEN": "mod(",
  "MOD_WRAPPER_CLOSE": ")",
  "FUNCTION_TOKEN": "",
  "DEFAULT_PARAMETER_TYPE": "std::any",
  "INFER_VAR_TYPE": false,
  "INFER_ARG_TYPE": false,
  "UNDEFINED_TOKEN": "std::any{}",
  // qualified with :: so class methods with the same name never shadow the helper
  "ELEMENT_ACCESS_WRAPPER_OPEN": "::getValue(",
  "ELEMENT_ACCESS_WRAPPER_CLOSE": ")",
  "DEFAULT_RETURN_TYPE": "std::any",
  "THIS_TOKEN": "this",
  "NEW_TOKEN": "",
  "CATCH_DECLARATION": "const std::exception&"
};
var CppTranspiler = class extends BaseTranspiler {
  constructor(config = {}) {
    config["parser"] = Object.assign({}, parserConfig7, _nullishCoalesce(config["parser"], () => ( {})));
    super(config);
    this.requiresParameterType = true;
    this.requiresReturnType = true;
    this.asyncTranspiling = true;
    this.supportsFalsyOrTruthyValues = false;
    this.requiresCallExpressionCast = false;
    this.id = "c++";
    this.initConfig();
    this.applyUserOverrides(config);
  }
  initConfig() {
    this.LeftPropertyAccessReplacements = {};
    this.RightPropertyAccessReplacements = {};
    this.FullPropertyAccessReplacements = {
      "JSON.parse": "parseJson",
      "JSON.stringify": "jsonStringify",
      "console.log": "consoleLog",
      "Number.MAX_SAFE_INTEGER": "INT_MAX",
      "Math.min": "mathMin",
      "Math.max": "mathMax",
      "Math.log": "mathLog",
      "Math.abs": "mathAbs",
      "Math.floor": "mathFloor",
      "Math.pow": "mathPow"
    };
    this.CallExpressionReplacements = {};
    this.ReservedKeywordsReplacements = {
      "union": "unionVar",
      "char": "charVar",
      "default": "defaultVar",
      "operator": "operatorVar",
      "new": "newVar",
      "delete": "deleteVar",
      "template": "templateVar"
    };
    this.VariableTypeReplacements = {};
    this.ArgTypeReplacements = {};
    this.binaryExpressionsWrappers = {
      [_typescript2.default.SyntaxKind.EqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.EqualsEqualsEqualsToken]: [this.EQUALS_EQUALS_WRAPPER_OPEN, this.EQUALS_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.ExclamationEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken]: [this.DIFFERENT_WRAPPER_OPEN, this.DIFFERENT_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.GreaterThanToken]: [this.GREATER_THAN_WRAPPER_OPEN, this.GREATER_THAN_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.GreaterThanEqualsToken]: [this.GREATER_THAN_EQUALS_WRAPPER_OPEN, this.GREATER_THAN_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.LessThanToken]: [this.LESS_THAN_WRAPPER_OPEN, this.LESS_THAN_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.LessThanEqualsToken]: [this.LESS_THAN_EQUALS_WRAPPER_OPEN, this.LESS_THAN_EQUALS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.PlusToken]: [this.PLUS_WRAPPER_OPEN, this.PLUS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.MinusToken]: [this.MINUS_WRAPPER_OPEN, this.MINUS_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.AsteriskToken]: [this.MULTIPLY_WRAPPER_OPEN, this.MULTIPLY_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.PercentToken]: [this.MOD_WRAPPER_OPEN, this.MOD_WRAPPER_CLOSE],
      [_typescript2.default.SyntaxKind.SlashToken]: [this.DIVIDE_WRAPPER_OPEN, this.DIVIDE_WRAPPER_CLOSE]
    };
  }
  getBlockOpen(identation) {
    return "\n" + this.getIden(identation) + this.BLOCK_OPENING_TOKEN + "\n";
  }
  printSuperCallInsideConstructor(node, identation) {
    return "";
  }
  printStringLiteral(node) {
    return `std::string(${super.printStringLiteral(node)})`;
  }
  printClass(node, identation) {
    const classDefinition = this.printClassDefinition(node, identation);
    const classBody = this.printClassBody(node, identation);
    const classClosing = this.getBlockClose(identation);
    return classDefinition + classBody + classClosing + ";";
  }
  printClassDefinition(node, identation) {
    const className = node.name.escapedText;
    const heritageClauses = node.heritageClauses;
    let classInit = "";
    if (heritageClauses !== void 0) {
      const classExtends = heritageClauses[0].types[0].expression.escapedText;
      classInit = this.getIden(identation) + "class " + className + " : public " + classExtends;
    } else {
      classInit = this.getIden(identation) + "class " + className;
    }
    return classInit + "\n" + this.getIden(identation) + this.BLOCK_OPENING_TOKEN + "\n" + this.getIden(identation) + "public:\n";
  }
  printConstructorDeclaration(node, identation) {
    const classNode = node.parent;
    const className = this.printNode(classNode.name, 0);
    const args = this.printMethodParameters(node);
    const constructorBody = this.printFunctionBody(node, identation);
    let superCallParams = "";
    let hasSuperCall = false;
    _optionalChain([node, 'access', _573 => _573.body, 'optionalAccess', _574 => _574.statements, 'access', _575 => _575.forEach, 'call', _576 => _576((statement) => {
      if (_typescript2.default.isExpressionStatement(statement)) {
        const expression = statement.expression;
        if (_typescript2.default.isCallExpression(expression)) {
          const expressionText = expression.expression.getText().trim();
          if (expressionText === "super") {
            hasSuperCall = true;
            superCallParams = expression.arguments.map((a) => {
              return this.printNode(a, identation).trim();
            }).join(", ");
          }
        }
      }
    })]);
    if (hasSuperCall) {
      const parentClassName = classNode.heritageClauses[0].types[0].expression.escapedText;
      return this.getIden(identation) + className + `(${args}) : ${parentClassName}(${superCallParams})` + constructorBody;
    }
    return this.getIden(identation) + className + "(" + args + ")" + constructorBody;
  }
  printThisElementAccesssIfNeeded(node, identation) {
    return void 0;
  }
  printDynamicCall(node, identation) {
    return void 0;
  }
  printAwaitExpression(node, identation) {
    const expression = this.printNode(node.expression, identation);
    if (this.asyncTranspiling) {
      return `awaitValue(${expression})`;
    }
    return expression;
  }
  printReturnStatement(node, identation) {
    if (this.asyncTranspiling && !node.expression) {
      let fn = node.parent;
      while (fn !== void 0 && !_typescript2.default.isFunctionLike(fn)) {
        fn = fn.parent;
      }
      if (fn !== void 0 && this.isAsyncFunction(fn)) {
        return this.getIden(identation) + "return std::any{}" + this.LINE_TERMINATOR;
      }
    }
    return super.printReturnStatement(node, identation);
  }
  printFunctionBody(node, identation) {
    if (this.asyncTranspiling && this.isAsyncFunction(node)) {
      const innerIdentation = identation + 2;
      const bodyStatements = node.body.statements;
      const statements = bodyStatements.map((s) => this.printNode(s, innerIdentation)).join("\n");
      const lastStatement = bodyStatements.length > 0 ? bodyStatements[bodyStatements.length - 1] : void 0;
      const endsWithReturn = lastStatement !== void 0 && lastStatement.kind === _typescript2.default.SyntaxKind.ReturnStatement;
      const fallbackReturn = endsWithReturn ? "" : this.getIden(innerIdentation) + "return std::any{};\n";
      return this.getBlockOpen(identation) + this.getIden(identation + 1) + "return std::async(std::launch::async, [=]() -> std::any {\n" + (statements ? statements + "\n" : "") + fallbackReturn + this.getIden(identation + 1) + "}).share();" + this.getBlockClose(identation);
    }
    return super.printFunctionBody(node, identation);
  }
  printWrappedUnknownThisProperty(node) {
    return void 0;
  }
  printOutOfOrderCallExpressionIfAny(node, identation) {
    if (node.expression.kind === _typescript2.default.SyntaxKind.PropertyAccessExpression) {
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
    return void 0;
  }
  handleTypeOfInsideBinaryExpression(node, identation) {
    const right = node.right.text;
    const op = node.operatorToken.kind;
    const expression = node.left.expression;
    const isDifferentOperator = op === _typescript2.default.SyntaxKind.ExclamationEqualsEqualsToken || op === _typescript2.default.SyntaxKind.ExclamationEqualsToken;
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
    return void 0;
  }
  printCustomBinaryExpressionIfAny(node, identation) {
    const left = node.left;
    const right = node.right;
    const op = node.operatorToken.kind;
    if (left.kind === _typescript2.default.SyntaxKind.TypeOfExpression) {
      const typeOfExpression = this.handleTypeOfInsideBinaryExpression(node, identation);
      if (typeOfExpression) {
        return typeOfExpression;
      }
    }
    if (op === _typescript2.default.SyntaxKind.EqualsToken && left.kind === _typescript2.default.SyntaxKind.ArrayLiteralExpression) {
      const arrayBindingPatternElements = left.elements;
      const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e, 0));
      const syntheticName = parsedArrayBindingElements.join("") + "Variable";
      let arrayBindingStatement = `std::any ${syntheticName} = ${this.printNode(right, 0)};
`;
      parsedArrayBindingElements.forEach((e, index) => {
        const statement = this.getIden(identation) + `${e} = ::getValue(${syntheticName}, ${index})`;
        if (index < parsedArrayBindingElements.length - 1) {
          arrayBindingStatement += statement + ";\n";
        } else {
          arrayBindingStatement += statement;
        }
      });
      return arrayBindingStatement;
    }
    if (op === _typescript2.default.SyntaxKind.InKeyword) {
      return `inOp(${this.printNode(right, 0)}, ${this.printNode(left, 0)})`;
    }
    const leftText = this.printNode(left, 0);
    const rightText = this.printNode(right, 0);
    if (op === _typescript2.default.SyntaxKind.PlusEqualsToken) {
      return `${leftText} = add(${leftText}, ${rightText})`;
    }
    if (op === _typescript2.default.SyntaxKind.MinusEqualsToken) {
      return `${leftText} = subtract(${leftText}, ${rightText})`;
    }
    if (op === _typescript2.default.SyntaxKind.EqualsToken) {
      if (left.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
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
    return void 0;
  }
  printVariableDeclarationList(node, identation) {
    const declaration = node.declarations[0];
    if (_optionalChain([declaration, 'optionalAccess', _577 => _577.name, 'access', _578 => _578.kind]) === _typescript2.default.SyntaxKind.ArrayBindingPattern) {
      const arrayBindingPattern = declaration.name;
      const arrayBindingPatternElements = arrayBindingPattern.elements;
      const parsedArrayBindingElements = arrayBindingPatternElements.map((e) => this.printNode(e.name, 0));
      const syntheticName = parsedArrayBindingElements.join("") + "Variable";
      let arrayBindingStatement = `${this.getIden(identation)}std::any ${syntheticName} = ${this.printNode(declaration.initializer, 0)};
`;
      parsedArrayBindingElements.forEach((e, index) => {
        const statement = this.getIden(identation) + `std::any ${e} = ::getValue(${syntheticName}, ${index})`;
        if (index < parsedArrayBindingElements.length - 1) {
          arrayBindingStatement += statement + ";\n";
        } else {
          arrayBindingStatement += statement;
        }
      });
      return arrayBindingStatement;
    }
    const isNew = declaration.initializer && declaration.initializer.kind === _typescript2.default.SyntaxKind.NewExpression;
    let className = void 0;
    if (isNew) {
      className = declaration.initializer.expression.escapedText;
    }
    const varToken = isNew ? className + " " : this.VAR_TOKEN + " ";
    if (declaration.initializer === void 0) {
      return this.getIden(identation) + this.VAR_TOKEN + " " + this.printNode(declaration.name) + " = " + this.UNDEFINED_TOKEN;
    }
    const parsedValue = this.printNode(declaration.initializer, identation).trimStart();
    return this.getIden(identation) + varToken + this.printNode(declaration.name) + " = " + parsedValue;
  }
  printFunctionDefinition(node, identation) {
    let name = node.name.escapedText;
    name = this.transformFunctionNameIfNeeded(name);
    const parsedArgs = node.parameters.map((param) => this.printParameter(param)).join(", ");
    let returnType = this.printFunctionType(node);
    returnType = returnType ? returnType + " " : returnType;
    const functionDef = this.getIden(identation) + returnType + name + "(" + parsedArgs + ")";
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
  printFunctionType(node) {
    if (!this.requiresReturnType) {
      return "";
    }
    if (this.asyncTranspiling && this.isAsyncFunction(node)) {
      return `std::shared_future<${this.DEFAULT_RETURN_TYPE}>`;
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
    const methodOverride = this.getMethodOverride(node);
    const isOverride = methodOverride !== void 0;
    const virtualPrefix = isOverride ? "" : "virtual ";
    const overrideSuffix = isOverride ? " override" : "";
    if (isOverride) {
      returnType = this.printFunctionType(methodOverride);
    }
    const parsedArgs = this.printMethodParameters(node);
    returnType = returnType ? returnType + " " : returnType;
    const methodToken = this.METHOD_TOKEN ? this.METHOD_TOKEN + " " : "";
    const methodDef = this.getIden(identation) + virtualPrefix + returnType + methodToken + name + "(" + parsedArgs + ")" + overrideSuffix;
    return this.printNodeCommentsIfAny(node, identation, methodDef);
  }
  printPropertyDeclaration(node, identation) {
    const name = this.printNode(node.name, 0);
    if (node.initializer) {
      const initializer = this.printNode(node.initializer, 0);
      return this.getIden(identation) + "std::any " + name + " = " + initializer + this.LINE_TERMINATOR;
    }
    return this.getIden(identation) + "std::any " + name + this.LINE_TERMINATOR;
  }
  printArrayLiteralExpression(node) {
    const elements = node.elements.map((e) => {
      return this.printNode(e);
    }).join(", ");
    return this.ARRAY_OPENING_TOKEN + elements + this.ARRAY_CLOSING_TOKEN;
  }
  printArrayIsArrayCall(node, identation, parsedArg = void 0) {
    return `isArray(${parsedArg})`;
  }
  printObjectKeysCall(node, identation, parsedArg = void 0) {
    return `getObjectKeys(${parsedArg})`;
  }
  printObjectValuesCall(node, identation, parsedArg = void 0) {
    return `getObjectValues(${parsedArg})`;
  }
  printJsonParseCall(node, identation, parsedArg = void 0) {
    return `parseJson(${parsedArg})`;
  }
  printJsonStringifyCall(node, identation, parsedArg = void 0) {
    return `jsonStringify(${parsedArg})`;
  }
  printPromiseAllCall(node, identation, parsedArg = void 0) {
    return `promiseAll(${parsedArg})`;
  }
  printMathFloorCall(node, identation, parsedArg = void 0) {
    return `mathFloor(${parsedArg})`;
  }
  printMathRoundCall(node, identation, parsedArg = void 0) {
    return `mathRound(${parsedArg})`;
  }
  printMathCeilCall(node, identation, parsedArg = void 0) {
    return `mathCeil(${parsedArg})`;
  }
  printNumberIsIntegerCall(node, identation, parsedArg) {
    return `isInteger(${parsedArg})`;
  }
  printArrayPushCall(node, identation, name = void 0, parsedArg = void 0) {
    return `arrayPush(${name}, ${parsedArg})`;
  }
  printIncludesCall(node, identation, name = void 0, parsedArg = void 0) {
    return `includes(${name}, ${parsedArg})`;
  }
  printIndexOfCall(node, identation, name = void 0, parsedArg = void 0) {
    return `${this.INDEXOF_WRAPPER_OPEN}${name}, ${parsedArg}${this.INDEXOF_WRAPPER_CLOSE}`;
  }
  printStartsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `startsWith(${name}, ${parsedArg})`;
  }
  printEndsWithCall(node, identation, name = void 0, parsedArg = void 0) {
    return `endsWith(${name}, ${parsedArg})`;
  }
  printTrimCall(node, identation, name = void 0) {
    return `trim(${name})`;
  }
  printJoinCall(node, identation, name = void 0, parsedArg = void 0) {
    return `join(${name}, ${parsedArg})`;
  }
  printSplitCall(node, identation, name = void 0, parsedArg = void 0) {
    return `split(${name}, ${parsedArg})`;
  }
  printConcatCall(node, identation, name = void 0, parsedArg = void 0) {
    return `concat(${name}, ${parsedArg})`;
  }
  printToFixedCall(node, identation, name = void 0, parsedArg = void 0) {
    return `toFixed(${name}, ${parsedArg})`;
  }
  printToStringCall(node, identation, name = void 0) {
    return `toString(${name})`;
  }
  printToUpperCaseCall(node, identation, name = void 0) {
    return `toUpperCase(${name})`;
  }
  printToLowerCaseCall(node, identation, name = void 0) {
    return `toLowerCase(${name})`;
  }
  printShiftCall(node, identation, name = void 0) {
    return `shift(${name})`;
  }
  printReverseCall(node, identation, name = void 0) {
    return `reverse(${name})`;
  }
  printPopCall(node, identation, name = void 0) {
    return `pop(${name})`;
  }
  printAssertCall(node, identation, parsedArgs) {
    return `assertTrue(${parsedArgs})`;
  }
  printSliceCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    if (parsedArg2 === void 0) {
      parsedArg2 = this.UNDEFINED_TOKEN;
    }
    return `slice(${name}, ${parsedArg}, ${parsedArg2})`;
  }
  printReplaceCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
    return `replace(${name}, ${parsedArg}, ${parsedArg2})`;
  }
  printReplaceAllCall(node, identation, name = void 0, parsedArg = void 0, parsedArg2 = void 0) {
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
  printLengthProperty(node, identation, name = void 0) {
    const leftSide = this.printNode(node.expression, 0);
    const type = this.getChecker().getTypeAtLocation(node.expression);
    this.warnIfAnyType(node, type.flags, leftSide, "length");
    return this.isStringType(type.flags) ? `getStringLength(${leftSide})` : `${this.ARRAY_LENGTH_WRAPPER_OPEN}${leftSide}${this.ARRAY_LENGTH_WRAPPER_CLOSE}`;
  }
  printPostFixUnaryExpression(node, identation) {
    const { operand, operator } = node;
    if (operand.kind === _typescript2.default.SyntaxKind.NumericLiteral) {
      return super.printPostFixUnaryExpression(node, identation);
    }
    const leftSide = this.printNode(operand, 0);
    const op = this.PostFixOperators[operator];
    if (op === "--") {
      return `postFixDecrement(${leftSide})`;
    }
    return `postFixIncrement(${leftSide})`;
  }
  printPrefixUnaryExpression(node, identation) {
    const { operand, operator } = node;
    if (operand.kind === _typescript2.default.SyntaxKind.NumericLiteral) {
      return super.printPrefixUnaryExpression(node, identation);
    }
    if (operator === _typescript2.default.SyntaxKind.ExclamationToken) {
      return this.PrefixFixOperators[operator] + this.printCondition(node.operand, 0);
    }
    const leftSide = this.printNode(operand, 0);
    if (operator === _typescript2.default.SyntaxKind.PlusToken) {
      return `prefixUnaryPlus(${leftSide})`;
    } else {
      return `prefixUnaryNeg(${leftSide})`;
    }
  }
  printConditionalExpression(node, identation) {
    const condition = this.printCondition(node.condition, 0);
    const whenTrue = this.printNode(node.whenTrue, 0);
    const whenFalse = this.printNode(node.whenFalse, 0);
    return `(${condition} ? std::any(${whenTrue}) : std::any(${whenFalse}))`;
  }
  printDeleteExpression(node, identation) {
    const object = this.printNode(node.expression.expression, 0);
    const key = this.printNode(node.expression.argumentExpression, 0);
    return `deleteKey(${object}, ${key})`;
  }
  printThrowStatement(node, identation) {
    if (node.expression.kind === _typescript2.default.SyntaxKind.Identifier) {
      return this.getIden(identation) + this.THROW_TOKEN + " " + this.printNode(node.expression, 0) + this.LINE_TERMINATOR;
    }
    if (node.expression.kind === _typescript2.default.SyntaxKind.NewExpression) {
      const expression = node.expression;
      const argumentsExp = _nullishCoalesce(_optionalChain([expression, 'optionalAccess', _579 => _579.arguments]), () => ( []));
      const parsedArg = _nullishCoalesce(argumentsExp.map((n) => this.printNode(n, 0)).join(", "), () => ( ""));
      const newExpression = this.printNode(expression.expression, 0);
      if (expression.expression.kind === _typescript2.default.SyntaxKind.Identifier) {
        const id = expression.expression;
        const symbol = this.getChecker().getSymbolAtLocation(expression.expression);
        if (symbol) {
          const declarations = _nullishCoalesce(_optionalChain([this, 'access', _580 => _580.getChecker, 'call', _581 => _581(), 'access', _582 => _582.getDeclaredTypeOfSymbol, 'call', _583 => _583(symbol), 'access', _584 => _584.symbol, 'optionalAccess', _585 => _585.declarations]), () => ( []));
          const isClassDeclaration = declarations.find((l) => l.kind === _typescript2.default.SyntaxKind.InterfaceDeclaration || l.kind === _typescript2.default.SyntaxKind.ClassDeclaration);
          if (isClassDeclaration) {
            return this.getIden(identation) + `${this.THROW_TOKEN} ${id.escapedText}(toString(${parsedArg}))${this.LINE_TERMINATOR}`;
          }
          return this.getIden(identation) + `throwDynamicException(${id.escapedText}, ${parsedArg})${this.LINE_TERMINATOR}`;
        }
        return this.getIden(identation) + `${this.THROW_TOKEN} ${newExpression}(${parsedArg})${this.LINE_TERMINATOR}`;
      } else if (expression.expression.kind === _typescript2.default.SyntaxKind.ElementAccessExpression) {
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
      return "->";
    }
    return void 0;
  }
};

// src/transpiler.ts
var __dirname_mock = import_dirname.default;
var fastCompilerOptions = {
  target: _typescript2.default.ScriptTarget.Latest,
  lib: ["lib.esnext.d.ts"],
  types: []
};
var globalsShim = `
declare var require: any;
declare var module: any;
declare var exports: any;
declare var console: any;
declare var process: any;
declare var Buffer: any;
declare var __dirname: string;
declare var __filename: string;
declare var setTimeout: any;
declare var clearTimeout: any;
declare var setInterval: any;
declare var clearInterval: any;
declare var setImmediate: any;
declare var fetch: any;
declare var URL: any;
declare var URLSearchParams: any;
declare var TextEncoder: any;
declare var TextDecoder: any;
declare var crypto: any;
declare var performance: any;
declare var AbortController: any;
declare var WebSocket: any;
declare var atob: any;
declare var btoa: any;
`;
var globalsShimPath = path.resolve(path.join(__dirname_mock, "__globals-shim.d.ts"));
function overrideHostForVirtualFiles(host, files) {
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const virtual = files.get(path.resolve(fileName));
    return virtual !== void 0 ? virtual : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  host.readFile = (fileName) => {
    const virtual = files.get(path.resolve(fileName));
    return virtual !== void 0 ? virtual.text : originalReadFile(fileName);
  };
  host.fileExists = (fileName) => {
    return files.has(path.resolve(fileName)) || originalFileExists(fileName);
  };
}
var NO_SYMBOL_SENTINEL = Symbol("noSymbol");
function memoizeCheckerCalls(checker) {
  if (checker.__astTranspilerMemoized) {
    return;
  }
  checker.__astTranspilerMemoized = true;
  const typeCache = /* @__PURE__ */ new WeakMap();
  const originalGetTypeAtLocation = checker.getTypeAtLocation.bind(checker);
  checker.getTypeAtLocation = (node) => {
    let type = typeCache.get(node);
    if (type === void 0) {
      type = originalGetTypeAtLocation(node);
      typeCache.set(node, type);
    }
    return type;
  };
  const symbolCache = /* @__PURE__ */ new WeakMap();
  const originalGetSymbolAtLocation = checker.getSymbolAtLocation.bind(checker);
  checker.getSymbolAtLocation = (node) => {
    const cached = symbolCache.get(node);
    if (cached !== void 0) {
      return cached === NO_SYMBOL_SENTINEL ? void 0 : cached;
    }
    const symbol = originalGetSymbolAtLocation(node);
    symbolCache.set(node, symbol === void 0 ? NO_SYMBOL_SENTINEL : symbol);
    return symbol;
  };
}
function getProgramAndTypeCheckerFromMemory(rootDir, text, options = {}, cache) {
  options = options || _typescript2.default.getDefaultCompilerOptions();
  const inMemoryFilePath = path.resolve(path.join(rootDir, "__dummy-file.ts"));
  const textAst = _typescript2.default.createSourceFile(inMemoryFilePath, text, options.target || _typescript2.default.ScriptTarget.Latest);
  const shimAst = _typescript2.default.createSourceFile(globalsShimPath, globalsShim, options.target || _typescript2.default.ScriptTarget.Latest);
  const host = _typescript2.default.createCompilerHost(options, true);
  overrideHostForVirtualFiles(host, /* @__PURE__ */ new Map([
    [inMemoryFilePath, textAst],
    [globalsShimPath, shimAst]
  ]));
  if (cache !== void 0) {
    const originalGetSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
      const resolved = path.resolve(fileName);
      if (resolved === inMemoryFilePath) {
        return textAst;
      }
      const cached = cache.sourceFiles.get(resolved);
      if (cached !== void 0 && !shouldCreateNewSourceFile) {
        return cached.sourceFile;
      }
      const sourceFile2 = originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
      if (sourceFile2 !== void 0) {
        cache.sourceFiles.set(resolved, { mtimeMs: 0, sourceFile: sourceFile2 });
      }
      return sourceFile2;
    };
  }
  const program = _typescript2.default.createProgram({
    options,
    rootNames: [inMemoryFilePath, globalsShimPath],
    host,
    oldProgram: _optionalChain([cache, 'optionalAccess', _586 => _586.memoryOldProgram])
  });
  if (cache !== void 0) {
    cache.memoryOldProgram = program;
  }
  const typeChecker = program.getTypeChecker();
  memoizeCheckerCalls(typeChecker);
  const sourceFile = program.getSourceFile(inMemoryFilePath);
  return [program, typeChecker, sourceFile];
}
var Transpiler = class _Transpiler {
  // A program cache holds parsed typescript SourceFiles and the last program built
  // from them. Hand the same cache to several Transpiler instances to reuse one
  // parse/typecheck of the es lib chain and of every shared import across all of
  // them. Callers that need isolation simply omit it and get a private cache.
  //
  // Same-thread only: these are live V8 objects, so a cache cannot be posted to a
  // worker_threads isolate — give each worker its own long-lived cache instead.
  static createProgramCache() {
    return { sourceFiles: /* @__PURE__ */ new Map() };
  }
  constructor(config = {}, programCache) {
    this.config = config;
    this.programCache = _nullishCoalesce(programCache, () => ( _Transpiler.createProgramCache()));
    const phpConfig = config["php"] || {};
    const pythonConfig = config["python"] || {};
    const csharpConfig = config["csharp"] || {};
    const goConfig = config["go"] || {};
    const javaConfig = config["java"] || {};
    const rustConfig = config["rust"] || {};
    const cppConfig = config["cpp"] || {};
    if ("verbose" in config) {
      Logger.setVerboseMode(Boolean(config["verbose"]));
    }
    this.pythonTranspiler = new PythonTranspiler(pythonConfig);
    this.phpTranspiler = new PhpTranspiler(phpConfig);
    this.csharpTranspiler = new CSharpTranspiler(csharpConfig);
    this.goTranspiler = new GoTranspiler(goConfig);
    this.javaTranspiler = new JavaTranspiler(javaConfig);
    this.rustTranspiler = new RustTranspiler(rustConfig);
    this.cppTranspiler = new CppTranspiler(cppConfig);
  }
  setVerboseMode(verbose) {
    Logger.setVerboseMode(verbose);
  }
  // the cache this instance parses into, to hand to further Transpiler instances
  // that should reuse this one's parsed SourceFiles
  getProgramCache() {
    return this.programCache;
  }
  // a second Transpiler over the same parsed typescript state, with its own
  // printers and its own transpile context, so both can be driven independently
  // on this thread without either clobbering the other's program
  cloneSharingProgramCache(config = this.config) {
    return new _Transpiler(config, this.programCache);
  }
  createProgramInMemoryAndSetContext(content) {
    const [memProgram, memType, memSource] = getProgramAndTypeCheckerFromMemory(__dirname_mock, content, fastCompilerOptions, this.programCache);
    return this.setContext({
      src: memSource,
      checker: memType,
      program: memProgram
    });
  }
  getByPathCompilerHost(options) {
    if (this.programCache.byPathHost === void 0) {
      const host = _typescript2.default.createCompilerHost(options, true);
      const originalGetSourceFile = host.getSourceFile.bind(host);
      const cache = this.programCache.sourceFiles;
      host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        let mtimeMs = 0;
        try {
          mtimeMs = fs.statSync(fileName).mtimeMs;
        } catch (e) {
        }
        const cached = cache.get(fileName);
        if (cached && cached.mtimeMs === mtimeMs && !shouldCreateNewSourceFile) {
          return cached.sourceFile;
        }
        const sourceFile = originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
        if (sourceFile !== void 0) {
          cache.set(fileName, { mtimeMs, sourceFile });
        }
        return sourceFile;
      };
      const shimAst = _typescript2.default.createSourceFile(globalsShimPath, globalsShim, _typescript2.default.ScriptTarget.Latest);
      overrideHostForVirtualFiles(host, /* @__PURE__ */ new Map([[globalsShimPath, shimAst]]));
      this.programCache.byPathHost = host;
    }
    return this.programCache.byPathHost;
  }
  createProgramByPathAndSetContext(path2) {
    const options = fastCompilerOptions;
    const host = this.getByPathCompilerHost(options);
    const program = _typescript2.default.createProgram([path2, globalsShimPath], options, host, this.programCache.byPathOldProgram);
    this.programCache.byPathOldProgram = program;
    const sourceFile = program.getSourceFile(path2);
    const typeChecker = program.getTypeChecker();
    memoizeCheckerCalls(typeChecker);
    return this.setContext({
      src: sourceFile,
      checker: typeChecker,
      program
    });
  }
  // One program over N root files, instead of one program per file. Every
  // transpile*ByPath call pays for a full program: even with the SourceFile cache
  // making the ~340-file import closure parse-free, the binder/checker work behind
  // getPreEmitDiagnostics is redone per file. Batching N files into one program
  // pays it once for the whole set.
  //
  // Files that import each other (a derived exchange and its parent) are fine in
  // one batch — they are separate root files of the same program, exactly as
  // typescript would compile a project.
  //
  // The batch deliberately does not become the cache's byPathOldProgram: an N-file
  // program never structurally reuses a program built from a different root set, so
  // there is nothing to gain, and keeping the previous chunk's checker alive while
  // the next one is built would double peak memory — the opposite of why callers
  // chunk. The cross-batch saving comes from the shared host + SourceFile cache.
  createProgramBatch(paths) {
    const options = fastCompilerOptions;
    const host = this.getByPathCompilerHost(options);
    const program = _typescript2.default.createProgram([...paths, globalsShimPath], options, host);
    const checker = program.getTypeChecker();
    memoizeCheckerCalls(checker);
    return new TranspileProgramBatch(this, program, checker);
  }
  // the language printers read the typescript state (source file, checker, program)
  // off the context handed to them here, so two Transpiler instances never share
  // state and a nested transpile can restore whatever its caller was working on
  setContext(context) {
    this.context = context;
    this.pythonTranspiler.setContext(context);
    this.phpTranspiler.setContext(context);
    this.csharpTranspiler.setContext(context);
    this.goTranspiler.setContext(context);
    this.javaTranspiler.setContext(context);
    this.rustTranspiler.setContext(context);
    this.cppTranspiler.setContext(context);
    return context;
  }
  /** @deprecated renamed to createProgramInMemoryAndSetContext */
  createProgramInMemoryAndSetGlobals(content) {
    return this.createProgramInMemoryAndSetContext(content);
  }
  /** @deprecated renamed to createProgramByPathAndSetContext */
  createProgramByPathAndSetGlobals(path2) {
    return this.createProgramByPathAndSetContext(path2);
  }
  checkFileDiagnostics(context = this.context) {
    const diagnostics = _typescript2.default.getPreEmitDiagnostics(context.program, context.src);
    if (diagnostics.length > 0) {
      let errorMessage = "Errors found in the typescript code. Transpilation might produce invalid results:\n";
      diagnostics.forEach((msg) => {
        errorMessage += "  - " + msg.messageText + "\n";
      });
      Logger.warning(errorMessage);
    }
  }
  transpile(lang, mode, file, sync = false, createContext = true, handleImports = true) {
    if (createContext) {
      if (mode === 0 /* ByPath */) {
        this.createProgramByPathAndSetContext(file);
      } else {
        this.createProgramInMemoryAndSetContext(file);
      }
      this.checkFileDiagnostics();
    }
    const src = this.context.src;
    let transpiledContent = void 0;
    switch (lang) {
      case 0 /* Python */:
        this.pythonTranspiler.asyncTranspiling = !sync;
        transpiledContent = this.pythonTranspiler.printNode(src, -1);
        this.pythonTranspiler.asyncTranspiling = true;
        break;
      case 1 /* Php */:
        this.phpTranspiler.asyncTranspiling = !sync;
        transpiledContent = this.phpTranspiler.printNode(src, -1);
        this.phpTranspiler.asyncTranspiling = true;
        break;
      case 2 /* CSharp */:
        transpiledContent = this.csharpTranspiler.printNode(src, -1);
        break;
      case 3 /* Go */:
        transpiledContent = alignGoTrailingComments(this.goTranspiler.printNode(src, -1));
        break;
      case 4 /* Java */:
        transpiledContent = this.javaTranspiler.printNode(src, -1);
        break;
      case 5 /* Rust */:
        transpiledContent = this.rustTranspiler.printNode(src, -1);
        break;
      case 6 /* Cpp */:
        transpiledContent = this.cppTranspiler.printNode(src, -1);
        break;
    }
    let imports = [];
    let exports = [];
    if (handleImports) {
      imports = this.pythonTranspiler.getFileImports(src);
      exports = this.pythonTranspiler.getFileExports(src);
    }
    const methodsTypes = this.pythonTranspiler.getMethodTypes(src);
    Logger.success("transpilation finished successfully");
    return {
      content: transpiledContent,
      imports,
      exports,
      methodsTypes
    };
  }
  transpileDifferentLanguagesGeneric(mode, input, content) {
    let context;
    if (mode === 0 /* ByPath */) {
      context = this.createProgramByPathAndSetContext(content);
    } else {
      context = this.createProgramInMemoryAndSetContext(content);
    }
    this.checkFileDiagnostics(context);
    const files = [];
    input.forEach((inp) => {
      const async = inp.async;
      files.push({
        content: this.transpile(inp.language, mode, content, !async, false, false).content
      });
    });
    const methodsTypes = this.pythonTranspiler.getMethodTypes(context.src);
    const imports = this.pythonTranspiler.getFileImports(context.src);
    const exports = this.pythonTranspiler.getFileExports(context.src);
    const output = files.map((file) => {
      return {
        content: file.content,
        imports,
        exports,
        methodsTypes
      };
    });
    return output;
  }
  transpileDifferentLanguages(input, content) {
    const config = input.map((inp) => {
      return {
        language: this.convertStringToLanguageEnum(inp.language),
        async: inp.async
      };
    });
    return this.transpileDifferentLanguagesGeneric(1 /* ByContent */, config, content);
  }
  transpileDifferentLanguagesByPath(input, content) {
    const config = input.map((inp) => {
      return {
        language: this.convertStringToLanguageEnum(inp.language),
        async: inp.async
      };
    });
    return this.transpileDifferentLanguagesGeneric(0 /* ByPath */, config, content);
  }
  transpilePython(content) {
    return this.transpile(0 /* Python */, 1 /* ByContent */, content, !this.pythonTranspiler.asyncTranspiling);
  }
  transpilePythonByPath(path2) {
    return this.transpile(0 /* Python */, 0 /* ByPath */, path2, !this.pythonTranspiler.asyncTranspiling);
  }
  transpilePhp(content) {
    return this.transpile(1 /* Php */, 1 /* ByContent */, content, !this.phpTranspiler.asyncTranspiling);
  }
  transpilePhpByPath(path2) {
    return this.transpile(1 /* Php */, 0 /* ByPath */, path2, !this.phpTranspiler.asyncTranspiling);
  }
  transpileCSharp(content) {
    return this.transpile(2 /* CSharp */, 1 /* ByContent */, content);
  }
  transpileCSharpByPath(path2) {
    return this.transpile(2 /* CSharp */, 0 /* ByPath */, path2);
  }
  transpileJava(content) {
    return this.transpile(4 /* Java */, 1 /* ByContent */, content);
  }
  transpileJavaByPath(path2) {
    return this.transpile(4 /* Java */, 0 /* ByPath */, path2);
  }
  transpileGoByPath(path2) {
    return this.transpile(3 /* Go */, 0 /* ByPath */, path2);
  }
  transpileGo(content) {
    return this.transpile(3 /* Go */, 1 /* ByContent */, content);
  }
  transpileRust(content) {
    return this.transpile(5 /* Rust */, 1 /* ByContent */, content);
  }
  transpileRustByPath(path2) {
    return this.transpile(5 /* Rust */, 0 /* ByPath */, path2);
  }
  transpileCpp(content) {
    return this.transpile(6 /* Cpp */, 1 /* ByContent */, content);
  }
  transpileCppByPath(path2) {
    return this.transpile(6 /* Cpp */, 0 /* ByPath */, path2);
  }
  getFileImports(content) {
    const context = this.createProgramInMemoryAndSetContext(content);
    return this.phpTranspiler.getFileImports(context.src);
  }
  getFileExports(content) {
    const context = this.createProgramInMemoryAndSetContext(content);
    return this.phpTranspiler.getFileExports(context.src);
  }
  setPHPPropResolution(props) {
    this.phpTranspiler.propRequiresScopeResolutionOperator = props;
  }
  setPhpUncamelCaseIdentifiers(uncamelCase) {
    this.phpTranspiler.uncamelcaseIdentifiers = uncamelCase;
  }
  setPythonUncamelCaseIdentifiers(uncamelCase) {
    this.pythonTranspiler.uncamelcaseIdentifiers = uncamelCase;
  }
  setPhpAsyncTranspiling(async) {
    this.phpTranspiler.asyncTranspiling = async;
  }
  setPythonAsyncTranspiling(async) {
    this.pythonTranspiler.asyncTranspiling = async;
  }
  setPythonStringLiteralReplacements(replacements) {
    this.pythonTranspiler.StringLiteralReplacements = replacements;
  }
  convertStringToLanguageEnum(lang) {
    switch (lang) {
      case "python":
        return 0 /* Python */;
      case "php":
        return 1 /* Php */;
      case "csharp":
        return 2 /* CSharp */;
      case "go":
        return 3 /* Go */;
      case "java":
        return 4 /* Java */;
      case "rust":
        return 5 /* Rust */;
      case "cpp":
        return 6 /* Cpp */;
    }
  }
};
var TranspileProgramBatch = class {
  constructor(transpiler, program, checker) {
    this.transpiler = transpiler;
    this.program = program;
    this.checker = checker;
  }
  getProgram() {
    return this.program;
  }
  // point the owning Transpiler at one file of this batch, then run the same
  // diagnostics pass the single-file path runs — the printers read checker state
  // back from it, so it is not optional
  setContextForPath(filePath) {
    const src = _nullishCoalesce(this.program.getSourceFile(filePath), () => ( this.program.getSourceFile(path.resolve(filePath))));
    if (src === void 0) {
      throw new Error(`ast-transpiler: "${filePath}" is not a file of this program batch`);
    }
    const context = this.transpiler.setContext({ src, checker: this.checker, program: this.program });
    this.transpiler.checkFileDiagnostics(context);
    return context;
  }
  transpileByPath(lang, filePath, sync = false) {
    this.setContextForPath(filePath);
    return this.transpiler.transpile(lang, 0 /* ByPath */, filePath, sync, false);
  }
  transpilePythonByPath(filePath) {
    return this.transpileByPath(0 /* Python */, filePath, !this.transpiler.pythonTranspiler.asyncTranspiling);
  }
  transpilePhpByPath(filePath) {
    return this.transpileByPath(1 /* Php */, filePath, !this.transpiler.phpTranspiler.asyncTranspiling);
  }
  transpileCSharpByPath(filePath) {
    return this.transpileByPath(2 /* CSharp */, filePath);
  }
  transpileGoByPath(filePath) {
    return this.transpileByPath(3 /* Go */, filePath);
  }
  transpileJavaByPath(filePath) {
    return this.transpileByPath(4 /* Java */, filePath);
  }
  transpileRustByPath(filePath) {
    return this.transpileByPath(5 /* Rust */, filePath);
  }
  transpileCppByPath(filePath) {
    return this.transpileByPath(6 /* Cpp */, filePath);
  }
};





exports.TranspileProgramBatch = TranspileProgramBatch; exports.Transpiler = Transpiler; exports.alignGoTrailingComments = alignGoTrailingComments; exports.default = Transpiler;
//# sourceMappingURL=transpiler.cjs.map