import ts from 'typescript';
import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('frontend/src');
const layers = ['entrypoints', 'app', 'pages', 'widgets', 'features', 'entities', 'shared'];
const violations = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(filename);
    else if (/\.tsx?$/.test(filename)) await inspect(filename);
  }
}
async function resolveLocal(importer, specifier) {
  if (!specifier.startsWith('.') || /\.(css|svg|png)(\?|$)|\?/.test(specifier)) return;
  const base = path.resolve(path.dirname(importer), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    try { await access(candidate); if (/\.tsx?$/.test(candidate)) return candidate; } catch {}
  }
}
async function inspect(filename) {
  const source = ts.createSourceFile(filename, await readFile(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const from = path.relative(root, filename).split(path.sep);
  for (const specifier of imports) {
    const resolved = await resolveLocal(filename, specifier);
    if (!resolved) continue;
    const to = path.relative(root, resolved).split(path.sep);
    const sameSlice = from[0] === to[0] && (['app', 'pages', 'entrypoints', 'shared'].includes(from[0]) || from[1] === to[1]);
    const upward = layers.indexOf(to[0]) < layers.indexOf(from[0]);
    const sibling = from[0] === to[0] && !sameSlice;
    const privateImport = !sameSlice && ['widgets', 'features', 'entities'].includes(to[0]) && !/^index\.tsx?$/.test(path.basename(resolved));
    if (upward || sibling || privateImport) violations.push(`${path.relative(root, filename)} -> ${specifier}: ${upward ? 'upward import' : sibling ? 'sibling slice import' : 'private slice import'}`);
  }
}
await walk(root);
if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
else console.log('FSD boundaries passed.');
