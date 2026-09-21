import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameStore } from '../src/state/game-store.js';
import {
  currentNotebookPage,
  describeRecordedTask,
  latestConversationMemory,
} from '../src/narrative/story-notebook.js';

// A small DOM boundary exercises the actual panel without audio, CSS loading or a browser.
function mountFixture({ onDeliveryAction, onTask, narrationEnabled = false } = {}) {
  let document;
  class Node {
    constructor(tag, text = '') {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.dataset = {};
      this.attributes = {};
      this.listeners = {};
      this.className = '';
      this.textContent = text;
      this.hidden = false;
      this.disabled = false;
      this.classList = {
        add: (...names) => {
          this.className = [...new Set([...this.className.split(' '), ...names])].join(' ');
        },
        remove: (...names) => {
          this.className = this.className
            .split(' ')
            .filter((name) => !names.includes(name))
            .join(' ');
        },
        toggle: (name, enabled) =>
          enabled ? this.classList.add(name) : this.classList.remove(name),
      };
    }
    append(...nodes) {
      nodes.forEach((node) => {
        node.parent = this;
        this.children.push(node);
      });
    }
    replaceChildren(...nodes) {
      this.children.forEach((node) => {
        node.parent = null;
      });
      this.children = [];
      this.append(...nodes);
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    removeAttribute(name) {
      delete this.attributes[name];
    }
    addEventListener(name, handler) {
      (this.listeners[name] ??= []).push(handler);
    }
    removeEventListener(name, handler) {
      this.listeners[name] = (this.listeners[name] ?? []).filter((item) => item !== handler);
    }
    querySelector(selector) {
      return (
        this.all().find(
          (node) =>
            selector.startsWith('.') && node.className.split(' ').includes(selector.slice(1)),
        ) ?? null
      );
    }
    all() {
      return this.children.flatMap((node) => [node, ...node.all()]);
    }
    focus() {
      document.activeElement = this;
    }
    get childElementCount() {
      return this.children.length;
    }
    get isConnected() {
      return Boolean(this.parent);
    }
    getBoundingClientRect() {
      return { height: 350, top: 0, left: 0, right: 1280, bottom: 800 };
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this);
      this.parent = null;
    }
    async click() {
      if (!this.disabled)
        await Promise.all((this.listeners.click ?? []).map((handler) => handler({ target: this })));
    }
  }
  const body = new Node('body');
  document = {
    body,
    activeElement: null,
    createElement: (tag) => new Node(tag),
    querySelector: (selector) => body.querySelector(selector),
    addEventListener() {},
    removeEventListener() {},
  };
  const gameStore = createGameStore();
  gameStore.setPreferences({ narrationEnabled });
  let state = {
    enabled: true,
    status: 'dialogue',
    title: 'Story',
    chapter: { title: 'Home' },
    progress: { completed: 2, total: 18, completedChapterIds: [] },
    hasSave: true,
    canContinue: false,
    activeBeat: {
      id: 'momiji-bread',
      title: 'Third crate',
      speaker: 'Nao',
      phase: 'dialogue',
      displayLines: ['The clinic crate is waiting.'],
      choices: [{ id: 'reply', label: 'Ask Nao' }],
      task: {
        id: 'plan-clinic-delivery',
        kind: 'delivery-plan',
        title: 'Nao’s third crate',
        actionLabel: 'Inspect the clinic label',
        required: true,
        completed: false,
        delivery: { inspected: false, proposal: null },
      },
    },
  };
  const listeners = new Set();
  let advances = 0;
  const engine = {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    advance() {
      advances++;
    },
  };
  const setState = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  };
  const respond = () =>
    setState({ activeBeat: { ...state.activeBeat, phase: 'response', selectedChoice: 'reply' } });
  const setTask = (patch, canContinue = false) =>
    setState({
      canContinue,
      activeBeat: { ...state.activeBeat, task: { ...state.activeBeat.task, ...patch } },
    });
  let spoken = 0;
  const source = readFileSync(new URL('../src/narrative/story-panel.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export function mountStoryPanel', 'function mountStoryPanel');
  const load = new Function(
    'document',
    'window',
    'Option',
    'fetch',
    'createNarrationPlayer',
    'scoreStoryBeat',
    'upcomingStoryVoice',
    'currentNotebookPage',
    'describeRecordedTask',
    'latestConversationMemory',
    'enhanceSelect',
    `${source}\nreturn mountStoryPanel;`,
  );
  const mount = load(
    document,
    { matchMedia: () => ({ matches: true }) },
    class extends Node {
      constructor(text, value) {
        super('option', text);
        this.value = value;
      }
    },
    () => Promise.resolve({ ok: false }),
    () => ({
      cancel() {},
      prepare() {},
      dispose() {},
      speak() {
        spoken++;
      },
    }),
    () => [],
    () => [],
    currentNotebookPage,
    describeRecordedTask,
    latestConversationMemory,
    () => ({ sync() {}, dispose() {} }),
  );
  const panel = mount({ engine, gameStore, onDeliveryAction, onTask });
  const find = (name) => body.querySelector(`.${name}`);
  return {
    panel,
    find,
    document,
    respond,
    setTask,
    setState,
    getState: () => state,
    advances: () => advances,
    spoken: () => spoken,
  };
}

