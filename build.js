const shell = require('shelljs');

if (!shell.which('wasm-pack')) {
    console.error("Run npm install to install all dependencies first");
}

// Clean up any existing built content:
shell.rm('-rf', 'pkg');
shell.rm('-rf', 'dist');
shell.mkdir('dist');

// Copy the core web files into dist
shell.exec('wasm-pack build --target bundler');
shell.cp('pkg/brotli_wasm*', 'dist');
shell.rm('-rf', 'pkg');
shell.mv('dist/brotli_wasm.js', 'dist/browser-bundle.js');

// Copy the node wrapper into dist too
shell.exec('wasm-pack build --target nodejs');
shell.cp('pkg/brotli_wasm.js', 'dist/node.js');
shell.rm('-rf', 'pkg');