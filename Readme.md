# Flowgen-package

Generate Flow types for all the TypeScript definitions in a package

### CLI
```
flowgen-package --packageName semver --bundlePath ./semver.js
flowgen-package --packageName semver --bundlePath ./semver.js --packageDir "./node_modules/some_package"
flowgen-package --packageName semver --bundlePath ./semver.js --typesInstallScript "pnpm install --save-dev @types/semver"
```

```
❯ node ./bin/flowgen-package.js
Usage:  [options]

Options:
  -V, --version                              output the version number
  --packageName <packageName>                The name of the package
  --bundlePath <bundlePath>                  Generate a bundle suitable for FlowTyped at this path
  --typesInstallScript <typesInstallScript>  The install script used to install `@types/packageName`. By default npm install is used
  --packageDir <packageDir>        If given instead of installing `@types/packageName`, the types for this package are generated
  -h, --help                                 display help for command
```


## JavsScirpt API

```js
const { flowgenPackage } = require("flowgen-package")

flowgenPackage({
  packageName: "semver",
  bundlePath: "./semver.js",
})
```

For more information and options see the following:

```js
/**
 * @typedef {object} Options
 * @property {string} packageName The name of the package
 * @property {string | undefined} bundlePath Generate a bundle suitable for FlowTyped at this path
 * @property {string | undefined} typesInstallScript The install script used to install `@types/packageName`. By default
 *   npm install is used
 * @property {string | undefined} packageDir If given instead of installing `@types/packageName`, the types for
 *   this package are generated
 */

/**
 * Generate Flow types from @types package
 *
 * @param {Options} options See the above for the documentation of options
 */
async function flowgenPackage(givenOptions)
```
