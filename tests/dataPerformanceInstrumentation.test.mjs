import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const browser = read('js/performanceInstrumentation.js');
const app = read('js/app.js');
const config = read('gas/00_Config.gs');
const repository = read('gas/02_SheetRepository.gs');
const api = read('gas/04_Api.gs');
const local = read('local.html');

assert.match(browser, /PTB_PERFORMANCE_LOG/);
assert.match(browser, /type: 'gas-request'/);
assert.match(browser, /type: 'db-operation'/);
assert.match(browser, /requestBytes/);
assert.match(browser, /responseBytes/);
assert.match(browser, /getPtbPerformanceLog/);
assert.match(browser, /clearPtbPerformanceLog/);

assert.match(app, /installPerformanceInstrumentation/);
assert.match(app, /performanceInstrumentation\.js\?v=1\.6\.0-data-performance-instrumentation-1/);
assert.ok(app.indexOf('installPerformanceInstrumentation();') < app.indexOf("beginDbOperation('資料載入中'"));

assert.match(config, /PTB_ASSET_VERSION = '1\.6\.0-data-performance-instrumentation-1'/);
assert.match(config, /spreadsheetOpenMs/);
assert.match(config, /sheetReadMs/);
assert.match(config, /sheetWriteMs/);
assert.match(config, /lockWaitMs/);
assert.match(config, /lockHoldMs/);
assert.match(config, /getPerformanceSnapshot_/);

assert.match(repository, /addTableTiming_\(ctx,'read'/);
assert.match(repository, /addTableTiming_\(ctx,'write'/);
assert.match(repository, /lock\.tryLock\(30000\)/);
assert.match(repository, /addTiming_\(ctx,'lockWaitMs'/);
assert.match(repository, /addTiming_\(ctx,'lockHoldMs'/);

assert.match(api, /attachPerformance_/);
assert.match(api, /response\.performance=performance/);
assert.match(api, /ctx\.action=cleanString_\(action\)/);
assert.match(api, /requestPayloadChars/);
assert.match(api, /getWorkStudyBootstrapData/);

assert.match(local, /app\.js\?v=1\.6\.0-data-performance-instrumentation-1/);

console.log('data performance instrumentation contracts: PASS');
