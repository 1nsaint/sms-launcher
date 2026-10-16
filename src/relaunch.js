'use strict';

// How to start this launcher again: the file the player started, since the
// AppImage (Linux) and the portable .exe (Windows) run from a temporary copy
// that goes away when the launcher quits; with its arguments, but not --play,
// which would start the game straight away.
function relaunchOptions({ argv, env, packaged, platform, execPath }) {
  const args = argv.slice(1).filter(arg => arg !== '--play');
  if (packaged && platform === 'linux' && env.APPIMAGE) return { execPath: env.APPIMAGE, args };
  if (packaged && platform === 'win32' && env.PORTABLE_EXECUTABLE_FILE) return { execPath: env.PORTABLE_EXECUTABLE_FILE, args };
  return { execPath, args };
}

module.exports = { relaunchOptions };
