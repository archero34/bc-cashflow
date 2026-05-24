/* eslint-disable */
let _module;
global.define = function (deps, factory) { _module = factory(); };
require('../FileCabinet/SuiteScripts/BlueCollar/CashFlow/modules/bc_cf_styles.js');
process.stdout.write(_module.getStyles());
