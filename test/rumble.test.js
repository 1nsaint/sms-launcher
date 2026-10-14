'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pattern, segments, createPreview } = require('../src/rumble');

const LIGHT = [{ power: 0.4, frames: 10 }];
const onFrames = frames => frames.filter(Boolean).length;

test('a light rumble runs the motor on its share of frames, as the game does', () => {
  assert.deepEqual(pattern(100, LIGHT), [0, 0, 1, 0, 1, 0, 0, 1, 0, 1]);
  assert.deepEqual(pattern(100, [{ power: 1, frames: 3 }]), [1, 1, 1]);
});

test('below 100% the motor is gentler; above it runs on more frames, up to every one', () => {
  assert.deepEqual(pattern(50, LIGHT), pattern(100, LIGHT).map(value => value / 2));
  assert.equal(onFrames(pattern(150, LIGHT)), 6);
  assert.deepEqual(pattern(200, [{ power: 0.5, frames: 4 }]), [1, 1, 1, 1]);
  assert.equal(Math.max(...pattern(200, LIGHT)), 1);
  assert.equal(onFrames(pattern(0)), 0);
  assert.deepEqual(pattern(900, LIGHT), pattern(200, LIGHT));
});

test('the pattern becomes timed runs, leaving out the motor off', () => {
  assert.deepEqual(segments([1, 1, 0, 0.5]), [
    { at: 0, duration: 67, magnitude: 1 },
    { at: 100, duration: 33, magnitude: 0.5 }
  ]);
});

test('the preview plays on every controller with motors and replaces the last one', () => {
  const played = [], resets = [], timers = new Map();
  let next = 0;
  const actuator = name => ({
    playEffect: (type, effect) => { played.push([name, type, effect]); return Promise.resolve('complete'); },
    reset: () => { resets.push(name); return Promise.resolve('complete'); }
  });
  const pads = [{ connected: true, vibrationActuator: actuator('xbox') }, null, { connected: true }];
  const preview = createPreview({
    getGamepads: () => pads,
    setTimeout: (fn, ms) => { timers.set(++next, { fn, ms }); return next; },
    clearTimeout: id => timers.delete(id)
  });
  assert.equal(preview.play(100), true);
  const first = timers.size;
  assert.ok(first > 1);
  preview.play(200);
  assert.deepEqual(resets, ['xbox', 'xbox']);
  for (const { fn } of timers.values()) fn();
  assert.ok(played.every(([name, type]) => name === 'xbox' && type === 'dual-rumble'));
  assert.equal(played.reduce((sum, [, , effect]) => sum + effect.duration, 0), segments(pattern(200)).reduce((sum, run) => sum + run.duration, 0));
  assert.equal(createPreview({ getGamepads: () => [] }).play(100), false);
});
