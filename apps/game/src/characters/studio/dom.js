/** Tiny DOM helpers for the studio panels. */
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'text') node.textContent = value;
    else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** A collapsible panel section. */
export function section(title, { open = false, id } = {}, ...content) {
  const body = h('div', { class: 'body' }, ...content);
  return h('details', { open, id }, h('summary', {}, title), body);
}

/**
 * A labelled slider with a live value. `onInput(value)`; returns { row, input, set(value) }.
 */
export function slider(label, { min, max, step, value, digits = 2, onInput, unit = '' }) {
  const input = h('input', { type: 'range', min, max, step, value });
  const out = h('output', {}, Number(value).toFixed(digits) + unit);
  input.addEventListener('input', () => {
    out.textContent = Number(input.value).toFixed(digits) + unit;
    onInput?.(Number(input.value));
  });
  const row = [h('span', { class: 'dim' }, label), input, out];
  return {
    row,
    input,
    set(next) {
      input.value = next;
      out.textContent = Number(next).toFixed(digits) + unit;
    },
  };
}

export function checkbox(label, checked, onChange, title) {
  const input = h('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { title }, input, label);
}

export function select(options, value, onChange) {
  const node = h(
    'select',
    {},
    options.map((option) => {
      const [v, text] = Array.isArray(option) ? option : [option, option];
      return h('option', { value: v, selected: v === value }, text);
    }),
  );
  node.addEventListener('change', () => onChange(node.value));
  return node;
}

export function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : '–';
}
