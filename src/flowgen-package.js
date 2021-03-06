const glob = require("fast-glob")
const { promises, ensureFile } = require("fs-extra")
const { readFile, writeFile } = promises
const { join, relative, resolve, isAbsolute, dirname } = require("path")
const { compiler } = require("flowgen")
const { execSync } = require("child_process")
const { format } = require("prettier")

/**
 * @typedef {object} Options
 * @property {string} packageName The name of the package
 * @property {string | undefined} bundlePath Generate a bundle suitable for FlowTyped at this path
 * @property {string | undefined} typesInstallScript The install script used to install `@types/packageName`. By default
 *   npm install is used
 * @property {string | undefined} packageDir If given instead of installing `@types/packageName`, the types for this
 *   package are generated
 */

/**
 * Generate Flow types from @types package
 *
 * @param {Options} givenOptions See the above for the documentation of options
 */
async function flowgenPackage(givenOptions) {
  const options = givenOptions
  const { packageName } = options
  let packageDir
  if (!options.packageDir) {
    console.log(`Installing @types/${packageName}`)
    if (!options.typesInstallScript) {
      options.typesInstallScript = `npm install --save-dev @types/${packageName}`
    }
    execSync(options.typesInstallScript, {
      stdio: "inherit",
    })
    packageDir = resolve(`./node_modules/@types/${packageName}`)
    console.log(`Generating flow definitions for ${packageName} at ./node_modules/@types/${packageName}`)
  } else {
    packageDir = resolve(options.packageDir)
    console.log(`Generating flow definitions for ${packageName} at ${packageDir}`)
  }
  if (!options.bundlePath) {
    options.bundlePath = join(packageDir, `./${packageName}.js.flow`)
  }
  const filePaths = await glob(`**/*.d.ts`, {
    ignore: `${packageDir.replace(/\\/g, "/")}/**/node_modules/`,
    onlyFiles: true,
    cwd: packageDir,
    absolute: true,
  })
  if (filePaths.length === 0) {
    throw new Error(`No .d.ts files were found at ${packageDir}`)
  }
  const fileContents = await readFiles(filePaths)

  const writeFilePromises = []
  for (let iFile = 0, numFile = filePaths.length; iFile < numFile; iFile++) {
    const filePath = filePaths[iFile]
    const fileContent = fileContents[iFile]

    console.log(`Generating flow types from ${filePath}`)

    const outputFilePath = filePath.replace(/.d.ts$/, ".js.flow")
    const resolvedFile = relativizeAbsolutePath(packageDir, outputFilePath)

    // declare module the package itself instead of its index
    const moduleName = resolvedFile === "index" ? packageName : `${packageName}/${resolvedFile}`

    let outputFileContent = transformImportRequire(fileContent)
    outputFileContent = compiler.compileDefinitionString(outputFileContent)

    // we should format because Flowgen generates wrongly formatted code which results in an error
    outputFileContent = format(outputFileContent, { parser: "babel-flow" })

    outputFileContent = transformImportDefault(outputFileContent)
    outputFileContent = transformImportStar(outputFileContent)
    outputFileContent = transformImportNamed(outputFileContent)
    outputFileContent = transformExportType(outputFileContent)
    outputFileContent = transformRelativeImports(outputFileContent, outputFilePath, packageName, packageDir)

    outputFileContent = wrapDeclareFile(outputFileContent, moduleName)

    fileContents[iFile] = outputFileContent

    writeFilePromises.push(writeFile(outputFilePath, outputFileContent))
  }
  await Promise.all(writeFilePromises)

  console.log(`Generating bundle at ${options.bundlePath}`)
  await bundleFiles(fileContents, options.bundlePath)

  return "Success"
}
exports.flowgenPackage = flowgenPackage

/**
 * @param {string[]} filesPaths The paths to the files
 * @returns {Promise<string[]>} The contents of the files
 */
function readFiles(filesPaths) {
  return Promise.all(filesPaths.map((filePath) => readFile(filePath, { encoding: "utf-8" })))
}

/**
 * If the path is absolute, it will become relative to rootPath, otherwise it will be kept as is
 *
 * @param {string} rootPath
 * @param {string} pathToRelativize
 * @returns {string}
 */
