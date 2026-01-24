const shell = require('shelljs');

if (!shell.which('wasm-pack')) {
    console.error("Run npm install to install all dependencies first");
}

// Clean up any existing built content:
shell.rm('-rf', 'dist');
shell.rm('-rf', 'pkg.*');
shell.mkdir('dist');

// Create the bundler output
shell.rm('-rf', 'pkg');
shell.exec('wasm-pack build --target bundler');
shell.mv('pkg', 'pkg.bundler');
shell.rm('pkg.bundler/{LICENSE,package.json,README.md,.gitignore}');

// Create the node output
shell.rm('-rf', 'pkg');
shell.exec('wasm-pack build --target nodejs');
shell.mv('pkg', 'pkg.node');
shell.rm('pkg.node/{LICENSE,package.json,README.md,.gitignore}');

// Create the esm node output
shell.rm('-rf', 'pkg');
shell.exec('wasm-pack build --target experemintal-nodejs-module');
shell.mv('pkg', 'pkg.node.esm');
shell.rm('pkg.node/{LICENSE,package.json,README.md,.gitignore}');

// Create the web output
shell.rm('-rf', 'pkg');
shell.exec('wasm-pack build --target web');
shell.mv('pkg', 'pkg.web');
shell.rm('pkg.web/{LICENSE,package.json,README.md,.gitignore}');