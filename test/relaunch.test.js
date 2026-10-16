'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { relaunchOptions } = require('../src/relaunch');

test('the launcher starts again from the file the player started, without --play', () => {
  const base = { argv: ['/tmp/.mount_x/sms-launcher', '--no-sandbox', '--play'], env: {}, execPath: '/tmp/.mount_x/sms-launcher' };
  assert.deepEqual(relaunchOptions({ ...base, packaged: true, platform: 'linux', env: { APPIMAGE: '/home/p/SMS.AppImage' } }),
    { execPath: '/home/p/SMS.AppImage', args: ['--no-sandbox'] });
  assert.deepEqual(relaunchOptions({ argv: ['C:\\Temp\\x\\SMS Launcher.exe'], packaged: true, platform: 'win32', execPath: 'C:\\Temp\\x\\SMS Launcher.exe',
    env: { PORTABLE_EXECUTABLE_FILE: 'D:\\Games\\SMS-Launcher-Portable.exe' } }),
  { execPath: 'D:\\Games\\SMS-Launcher-Portable.exe', args: [] });
  assert.deepEqual(relaunchOptions({ argv: ['C:\\Program Files\\SMS Launcher\\SMS Launcher.exe'], packaged: true, platform: 'win32',
    execPath: 'C:\\Program Files\\SMS Launcher\\SMS Launcher.exe', env: {} }),
  { execPath: 'C:\\Program Files\\SMS Launcher\\SMS Launcher.exe', args: [] });
  // Development: Electron again, with the app folder.
  assert.deepEqual(relaunchOptions({ argv: ['/repo/node_modules/electron/dist/electron', '--no-sandbox', '.'], packaged: false, platform: 'linux',
    execPath: '/repo/node_modules/electron/dist/electron', env: { APPIMAGE: '/ignored' } }),
  { execPath: '/repo/node_modules/electron/dist/electron', args: ['--no-sandbox', '.'] });
});
