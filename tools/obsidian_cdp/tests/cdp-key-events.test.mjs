import assert from 'node:assert/strict';
import test from 'node:test';
import {pressKey} from '../cdp.mjs';

test('Ctrl+A selects text without inserting a character', async () => {
  const events=[];
  await pressKey(async (method,params)=>events.push({method,...params}),'A',{modifiers:2});
  assert.deepEqual(events.map(e=>e.type),['rawKeyDown','keyUp']);
  assert.ok(events.every(e=>e.modifiers===2&&e.code==='KeyA'));
});

test('an ordinary letter still emits its character between down and up', async () => {
  const events=[];
  await pressKey(async (method,params)=>events.push({method,...params}),'N');
  assert.deepEqual(events.map(e=>e.type),['rawKeyDown','char','keyUp']);
  assert.equal(events[1].text,'N');
});
