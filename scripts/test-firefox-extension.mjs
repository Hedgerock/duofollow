import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { log } from 'node:console';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

import { buildSync } from 'esbuild';
import { firefox } from 'playwright';
import webExt from 'web-ext';

/** Waits for web-ext's managed process close event after requesting shutdown. */
export async function stopFirefoxRunner(runner, { timeoutMs = 10_000 } = {}) {
  if (!runner) return;
  let timer;
  const closed = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Firefox did not finish shutting down')), timeoutMs);
    runner.registerCleanup(resolve);
  });
  try {
    await Promise.all([runner.exit(), closed]);
  } finally {
    clearTimeout(timer);
  }
}

/** Deletes only an owned results directory, retrying transient locks after shutdown. */
export async function removeFirefoxTestDirectory(directory, root) {
  const target = await realpath(directory),
    parent = await realpath(root);
  if (dirname(target) !== parent)
    throw new Error('Refusing to remove a directory outside Firefox test results');
  await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/** Isolated Firefox install: real SDK/bridge, fake Duolingo responses, no real account or DELETE. */
export async function runFirefoxExtensionTest() {
  const root = resolve('.');
  execFileSync(process.execPath, ['extension/scripts/build.mjs', '--firefox'], {
    stdio: 'inherit',
  });
  mkdirSync('firefox-test-results', { recursive: true });
  const temporary = mkdtempSync(resolve('firefox-test-results/firefox-native-'));
  const extension = join(temporary, 'extension');
  const profile = join(temporary, 'profile');
  mkdirSync(profile);
  cpSync('extension/dist-firefox', extension, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(extension, 'manifest.json'), 'utf8'));
  manifest.permissions.push('cookies');
  manifest.host_permissions = ['https://www.duolingo.com/*', 'http://127.0.0.1/*'];
  delete manifest.optional_permissions;
  delete manifest.optional_host_permissions;
  writeFileSync(join(extension, 'manifest.json'), JSON.stringify(manifest));
  const prelude = `
const realFetch = globalThis.fetch.bind(globalThis);
let fixtureDeleted = false;
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  if (url.origin !== 'https://www.duolingo.com') throw new Error('Unexpected test request');
  if (options?.method === 'DELETE') { await realFetch('http://127.0.0.1:5173/fixture/write', {method:'POST'}); fixtureDeleted = true; return Response.json({successful:true}); }
  if (url.pathname.endsWith('/users/101')) return Response.json({id:101,username:'Learner',picture:null});
  if (url.pathname.endsWith('/users')) return Response.json({users:[{id:101,username:'Learner'}]});
  if (url.pathname.endsWith('/following')) return Response.json({following:{cursor:null,totalUsers:fixtureDeleted?0:1,users:fixtureDeleted?[]:[{userId:202,username:'Target'}]}});
  if (url.pathname.endsWith('/followers')) return Response.json({followers:{cursor:null,totalUsers:0,users:[]}});
  throw new Error('Unexpected Duolingo test endpoint');
};
`;
  const setup = `
void (async () => {
  await browser.cookies.set({url:'https://www.duolingo.com',name:'jwt_token',value:'fixture.'+btoa(JSON.stringify({sub:101,exp:4000000000}))+'.signature'});
  await browser.storage.local.set({duolingoAccessConsent:1,quickUnfollowConsent:2});
  await realFetch('http://127.0.0.1:5173/fixture/ready', {method:'POST'});
})();
`;
  writeFileSync(
    join(extension, 'background.js'),
    prelude + readFileSync(join(extension, 'background.js'), 'utf8') + setup,
  );
  const driver = buildSync({
    absWorkingDir: root,
    bundle: true,
    write: false,
    format: 'iife',
    tsconfig: 'tsconfig.json',
    stdin: {
      contents: `
    import {createFirefoxTransport} from '@duofollow/src/api/extension/firefoxTransport';
    const channel = createFirefoxTransport();
    const check = (condition, label) => { if (!condition) throw new Error(label); };
    void (async () => {
      for(let i=0; i<100; i++) { if(await fetch('/fixture/ready').then(r=>r.json())) break; await new Promise(r=>setTimeout(r,100)); }
      const receipt = sessionStorage.getItem('receipt');
      if (receipt) {
        const denied = await channel.request({type:'GET_UNFOLLOW_STATUS',requestId:receipt});
        check(denied.errorCode === 'UNFOLLOW_UNCONFIRMED', 'reload must change document identity');
        await fetch('/fixture/result', {method:'POST',body:JSON.stringify({success:true})}); return;
      }
      check((await channel.request({type:'PING'})).success === true, 'ping');
      check((await channel.request({type:'GET_DUOLINGO_ACCESS',includeAccount:true})).session === 'ready', 'real cookie and consent');
      const summary = await channel.request({type:'GET_FOLLOWING_SUMMARY',username:'Learner'});
      check(summary.success && summary.comparison.checkedFollowing === 1, 'compare');
      check((await channel.request({type:'OPEN_DUOLINGO_SETTINGS'})).success, 'adjacent settings');
      check((await channel.request({type:'OPEN_DUOLINGO_SETTINGS'})).success, 'reuse settings');
      const request = await channel.request({type:'REQUEST_QUICK_UNFOLLOW',username:'Learner',targetUserId:202});
      check(request.success, 'prepare quick');
      const result = await channel.request({type:'CONFIRM_QUICK_UNFOLLOW',requestId:request.requestId});
      check(result.success && result.targetUserId === 202, 'confirm quick');
      check((await channel.request({type:'GET_UNFOLLOW_STATUS',requestId:request.requestId})).success, 'recover outcome');
      check(!(await channel.request({type:'CONFIRM_QUICK_UNFOLLOW',requestId:request.requestId})).success, 'no duplicate confirmation');
      sessionStorage.setItem('receipt',request.requestId); location.reload();
    })().catch(error=>fetch('/fixture/result',{method:'POST',body:JSON.stringify({success:false,error:String(error)})}));
  `,
      resolveDir: root,
      sourcefile: 'firefox-native-fixture.ts',
    },
  }).outputFiles[0].text;
  let writes = 0;
  let ready = false,
    resolveResult;
  const result = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/fixture/write') {
      writes++;
      response.end('{}');
      return;
    }
    if (request.url === '/fixture/ready') {
      if (request.method === 'POST') ready = true;
      response.end(JSON.stringify(ready));
      return;
    }
    if (request.url === '/fixture/result') {
      let body = '';
      for await (const chunk of request) body += chunk;
      resolveResult(JSON.parse(body));
      response.end('{}');
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><html lang="en"><title>Isolated Firefox connector test</title><script>' +
        driver +
        '</script></html>',
    );
  });
  let runner, timer;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(5173, '127.0.0.1', resolve);
    });
    runner = await webExt.cmd.run({
      sourceDir: extension,
      artifactsDir: temporary,
      firefoxProfile: profile,
      keepProfileChanges: true,
      firefox: process.env.DUOFOLLOW_FIREFOX_BINARY || firefox.executablePath(),
      noInput: true,
      noReload: true,
      args: ['-headless'],
      startUrl: ['http://127.0.0.1:5173/duofollow/'],
    });
    const report = await Promise.race([
      result,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Firefox extension test timed out')), 60_000);
      }),
    ]);
    assert.equal(report.success, true, report.error);
    assert.equal(writes, 1, 'Exactly one simulated DELETE is permitted');
  } finally {
    clearTimeout(timer);
    try {
      await stopFirefoxRunner(runner);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await removeFirefoxTestDirectory(temporary, resolve('firefox-test-results'));
  }
  log(
    'Firefox native extension: cookie/consent, comparison, settings, quick confirmation, receipt recovery and reload isolation passed',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await runFirefoxExtensionTest();
}
