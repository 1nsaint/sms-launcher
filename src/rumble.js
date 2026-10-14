'use strict';

// Lets Settings → Controls rumble the controller while Rumble strength is chosen, as the game would at
// that strength. The game (sms-pc-port, RumbleBase::update) plays a rumble's power, 0 to 1, by running
// the motor on that share of its 30 frames a second; the port runs the motor gentler below 100% and
// multiplies the power above it (platform/pad/pad.cpp), so light rumbles run on more frames.
(function (root) {
  const FRAME_MS = 1000 / 30;
  // A full-power rumble, then a light one: lower strengths soften both, higher ones fill in the light one.
  const PREVIEW = [{ power: 1, frames: 8 }, { power: 0, frames: 4 }, { power: 0.4, frames: 18 }];

  // The motor's magnitude (0 to 1) on each game frame of the given rumbles at strength (percent).
  function pattern(strength, rumbles = PREVIEW) {
    const percent = Math.max(0, Math.min(200, Number(strength) || 0));
    const magnitude = Math.min(percent, 100) / 100;
    const boost = Math.max(1, percent / 100);
    const frames = [];
    for (const { power, frames: count } of rumbles) {
      let accumulator = 0;
      for (let i = 0; i < count; i++) {
        accumulator += Math.min(1, power * boost);
        const on = power > 0 && accumulator >= 1;
        if (on) accumulator -= 1;
        frames.push(on ? magnitude : 0);
      }
    }
    return frames;
  }

  // The pattern as runs of one magnitude: { at, duration, magnitude } in milliseconds, motor-off runs left out.
  function segments(frames) {
    const runs = [];
    for (let i = 0; i < frames.length;) {
      let end = i;
      while (end < frames.length && frames[end] === frames[i]) end++;
      if (frames[i] > 0) runs.push({ at: Math.round(i * FRAME_MS), duration: Math.round((end - i) * FRAME_MS), magnitude: frames[i] });
      i = end;
    }
    return runs;
  }

  // Plays the preview at strength on every connected controller with motors; a new preview replaces the last.
  function createPreview({ getGamepads, setTimeout = root.setTimeout, clearTimeout = root.clearTimeout }) {
    let timers = [];
    function actuators() {
      return [...(getGamepads?.() || [])].filter(pad => pad?.connected && pad.vibrationActuator).map(pad => pad.vibrationActuator);
    }
    function stop() {
      for (const timer of timers) clearTimeout(timer);
      timers = [];
      for (const actuator of actuators()) actuator.reset?.()?.catch?.(() => {});
    }
    function play(strength) {
      stop();
      const targets = actuators();
      if (!targets.length) return false;
      for (const { at, duration, magnitude } of segments(pattern(strength))) {
        timers.push(setTimeout(() => {
          for (const actuator of targets)
            actuator.playEffect('dual-rumble', { duration, strongMagnitude: magnitude, weakMagnitude: magnitude })?.catch?.(() => {});
        }, at));
      }
      return true;
    }
    return { play, stop };
  }

  const api = { pattern, segments, createPreview };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.smsRumble = api;
})(typeof globalThis === 'object' ? globalThis : this);
