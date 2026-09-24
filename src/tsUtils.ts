// TS6 compiler helpers that typescript/unstable (TS7) does not export, re-implemented over TS7 nodes
// with the TS6 names and semantics so the printers keep their call sites.
import { SyntaxKind, NodeFlags, ModifierFlags, type Node, type NodeArray } from "typescript/unstable/ast";

const FUNCTION_LIKE_KINDS = new Set<SyntaxKind>([
    SyntaxKind.FunctionDeclaration, SyntaxKind.MethodDeclaration, SyntaxKind.Constructor, SyntaxKind.GetAccessor,
    SyntaxKind.SetAccessor, SyntaxKind.FunctionExpression, SyntaxKind.ArrowFunction, SyntaxKind.MethodSignature,
    SyntaxKind.CallSignature, SyntaxKind.JSDocSignature, SyntaxKind.ConstructSignature, SyntaxKind.IndexSignature,
    SyntaxKind.FunctionType, SyntaxKind.ConstructorType,
]);

function isFunctionLike(node: Node | undefined): boolean {
    return node !== undefined && FUNCTION_LIKE_KINDS.has(node.kind);
}

function isClassLike(node: Node | undefined): boolean {
    return node !== undefined && (node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.ClassExpression);
}

function isStringLiteralLike(node: Node | undefined): boolean {
    return node !== undefined && (node.kind === SyntaxKind.StringLiteral || node.kind === SyntaxKind.NoSubstitutionTemplateLiteral);
}

// TS6 contract: callback returning true stops at that node, "quit" aborts with undefined
function findAncestor<T extends Node = Node>(node: Node | undefined, callback: (element: Node) => boolean | "quit"): T | undefined {
    while (node) {
        const result = callback(node);
        if (result === "quit") {
            return undefined;
        }
        if (result) {
            return node as T;
        }
        node = node.parent;
    }
    return undefined;
}

function heritageTypes(node: any, token: SyntaxKind): Node[] {
    const clause = (node.heritageClauses ?? []).find((c: any) => c.token === token);
    return clause ? [...clause.types] : [];
}

// extends (first type only for classes) followed by implements, as in TS6
function getAllSuperTypeNodes(node: Node): readonly Node[] {
    if (node.kind === SyntaxKind.InterfaceDeclaration) {
        return heritageTypes(node, SyntaxKind.ExtendsKeyword);
    }
    if (isClassLike(node)) {
        return [...heritageTypes(node, SyntaxKind.ExtendsKeyword).slice(0, 1), ...heritageTypes(node, SyntaxKind.ImplementsKeyword)];
    }
    return [];
}

function getCombinedNodeFlags(node: Node): NodeFlags {
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

function canHaveModifiers(node: Node): boolean {
    return (node as any).modifiers !== undefined || FUNCTION_LIKE_KINDS.has(node.kind) || node.kind === SyntaxKind.Parameter
        || node.kind === SyntaxKind.PropertyDeclaration || node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.VariableStatement;
}

function getModifiers(node: Node): readonly Node[] | undefined {
    const modifiers: NodeArray<Node> | undefined = (node as any).modifiers;
    const filtered = modifiers?.filter((m) => m.kind !== SyntaxKind.Decorator);
    return filtered && filtered.length > 0 ? filtered : undefined;
}

export {
    ModifierFlags,
    isFunctionLike,
    isClassLike,
    isStringLiteralLike,
    findAncestor,
    getAllSuperTypeNodes,
    getCombinedNodeFlags,
    canHaveModifiers,
    getModifiers,
};
