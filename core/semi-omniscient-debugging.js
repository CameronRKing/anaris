const { builders: b, visit } = require('ast-types');
const recast = require('recast');

function shouldTransform(src) {
    return src.startsWith('"use odb"');
}
exports.shouldTransform = shouldTransform;

function transformJSCode(ast, fileName) {
    const unwrap = path => {
        const node = path.node;
        const emptyLoc = { line: undefined, column: undefined };
        const { start, end } = node.loc ? node.loc : { start: emptyLoc, end: emptyLoc };
        return { node, start, end };
    };

    const replace = (path) => {
        const { node, start, end } = unwrap(path);

        const withWrapperCall = b.callExpression(
            b.identifier('odb'),
            [path.node, b.literal(`${fileName}:${start.line}-${start.column}:${end.line}-${end.column}`)]
        );

        path.replace(withWrapperCall);

        return node;
    };

    visit(ast, {
        visitCallExpression(path) {
            this.traverse(path);
            replace(path);
        },
        visitMemberExpression(path) {
            const pNode = path.parent.node;
            const exceptions = {
                isOnLeftSideOfAssignment: pNode.type === 'AssignmentExpression' && path.name === 'left',
                // intercepting functions on objects messes with the value of `this`
                isInCallExpression: pNode.type === 'CallExpression'
            }

            const match = Object.entries(exceptions).find(([key, matches]) => matches);
            if (match) {
                return false;
            }

            replace(path);
            return false;
        },
        visitIdentifier(path) {
            if (path.node.name == 'odb') return false;
            // don't wrap identifiers on the right side of a member expression
            const pNode = path.parent.node;
            const pPath = path.parentPath;
            const exceptions = {
                // I should probably use { namedTypes } from 'ast-types'
                // not all parsers use the same type strings
                // switching parsers in the future could cause problems
                isProperty: pNode.type === 'MemberExpression' && pPath.name === 'property',
                isInFuncDecl: pNode.type === 'FunctionDeclaration',
                isParam: pPath.name === 'params' || pNode.type === 'AssignmentPattern',
                isVarDecl: pNode.type === 'VariableDeclarator',
                isObjProp: pNode.type === 'Property' && !pNode.computed,
                isInArrayPattern: pNode.type === 'ArrayPattern',
            };

            const match = Object.entries(exceptions).find(([key, matches]) => matches);
            if (match) {
                return false;
            }
            replace(path);
            return false;
        }
    });

    const statements = recast.parse(`const odb = window.odb;`).program.body;
    ast.program.body.splice(ast.program.body.length, 0, ...statements);

    return ast;
}
exports.transformJSCode = transformJSCode;