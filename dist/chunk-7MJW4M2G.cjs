"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } } function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }var __create = Object.create;
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

// node_modules/tsup/assets/cjs_shims.js
var init_cjs_shims = __esm({
  "node_modules/tsup/assets/cjs_shims.js"() {
  }
});

// src/tsUtils.ts
init_cjs_shims();
var _ast = require('typescript/unstable/ast');
var FUNCTION_LIKE_KINDS = /* @__PURE__ */ new Set([
  _ast.SyntaxKind.FunctionDeclaration,
  _ast.SyntaxKind.MethodDeclaration,
  _ast.SyntaxKind.Constructor,
  _ast.SyntaxKind.GetAccessor,
  _ast.SyntaxKind.SetAccessor,
  _ast.SyntaxKind.FunctionExpression,
  _ast.SyntaxKind.ArrowFunction,
  _ast.SyntaxKind.MethodSignature,
  _ast.SyntaxKind.CallSignature,
  _ast.SyntaxKind.JSDocSignature,
  _ast.SyntaxKind.ConstructSignature,
  _ast.SyntaxKind.IndexSignature,
  _ast.SyntaxKind.FunctionType,
  _ast.SyntaxKind.ConstructorType
]);
function isFunctionLike(node) {
  return node !== void 0 && FUNCTION_LIKE_KINDS.has(node.kind);
}
function isClassLike(node) {
  return node !== void 0 && (node.kind === _ast.SyntaxKind.ClassDeclaration || node.kind === _ast.SyntaxKind.ClassExpression);
}
function isStringLiteralLike(node) {
  return node !== void 0 && (node.kind === _ast.SyntaxKind.StringLiteral || node.kind === _ast.SyntaxKind.NoSubstitutionTemplateLiteral);
}
function findAncestor(node, callback) {
  while (node) {
    const result = callback(node);
    if (result === "quit") {
      return void 0;
    }
    if (result) {
      return node;
    }
    node = node.parent;
  }
  return void 0;
}
function heritageTypes(node, token) {
  const clause = (_nullishCoalesce(node.heritageClauses, () => ( []))).find((c) => c.token === token);
  return clause ? [...clause.types] : [];
}
function getAllSuperTypeNodes(node) {
  if (node.kind === _ast.SyntaxKind.InterfaceDeclaration) {
    return heritageTypes(node, _ast.SyntaxKind.ExtendsKeyword);
  }
  if (isClassLike(node)) {
    return [...heritageTypes(node, _ast.SyntaxKind.ExtendsKeyword).slice(0, 1), ...heritageTypes(node, _ast.SyntaxKind.ImplementsKeyword)];
  }
  return [];
}
function getCombinedNodeFlags(node) {
  while (node.kind === _ast.SyntaxKind.BindingElement) {
    node = node.parent.parent;
  }
  let flags = node.flags;
  if (node.kind === _ast.SyntaxKind.VariableDeclaration) {
    node = node.parent;
  }
  if (node && node.kind === _ast.SyntaxKind.VariableDeclarationList) {
    flags |= node.flags;
    node = node.parent;
  }
  if (node && node.kind === _ast.SyntaxKind.VariableStatement) {
    flags |= node.flags;
  }
  return flags;
}
function canHaveModifiers(node) {
  return node.modifiers !== void 0 || FUNCTION_LIKE_KINDS.has(node.kind) || node.kind === _ast.SyntaxKind.Parameter || node.kind === _ast.SyntaxKind.PropertyDeclaration || node.kind === _ast.SyntaxKind.ClassDeclaration || node.kind === _ast.SyntaxKind.VariableStatement;
}
function getModifiers(node) {
  const modifiers = node.modifiers;
  const filtered = _optionalChain([modifiers, 'optionalAccess', _ => _.filter, 'call', _2 => _2((m) => m.kind !== _ast.SyntaxKind.Decorator)]);
  return filtered && filtered.length > 0 ? filtered : void 0;
}














exports.__commonJS = __commonJS; exports.__toESM = __toESM; exports.init_cjs_shims = init_cjs_shims; exports.ModifierFlags = _ast.ModifierFlags; exports.isFunctionLike = isFunctionLike; exports.isClassLike = isClassLike; exports.isStringLiteralLike = isStringLiteralLike; exports.findAncestor = findAncestor; exports.getAllSuperTypeNodes = getAllSuperTypeNodes; exports.getCombinedNodeFlags = getCombinedNodeFlags; exports.canHaveModifiers = canHaveModifiers; exports.getModifiers = getModifiers;
//# sourceMappingURL=chunk-7MJW4M2G.cjs.map