test('delivery inspection waits for the reply, reveals two real buttons, then keeps the proposal pending', async () => {
  const actions = [];
  const fixture = mountFixture({
    narrationEnabled: true,
    onDeliveryAction: async (action) => {
      actions.push(action);
      if (action === 'inspect') fixture.setTask({ delivery: { inspected: true, proposal: null } });
      else
        fixture.setTask({ completed: true, delivery: { inspected: true, proposal: action } }, true);
      return { ok: true };
    },
  });
  try {
    assert.equal(fixture.find('ml-story-task').hidden, true);
    fixture.respond();
    const inspect = fixture.find('ml-story-task').children[0];
    assert.equal(inspect.textContent, 'Inspect the clinic label');
    assert.equal(fixture.find('ml-story-continue').disabled, true);
    await inspect.click();
    assert.equal(fixture.find('ml-story-delivery-label').hidden, false);
    assert.match(
      fixture.find('ml-story-delivery-label').textContent,
      /Clinic kiosk.*nearly an hour late/,
    );
    const options = fixture.find('ml-story-delivery-options').children;
    assert.deepEqual(
      options.map((button) => [button.tagName, button.type, button.textContent]),
      [
        ['BUTTON', 'button', 'Ask clinic about 10:00'],
        ['BUTTON', 'button', 'Ask about the shared van'],
      ],
    );
    assert.equal(fixture.document.activeElement, options[0]);
    assert.match(
      fixture.find('ml-story-delivery-note').textContent,
      /Both options need confirmation.*stay with Nao/,
    );
    await options[0].click();
    assert.deepEqual(actions, ['inspect', 'later-clinic']);
    assert.equal(fixture.find('ml-story-delivery-options').hidden, true);
    assert.match(
      fixture.find('ml-story-delivery-outcome').textContent,
      /10:00.*pending.*stays with Nao/,
    );
    assert.equal(fixture.find('ml-story-continue').disabled, false);
    assert.equal(fixture.document.activeElement, fixture.find('ml-story-continue'));
    assert.equal(
      fixture.spoken(),
      2,
      'only the initial dialogue and reply are narrated, never task updates',
    );
  } finally {
    fixture.panel.dispose();
  }
});

test('shared van is a distinct pending proposal and rejected actions permit retry', async () => {
  let attempt = 0;
  const fixture = mountFixture({
    onDeliveryAction: async (action) => {
      if (!attempt++) return { ok: false, message: 'Wait for Nao to finish the label.' };
      if (action === 'inspect') fixture.setTask({ delivery: { inspected: true, proposal: null } });
      else
        fixture.setTask({ completed: true, delivery: { inspected: true, proposal: action } }, true);
      return { ok: true };
    },
  });
  try {
    fixture.respond();
    const inspect = fixture.find('ml-story-task').children[0];
    await inspect.click();
    assert.match(fixture.find('ml-story-task-status').textContent, /Wait for Nao/);
    assert.equal(inspect.disabled, false);
    await inspect.click();
    await fixture.find('ml-story-delivery-options').children[1].click();
    assert.match(fixture.find('ml-story-delivery-outcome').textContent, /shared van.*pending/);
    assert.equal(fixture.find('ml-story-task-status').textContent, '');
  } finally {
    fixture.panel.dispose();
  }
});

test('pending actions disable repeat submission and legacy tasks retain their action handler', async () => {
  let resolve;
  let calls = 0;
  const legacy = [];
  const fixture = mountFixture({
    onDeliveryAction: () => {
      calls++;
      return new Promise((done) => {
        resolve = done;
      });
    },
    onTask: (id) => {
      legacy.push(id);
      return { ok: true };
    },
  });
  try {
    fixture.respond();
    const inspect = fixture.find('ml-story-task').children[0];
    const pending = inspect.click();
    await inspect.click();
    assert.equal(calls, 1);
    assert.equal(inspect.disabled, true);
    resolve({ ok: true });
    await pending;
    fixture.setState({
      activeBeat: {
        ...fixture.getState().activeBeat,
        id: 'aonuma-fumi',
        task: {
          id: 'return-spanner',
          title: 'Fumi’s spanner',
          actionLabel: 'Return the spanner',
          required: true,
          completed: false,
        },
      },
    });
    assert.equal(fixture.find('ml-story-delivery').hidden, true);
    assert.equal(inspect.hidden, false);
    assert.equal(inspect.textContent, 'Return the spanner');
    await inspect.click();
    assert.deepEqual(legacy, ['return-spanner']);
    assert.equal(fixture.advances(), 0);
  } finally {
    fixture.panel.dispose();
  }
});
