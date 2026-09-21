import './select-menu.css';

/** Keep the existing select/change contract while presenting a game-owned picker. */
export function enhanceSelect(select, label) {
  const abort = new AbortController();
  const on = (node, type, handler) =>
    node.addEventListener(type, handler, { signal: abort.signal });
  const wrapper = document.createElement('span');
  wrapper.className = 'game-select';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'game-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const value = document.createElement('span');
  trigger.append(value);
  const list = document.createElement('div');
  list.id = `${select.id}-choices`;
  list.className = 'game-select-list';
  list.setAttribute('popover', 'auto');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label);
  trigger.setAttribute('aria-controls', list.id);
  select.before(wrapper);
  wrapper.append(select, trigger, list);
  const wasHidden = select.hidden;
  select.hidden = true;
  let rows = [],
    active = -1,
    search = '',
    searchAt = 0;
  const isOpen = () => list.matches(':popover-open');
  function sync() {
    value.textContent = select.selectedOptions[0]?.label ?? label;
    trigger.disabled = select.disabled;
    rows.forEach(({ option, row }) => row.setAttribute('aria-selected', String(option.selected)));
  }
  function highlight(index) {
    active = index;
    rows.forEach(({ row }, i) => row.classList.toggle('is-active', i === active));
    const row = rows[active]?.row;
    if (row) {
      trigger.setAttribute('aria-activedescendant', row.id);
      const top = row.offsetTop - list.clientTop;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + row.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = top + row.offsetHeight - list.clientHeight;
    }
  }
  function close() {
    if (isOpen()) list.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
  }
  function choose(index) {
    const option = rows[index]?.option;
    if (!option || option.disabled || option.parentElement.disabled) return;
    select.value = option.value;
    sync();
    close();
    trigger.focus({ preventScroll: true });
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function position() {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 240), innerWidth - 24);
    const above = rect.top - 16,
      below = innerHeight - rect.bottom - 16;
    const up = below < 260 && above > below;
    list.style.width = `${width}px`;
    list.style.maxHeight = `${Math.min(340, Math.max(80, up ? above : below))}px`;
    list.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
    list.style.top = `${up ? rect.top - list.offsetHeight - 8 : rect.bottom + 8}px`;
  }
  function open() {
    if (trigger.disabled) return;
    list.replaceChildren();
    rows = [];
    let previousGroup;
    for (const option of select.options) {
      if (option.hidden) continue;
      const group = option.parentElement.tagName === 'OPTGROUP' ? option.parentElement : null;
      if (group && group !== previousGroup) {
        const heading = document.createElement('div');
        heading.className = 'game-select-group';
        heading.textContent = group.label;
        heading.setAttribute('role', 'presentation');
        list.append(heading);
      }
      previousGroup = group;
      const row = document.createElement('div');
      row.id = `${list.id}-${rows.length}`;
      row.className = 'game-select-option';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-disabled', String(option.disabled || Boolean(group?.disabled)));
      row.textContent = option.label;
      const check = document.createElement('span');
      check.className = 'game-select-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      row.append(check);
      list.append(row);
      rows.push({ option, row });
    }
    sync();
    list.showPopover();
    position();
    trigger.setAttribute('aria-expanded', 'true');
    highlight(
      Math.max(
        0,
        rows.findIndex(({ option }) => option.selected),
      ),
    );
  }
  on(trigger, 'click', () => (isOpen() ? close() : open()));
  on(list, 'pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.target.closest('[role="option"]'))
      event.preventDefault();
  });
  on(list, 'click', (event) => {
    const index = rows.findIndex(({ row }) => row === event.target.closest('[role="option"]'));
    if (index >= 0) choose(index);
  });
  on(trigger, 'keydown', (event) => {
    // Camera letters and arrows belong to this picker, not the train controls.
    event.stopPropagation();
    if (event.key === 'Tab') return close();
    if (event.key === 'Escape') {
      if (isOpen()) {
        event.preventDefault();
        close();
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      return isOpen() ? choose(active) : open();
    }
    const arrows = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (
      !arrows.includes(event.key) &&
      (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey)
    )
      return;
    event.preventDefault();
    if (!isOpen()) open();
    const enabled = rows
      .map(({ row }, index) => (row.getAttribute('aria-disabled') === 'true' ? -1 : index))
      .filter((index) => index >= 0);
    if (!enabled.length) return;
    if (arrows.includes(event.key)) {
      const index = enabled.indexOf(active);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? enabled.length - 1
            : Math.max(
                0,
                Math.min(enabled.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
              );
      highlight(enabled[next]);
    } else {
      const now = performance.now();
      search = now - searchAt > 700 ? event.key : search + event.key;
      searchAt = now;
      const match = enabled.find((index) =>
        rows[index].option.label.toLowerCase().startsWith(search.toLowerCase()),
      );
      if (match !== undefined) highlight(match);
    }
  });
  on(document, 'focusin', (event) => {
    if (event.target !== trigger && !list.contains(event.target)) close();
  });
  on(list, 'toggle', () => {
    if (!isOpen()) close();
  });
  on(select, 'change', sync);
  on(window, 'resize', close);
  const dialog = select.closest('dialog');
  if (dialog) on(dialog, 'close', close);
  sync();
  return {
    sync,
    close,
    dispose() {
      close();
      abort.abort();
      wrapper.before(select);
      select.hidden = wasHidden;
      wrapper.remove();
    },
  };
}
