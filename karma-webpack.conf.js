// Karma-vite breaks Karma in Node <14, and browser tests don't depend on Node versions, so
// we just skip the tests in those environments.
const nodeMajorVersion = parseInt(process.versions.node.split('.'));
if (nodeMajorVersion <= 14) {
    console.log('Skipping browser tests in old node version');
    process.exit(0);
}

const tmp = require('tmp');
tmp.setGracefulCleanup();

const outputDir = tmp.dirSync({ unsafeCleanup: true }).name;

module.exports = function(config) {
    config.set({
        frameworks: ['mocha', 'chai', 'webpack'],
        files: [
            'test/**/*.spec.ts',
            // Required due to https://github.com/ryanclark/karma-webpack/issues/498. Results in an
            // annoying warning before the webpack build, but then it works fine.
            { pattern: `${outputDir}/*.wasm`, included: false, served: true }
        ],
        mime: {
            'text/x-typescript': ['ts']
        },
        webpack: {
            mode: 'development',
            devtool: 'source-map',
            module: {
                rules: [
                    {
                        test: /\.ts$/,
                        loader: 'ts-loader',
                        options: {
                            configFile: 'test/tsconfig.json',
                            compilerOptions: {
                                outDir: tmp.dirSync({ unsafeCleanup: true }).name
                            }
                        },
                        exclude: /node_modules/
                    }
                ]
            },
            resolve: {
                extensions: ['.ts', '.js'],
                fallback: {
                    crypto: false
                }
            },
            experiments: {
                asyncWebAssembly: true
            },
            output: {
                path: outputDir
            }
        },
        webpackMiddleware: {
            stats: 'error-only'
        },
        preprocessors: {
            'test/**/*.ts': ['webpack', 'sourcemap']
        },
        reporters: ['spec'],
        port: 9876,
        logLevel: config.LOG_INFO,

        browsers: ['ChromeHeadless'],

        autoWatch: false,
        singleRun: true,
        concurrency: Infinity
    });
};