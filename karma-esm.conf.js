// Karma-vite breaks Karma in Node <14, and browser tests don't depend on Node versions, so
// we just skip the tests in those environments.
const nodeMajorVersion = parseInt(process.versions.node.split('.'));
if (nodeMajorVersion <= 14) {
    console.log('Skipping browser tests in old node version');
    process.exit(0);
}

module.exports = function(config) {
    config.set({
        frameworks: ['mocha', 'chai', 'vite'],
        files: [
            {
              pattern: 'test/**/*.spec.ts',
              type: 'module',
              watched: false,
              served: false,
            }
        ],
        mime: {
            'text/x-typescript': ['ts']
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