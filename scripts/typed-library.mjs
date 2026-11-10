import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import ts from "typescript";

// Only the precompiled third-party implementation below is untyped. This
// boundary describes the PNG APIs used by our strictly checked source modules.
const vendorTypes = `type __fbVendor = {
  decode(bytes: Uint8Array): {
    width: number; height: number; depth: number; channels: number;
    data: Uint8Array | Uint8ClampedArray | Uint16Array;
    palette?: number[][];
  };
  encode(image: {
    width: number; height: number; depth: number; channels: number;
    data: Uint8Array | Uint8ClampedArray | Uint16Array;
  }, options?: { zlib?: { level?: number } }): Uint8Array;
  hasPngSignature(bytes: Uint8Array): boolean;
  zlibSync(bytes: Uint8Array, options?: { level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }): Uint8Array;
  Unzlib: new (callback: (chunk: Uint8Array, final: boolean) => void) => {
    push(chunk: Uint8Array, final?: boolean): void;
  };
};`;
const vendorExports = new Map([
  ["fast-png", new Set(["decode", "encode", "hasPngSignature"])],
  ["fflate", new Set(["Unzlib", "zlibSync"])],
]);

/** Produce one annotated classic-plugin entrypoint without external imports. */
export async function buildTypedLibrary({
  entrypoint = "plugins/figma/src/classic-controller.ts",
  commandId,
}) {
  if (!commandId || !/^[a-zA-Z0-9-]+$/.test(commandId))
    throw new Error("Provide the account-library plugin ID returned by Figma.");
  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2020.d.ts"],
    types: ["@figma/plugin-typings"],
  };
  const entry = resolve(entrypoint);
  const files = new Map();
  const ordered = [];
  let usesVendor = false;
  function modulePath(specifier, owner) {
    if (!specifier.startsWith(".")) {
      if (!vendorExports.has(specifier))
        throw new Error(`Unsupported library dependency: ${specifier}`);
      usesVendor = true;
      return "__fb_vendor";
    }
    const found = ts.resolveModuleName(specifier, owner, options, ts.sys)
      .resolvedModule?.resolvedFileName;
    if (!found || !found.endsWith(".ts") || found.endsWith(".d.ts"))
      throw new Error(
        `Cannot inline library module ${specifier} from ${owner}`,
      );
    return resolve(found);
  }
  async function discover(path) {
    if (files.has(path)) return;
    const source = ts.createSourceFile(
      path,
      await readFile(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    files.set(path, source);
    const dependencies = new Set();
    function visit(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier)
          dependencies.add(modulePath(node.moduleSpecifier.text, path));
      } else if (ts.isImportTypeNode(node)) {
        if (
          !ts.isLiteralTypeNode(node.argument) ||
          !ts.isStringLiteral(node.argument.literal)
        )
          throw new Error("A library import type must name a literal module.");
        dependencies.add(modulePath(node.argument.literal.text, path));
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const dependency of dependencies)
      if (dependency !== "__fb_vendor") await discover(dependency);
    // References remain namespace properties, so cyclic imports are resolved
    // when called instead of capturing undefined functions during startup.
    ordered.push(path);
  }
  await discover(entry);
  const codecs = resolve("plugins/figma/src/sandbox-text-codecs.ts");
  if (usesVendor) await discover(codecs);
  const program = ts.createProgram([...files.keys()], options);
  const checker = program.getTypeChecker();
  const namespaces = new Map(
    [...files.keys()].sort().map((path, index) => [path, `__fb_${index}`]),
  );
  const printer = ts.createPrinter();
  const output = [];
  const entity = (scope, name) => {
    if (!name) return ts.factory.createIdentifier(scope);
    if (ts.isIdentifier(name))
      return ts.factory.createQualifiedName(
        ts.factory.createIdentifier(scope),
        name.text,
      );
    return ts.factory.createQualifiedName(entity(scope, name.left), name.right);
  };
  for (const path of ordered) {
    const source = program.getSourceFile(path);
    const imports = new Map();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!statement.importClause)
        throw new Error(
          "Side-effect imports need an explicit library adapter.",
        );
      const specifier = statement.moduleSpecifier.text;
      const dependency = modulePath(specifier, path);
      const scope = namespaces.get(dependency) ?? dependency;
      const clause = statement.importClause;
      if (clause.name)
        throw new Error("Default imports need an explicit library adapter.");
      if (ts.isNamespaceImport(clause.namedBindings)) {
        imports.set(checker.getSymbolAtLocation(clause.namedBindings.name), {
          scope,
        });
      } else if (clause.namedBindings) {
        for (const binding of clause.namedBindings.elements) {
          const name = (binding.propertyName ?? binding.name).text;
          if (
            dependency === "__fb_vendor" &&
            !vendorExports.get(specifier).has(name)
          )
            throw new Error(
              `Unsupported library vendor export: ${specifier}.${name}`,
            );
          imports.set(checker.getSymbolAtLocation(binding.name), {
            scope,
            name,
          });
        }
      }
    }
    const expression = ({ scope, name }) =>
      name
        ? ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier(scope),
            name,
          )
        : ts.factory.createIdentifier(scope);
    const importedEntity = ({ scope, name }) =>
      name
        ? ts.factory.createQualifiedName(
            ts.factory.createIdentifier(scope),
            name,
          )
        : ts.factory.createIdentifier(scope);
    const transformed = ts.transform(source, [
      (context) => {
        const visit = (node) => {
          if (ts.isImportDeclaration(node)) return undefined;
          if (ts.isExportDeclaration(node) || ts.isExportAssignment(node))
            throw new Error("Re-exports need an explicit library adapter.");
          if (
            node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
          )
            throw new Error(
              "Default exports need an explicit library adapter.",
            );
          if (ts.isImportTypeNode(node)) {
            const dependency = modulePath(node.argument.literal.text, path);
            const name = entity(
              namespaces.get(dependency) ?? dependency,
              node.qualifier,
            );
            return node.isTypeOf
              ? ts.factory.createTypeQueryNode(name)
              : ts.factory.createTypeReferenceNode(
                  name,
                  node.typeArguments?.map((argument) =>
                    ts.visitNode(argument, visit),
                  ),
                );
          }
          if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.name.text === "libraryCommand" &&
            path === entry
          )
            return ts.factory.updateVariableDeclaration(
              node,
              node.name,
              node.exclamationToken,
              node.type,
              ts.factory.createStringLiteral(commandId),
            );
          if (ts.isShorthandPropertyAssignment(node)) {
            const binding = imports.get(
              checker.getShorthandAssignmentValueSymbol(node),
            );
            if (binding)
              return ts.factory.createPropertyAssignment(
                node.name,
                expression(binding),
              );
          }
          if (ts.isIdentifier(node)) {
            const binding = imports.get(checker.getSymbolAtLocation(node));
            if (binding) {
              const parent = node.parent;
              if (
                ts.isTypeReferenceNode(parent) ||
                ts.isTypeQueryNode(parent) ||
                ts.isQualifiedName(parent)
              )
                return importedEntity(binding);
              return expression(binding);
            }
          }
          return ts.visitEachChild(node, visit, context);
        };
        return (node) => ts.visitNode(node, visit);
      },
    ]);
    output.push({
      path,
      text: `// ${relative(process.cwd(), path)}\nnamespace ${namespaces.get(path)} {\n${printer.printFile(transformed.transformed[0])}\n}`,
    });
    transformed.dispose();
  }
  let vendor = "";
  if (usesVendor) {
    const bundled = await build({
      stdin: {
        contents:
          'export { decode, encode, hasPngSignature } from "fast-png"; export { Unzlib, zlibSync } from "fflate";',
        resolveDir: process.cwd(),
        sourcefile: "framebridge-png-vendor.js",
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      globalName: "__fb_vendorRuntime",
      target: "es2020",
      write: false,
      minify: true,
      legalComments: "none",
      define: {
        TextEncoder: `${namespaces.get(codecs)}.TextEncoder`,
        TextDecoder: `${namespaces.get(codecs)}.TextDecoder`,
      },
    });
    const js = bundled.outputFiles[0].text.trim();
    if (js.includes("\n"))
      throw new Error("The vendor adapter must stay on one line.");
    vendor = `type TextDecoderOptions = { fatal?: boolean; ignoreBOM?: boolean };
type TextDecodeOptions = { stream?: boolean };
type AllowSharedBufferSource = ArrayBufferLike | ArrayBufferView;
declare const globalThis: {
  TextEncoder?: new () => {
    readonly encoding: string;
    encode(input?: string): Uint8Array;
    encodeInto(input: string, output: Uint8Array): { read: number; written: number };
  };
  TextDecoder?: new (label?: string, options?: TextDecoderOptions) => {
    readonly encoding: string; readonly fatal: boolean; readonly ignoreBOM: boolean;
    decode(input?: AllowSharedBufferSource, options?: TextDecodeOptions): string;
  };
};
${output.find((module) => module.path === codecs).text}
${vendorTypes}\n// Bundled fast-png/fflate implementation; our typed boundary and modules remain checked.\n// @ts-ignore -- third-party JavaScript only\n${js}\nconst __fb_vendor: __fbVendor = __fb_vendorRuntime;\n`;
  }
  // Figma documents structuredClone in its sandbox. The pinned plugin typings
  // omit it; declare that one supported API rather than enabling the DOM lib.
  const code = `// Generated from repository sources, preserving module scopes and TypeScript annotations.\nnamespace FramebridgeLibrary {\ndeclare function structuredClone<T>(value: T): T;\n${vendor}${output
    .filter((module) => !usesVendor || module.path !== codecs)
    .map((module) => module.text)
    .join("\n")}\n${namespaces.get(entry)}.startClassicController();\n}\n`;
  return {
    code,
    modules: ordered.map((path) => relative(process.cwd(), path)),
  };
}
