const SuiteCloudJestConfiguration = require('@oracle/suitecloud-unit-testing/jest-configuration/SuiteCloudJestConfiguration');

const config = SuiteCloudJestConfiguration.build({
    projectFolder: __dirname,
    projectType: SuiteCloudJestConfiguration.ProjectType.ACP,
});

// Fix: override the SuiteScripts mapping to use <rootDir> properly
config.moduleNameMapper['^SuiteScripts(.*)$'] = '<rootDir>/FileCabinet/SuiteScripts$1';
config.testMatch = ['**/tests/**/*.test.js'];

module.exports = config;
