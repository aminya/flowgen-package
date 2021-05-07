#!/usr/bin/env node

const { program } = require("commander")
const { flowgenPackage } = require("../src/flowgen-package")

program.version("0.1")

program
  .option("--packageName <packageName>", "The name of the package")
  .option("--bundlePath <bundlePath>", "Generate a bundle suitable for FlowTyped at this path")
  .option(
    "--typesInstallScript <typesInstallScript>",
    "The install script used to install `@types/packageName`. By default npm install is used"
  )
  .option(
    "--packageDir <packageDir>",
    "If given instead of installing `@types/packageName`, the types for this package are generated"
  )
  .option(
    "--beautify",
    "Beautify the output"
  )

if (process.argv.length <= 2) {
  program.help()
}

program.parse(process.argv)
const options = program.opts()

flowgenPackage(options).catch((e) => {
  throw e
})