function relativizeAbsolutePath(rootPath, pathToRelativize) {
  if (isAbsolute(pathToRelativize)) {
    // TODO we remove extention altogether
    return relative(rootPath, pathToRelativize.replace(".js.flow", "")).replace(/\\/g, "/")
  }
  return pathToRelativize
}

const importRequireRegex = /^\s*import\s*(\S*)\s*=\s*require\((.*)\);?\s*$/gm

/**
 * Transform `import x = require(y)` to `import type * as x from y`
 *
 * @param {string} fileContent
 */
function transformImportRequire(fileContent) {
  return fileContent.replace(importRequireRegex, "import type * as $1 from $2")
}

const importDefaultRegex = /^\s*import\s*(\S*)\s*from\s*(.*)\s*;?\s*$/gm

/**
 * Transform `import x from "y"` to `import type * as x from "y"`
 *
 * @param {string} fileContent
 */
function transformImportDefault(fileContent) {
  return fileContent.replace(importDefaultRegex, "import type * as $1 from $2")
}

const importStarRegex = /^\s*import\s*\*\s*as\s*(\S*)\s*from\s*(.*)\s*;?\s*$/gm

/**
 * Transform `import * as x from "y"` to `import type * as x from "y"`
 *
 * @param {string} fileContent
 */
function transformImportStar(fileContent) {
  return fileContent.replace(importStarRegex, "import type * as $1 from $2")
}

const importNamedRegex = /^\s*import\s*{(.*)}\s*from\s*(.*)\s*;?\s*$/gm

/**
 * Transform `import { x } as y from "z"` to `import type { x } * as y from "z"`
 *
 * @param {string} fileContent
 */
function transformImportNamed(fileContent) {
  return fileContent.replace(importNamedRegex, "import type $1 from $2")
}

const exportTypeRegex = /^\s*export\s*(type|interface)/gm

/**
 * Transform `export type/interface x` to `declare export type/interface x`
 *
 * @param {string} fileContent
 */
function transformExportType(fileContent) {
  return fileContent.replace(exportTypeRegex, "declare export $1")
}

const importFromRegex = /^\s*import\s*(.*)\s*from\s*["'](.*)["']\s*;?\s*$/gm

/** @param {string} filePath */
function isRelative(filePath) {
  return /\.\.?\/?/.test(filePath) // starts with ./ or ../ or . or ..
  // TODO we don't test for 'lib/something'
}

/**
 * @param {string} fileContent
 * @param {string} outputFilePath
 * @param {string} packageName
 * @param {string} packageDir
 */
function transformRelativeImports(fileContent, outputFilePath, packageName, packageDir) {
  return fileContent.replace(importFromRegex, (importStatement, importedSymbols, importPath) => {
    if (isRelative(importPath)) {
      const resolvedPath = resolve(dirname(outputFilePath), importPath)
      const relativePath = relativizeAbsolutePath(packageDir, resolvedPath)
      const moduleName = relativePath === "index" ? packageName : `${packageName}/${relativePath}`
      return `import ${importedSymbols.trim()} from "${moduleName}"`
    } else {
      // leave as is if not relative
      return importStatement
    }
  })
}

/**
 * Wrap the files generated by flowgen in declare module
 *
 * @param {string} fileContent
 * @param {string} moduleName The name of the module for that file
 */
function wrapDeclareFile(fileContent, moduleName) {
  return `// Generated from @types/${moduleName} using github.com/aminya/flowgen-package
declare module "${moduleName}" {
${indent(fileContent, 2)}
}`
}

/**
 * @param {string} fileContent The conent of a file
 * @param {number} indentLength The length of the indentation
 */
function indent(fileContent, indentLength) {
  return fileContent
    .split(/\n|\n\r/)
    .map((line) => (line !== "" ? `${" ".repeat(indentLength)}${line}` : line))
    .join("\n")
}

/**
 * Bundle the files
 *
 * @param {string[]} fileContents An array of file contents
 * @param {string} bundlePath Generate a bundle suitable for FlowTyped at this path
 */
async function bundleFiles(fileContents, bundlePath) {
  try {
    await ensureFile(bundlePath)
  } catch (err) {
    /* ignore */
  }
  const bundleContent = fileContents.join("\n\n")
  await writeFile(bundlePath, bundleContent)
}
