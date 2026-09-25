var __create = Object.create;
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

// ../../../ts7perf2-nm/go-B-nm/tsup/assets/esm_shims.js
import { fileURLToPath } from "url";
import path from "path";
var getFilename, getDirname, __dirname;
var init_esm_shims = __esm({
  "../../../ts7perf2-nm/go-B-nm/tsup/assets/esm_shims.js"() {
    getFilename = () => fileURLToPath(import.meta.url);
    getDirname = () => path.dirname(getFilename());
    __dirname = /* @__PURE__ */ getDirname();
  }
});

// src/tsUtils.ts
init_esm_shims();
import { SyntaxKind, ModifierFlags } from "typescript/unstable/ast";
var FUNCTION_LIKE_KINDS = /* @__PURE__ */ new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodSignature,
  SyntaxKind.CallSignature,
  SyntaxKind.JSDocSignature,
  SyntaxKind.ConstructSignature,
  SyntaxKind.IndexSignature,
  SyntaxKind.FunctionType,
  SyntaxKind.ConstructorType
]);
function isFunctionLike(node) {
  return node !== void 0 && FUNCTION_LIKE_KINDS.has(node.kind);
}
function isClassLike(node) {
  return node !== void 0 && (node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.ClassExpression);
}
function isStringLiteralLike(node) {
  return node !== void 0 && (node.kind === SyntaxKind.StringLiteral || node.kind === SyntaxKind.NoSubstitutionTemplateLiteral);
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
  const clause = (node.heritageClauses ?? []).find((c) => c.token === token);
  return clause ? [...clause.types] : [];
}
function getAllSuperTypeNodes(node) {
  if (node.kind === SyntaxKind.InterfaceDeclaration) {
    return heritageTypes(node, SyntaxKind.ExtendsKeyword);
  }
  if (isClassLike(node)) {
    return [...heritageTypes(node, SyntaxKind.ExtendsKeyword).slice(0, 1), ...heritageTypes(node, SyntaxKind.ImplementsKeyword)];
  }
  return [];
}
function getCombinedNodeFlags(node) {
  while (node.kind === SyntaxKind.BindingElement) {
    node = node.parent.parent;
  }
  let flags = node.flags;
  if (node.kind === SyntaxKind.VariableDeclaration) {
    node = node.parent;
  }
  if (node && node.kind === SyntaxKind.VariableDeclarationList) {
    flags |= node.flags;
    node = node.parent;
  }
  if (node && node.kind === SyntaxKind.VariableStatement) {
    flags |= node.flags;
  }
  return flags;
}
function canHaveModifiers(node) {
  return node.modifiers !== void 0 || FUNCTION_LIKE_KINDS.has(node.kind) || node.kind === SyntaxKind.Parameter || node.kind === SyntaxKind.PropertyDeclaration || node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.VariableStatement;
}
function getModifiers(node) {
  const modifiers = node.modifiers;
  const filtered = modifiers?.filter((m) => m.kind !== SyntaxKind.Decorator);
  return filtered && filtered.length > 0 ? filtered : void 0;
}
function symbolDeclarations(symbol) {
  return (symbol?.declarations ?? []).map((d) => d.resolve()).filter((d) => d !== void 0);
}
function symbolValueDeclaration(symbol) {
  return symbol?.valueDeclaration?.resolve();
}
function signatureDeclaration(signature) {
  return signature?.declaration?.resolve();
}
function typeParts(type) {
  return type?.isUnionType?.() || type?.isIntersectionType?.() ? type.getTypes() : void 0;
}
function typeTarget(type) {
  return type?.target !== void 0 ? type.getTarget() : void 0;
}

export {
  __commonJS,
  __toESM,
  __dirname,
  init_esm_shims,
  ModifierFlags,
  isFunctionLike,
  isClassLike,
  isStringLiteralLike,
  findAncestor,
  getAllSuperTypeNodes,
  getCombinedNodeFlags,
  canHaveModifiers,
  getModifiers,
  symbolDeclarations,
  symbolValueDeclaration,
  signatureDeclaration,
  typeParts,
  typeTarget
};
//# sourceMappingURL=chunk-WSDQRN6Z.js.map