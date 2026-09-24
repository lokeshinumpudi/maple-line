import './story-panel.css';
import { enhanceSelect } from '../ui/select-menu.js';
import { createNarrationPlayer } from './narration-player.js';
import { scoreStoryBeat, upcomingStoryVoice } from './story-voice.js';
import {
  currentNotebookPage,
  describeRecordedTask,
  latestConversationMemory,
} from './story-notebook.js';

/** UI only: the host owns the train, and travel happens only after a button click. */
export function mountStoryPanel({
  fetchDirector = fetch,
  engine,
  gameStore,
  onStart,
  onResume,
  onTravel,
  onExit,
  onTask,
  onDeliveryAction,
}) {
  if (!engine?.getState || !engine?.subscribe) throw new TypeError('A story engine is required.');
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text, className, handler) => {
    const node = element('button', className, text);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  };
  const artworkUrl = './story/haru-emi.png';
  const staticPreview = ['static', 'signal'].includes(document.documentElement?.dataset.hosting);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const root = element('div', 'ml-story-root');
  root.dataset.component = 'harus-notebook';
  document.body.append(root);
  const entry = button('Haru’s notebook', 'ml-story-launch', () => {
    if (engine.getState().enabled) openJournal();
    else openWelcome();
  });
  entry.setAttribute('aria-haspopup', 'dialog');
  entry.title = 'A railway journey with Haru and Emi';
  const entryHost = document.querySelector('.simple-header-actions');
  if (!entryHost) entry.classList.add('ml-story-launch-floating');
  (entryHost ?? document.body).append(entry);
  entry.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') event.stopPropagation();
  });

  const welcomeEntry = button('Begin Haru’s story', 'ml-story-welcome-entry', openWelcome);
  welcomeEntry.id = 'start-story';
  welcomeEntry.setAttribute('aria-haspopup', 'dialog');
  welcomeEntry.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') event.stopPropagation();
  });
  document.querySelector('.welcome-actions')?.append(welcomeEntry);

  let disposed = false;
  let beginVersion = 0;
  let requestedPending = false;
  let presentationPending = false;
  let pendingTimer;

  let lastSignature = '';
  let lastSpeechKey = '';
  let previousStatus = null;
  let previousChoice = null;
  let previousFocus = null;
  let currentDialog = null;
  let narrationStatus = 'idle';
  let narrator;
  function cancelSpeech() {
    narrator?.cancel();
  }
  function speak(beat) {
    if (staticPreview) return;
    cancelSpeech();
    const preferences = gameStore.getState().preferences;
    if (
      !preferences.narrationEnabled ||
      !beat?.displayLines?.length ||
      currentDialog ||
      gameStore.getState().presentation.menuOpen ||
      gameStore.getState().presentation.sceneViewBeatId === beat.id
    )
      return;
    void narrator.speak(
      scoreStoryBeat(beat, beat.selectedChoice, beat.displayLines),
      preferences.narrationLanguage,
    );
    prepareSpeech(engine.getState());
  }
  function prepareSpeech(state) {
    if (staticPreview) return;
    const preferences = gameStore.getState().preferences;
    if (!preferences.narrationEnabled || currentDialog || !state.enabled) return;
    narrator.prepare(upcomingStoryVoice(state), preferences.narrationLanguage);
  }
  function closeDialog() {
    cancelSpeech();
    if (!currentDialog) return;
    const closed = currentDialog;
    currentDialog = null;
    if (typeof closed.close === 'function') closed.close();
    else closed.removeAttribute('open');
    closed.hidden = true;
    const previousVisible =
      previousFocus?.isConnected &&
      !previousFocus.closest('[hidden]') &&
      previousFocus.getClientRects().length > 0;
    if (previousVisible) previousFocus.focus({ preventScroll: true });
    else if (!card.hidden) heading.focus({ preventScroll: true });
    else entry.focus({ preventScroll: true });
  }
  function openDialog(dialog) {
    if (currentDialog === dialog) {
      dialog.querySelector('[data-initial-focus]')?.focus({ preventScroll: true });
      return;
    }
    if (currentDialog) closeDialog();
    previousFocus = document.activeElement;
    currentDialog = dialog;
    cancelSpeech();
    dialog.hidden = false;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector('[data-initial-focus]')?.focus({ preventScroll: true });
  }
  function makeDialog(name) {
    const dialog = element('dialog', 'ml-story-dialog');
    dialog.setAttribute('aria-label', name);
    dialog.hidden = true;
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDialog();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        closeDialog();
    });
    root.append(dialog);
    return dialog;
  }
  const welcome = makeDialog('Begin Haru’s notebook');
  welcome.classList.add('ml-story-illustrated-welcome');
  const journal = makeDialog('Haru’s notebook and collected memories');
  const characterStudy = makeDialog('Haru and Emi, a character study');
  characterStudy.classList.add('ml-story-character-study');
  const settling = element('div', 'ml-story-settling', 'A moment with Haru and Emi…');
  settling.setAttribute('role', 'status');
  settling.setAttribute('aria-live', 'polite');
  settling.hidden = true;
  root.append(settling);
  const card = element('section', 'ml-story-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-label', 'Haru and Emi’s conversation');
  card.hidden = true;
  root.append(card);
  const cardHead = element('div', 'ml-story-card-head');
  const chapterLabel = element('span', 'ml-story-kicker');
  const cardTools = element('div', 'ml-story-card-tools');
  const voice = button('Read aloud', 'ml-story-text-button', () => {
    const enabled = !gameStore.getState().preferences.narrationEnabled;
    gameStore.setPreferences({ narrationEnabled: enabled });
    syncVoice();
    if (enabled) speak(engine.getState().activeBeat);
    else cancelSpeech();
  });
  voice.title = 'Read this story with Sarvam voice';
  if (staticPreview) {
    voice.disabled = true;
    voice.textContent = 'Text edition';
    voice.title = 'Recorded narration is not included in this hosted preview';
  }
  const voiceNote = element('span', 'ml-story-voice-note');
  voiceNote.setAttribute('role', 'status');
  const language = element('select', 'ml-story-language');
  language.id = 'story-language';
  let languagePicker;
  language.setAttribute('aria-label', 'Narration language');
  language.append(new Option('English', 'en-IN'));
  const languageAbort = new AbortController();
  (staticPreview
    ? Promise.reject()
    : fetchDirector('/api/director/narration/status', { signal: languageAbort.signal })
  )
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((status) => {
      if (disposed) return;
      language.replaceChildren(
        ...status.languages.map((item) => new Option(item.label, item.code)),
      );
      for (const label of ['Japanese', 'Urdu']) {
        const option = new Option(`${label} · unavailable in Sarvam`, '');
        option.disabled = true;
        language.append(option);
      }
      language.value = gameStore.getState().preferences.narrationLanguage;
      languagePicker?.sync();
    })
    .catch(() => {
      if (!disposed) language.title = 'Narration server is offline';
    });
  language.addEventListener('change', () => {
    gameStore.setPreferences({ narrationLanguage: language.value });
    speak(engine.getState().activeBeat);
  });
  const replay = button('Play narration', 'ml-story-text-button', () => {
    if (narrationStatus === 'blocked') void narrator.resume();
    else speak(engine.getState().activeBeat);
  });
  replay.hidden = true;
  const audio = element('audio');
  audio.hidden = true;
  audio.dataset.source = 'sarvam';
  root.append(audio);
  narrator = createNarrationPlayer({
    fetchImpl: fetchDirector,
    audio,
    onState: ({ status, message, cue }) => {
      for (const [index, line] of Array.from(lines.children).entries()) {
        line.classList.toggle('is-speaking', status === 'playing' && cue?.lineIndex === index);
      }
      if (status === 'playing') card.dataset.speaker = cue?.character ?? 'narrator';
      // The stage's figures move their mouths for quoted lines (narrative/story-crowd.js).
      window.dispatchEvent(
        new CustomEvent('maple:story-voice', {
          detail: { status, character: cue?.character ?? null, quoted: Boolean(cue?.quoted), text: cue?.text ?? '' },
        }),
      );
      narrationStatus = status;
      voiceNote.textContent = message;
      replay.hidden =
        !['idle', 'blocked', 'error', 'ended'].includes(status) ||
        !gameStore.getState().preferences.narrationEnabled;
      replay.textContent = ['idle', 'blocked'].includes(status)
        ? 'Play narration'
        : status === 'error'
          ? 'Retry narration'
          : 'Listen again';
    },
  });
  function syncVoice() {
    if (staticPreview) {
      language.disabled = true;
      languagePicker?.sync();
      return;
    }
    const enabled = gameStore.getState().preferences.narrationEnabled;
    voice.setAttribute('aria-pressed', String(enabled));
    voice.textContent = enabled ? 'Voice on' : 'Read aloud';
    voiceNote.hidden = !enabled;
    language.value = gameStore.getState().preferences.narrationLanguage;
    languagePicker?.sync();
  }
  syncVoice();
  const journalButton = button('Notebook', 'ml-story-text-button', openJournal);
  const sceneButton = button('Take in the view', 'ml-story-text-button', () => {
    const beat = engine.getState().activeBeat;
    if (!beat || presentationPending) return;
    cancelSpeech();
    gameStore.updatePresentation({ sceneViewBeatId: beat.id });
    returnToConversation.focus({ preventScroll: true });
  });
  sceneButton.setAttribute('aria-controls', 'story-conversation');
  const sceneView = element('section', 'ml-story-scene-view');
  sceneView.setAttribute('aria-label', 'Taking in the view');
  sceneView.hidden = true;
  const sceneNote = element('span', 'ml-story-scene-note');
  const returnToConversation = button('Return to conversation', 'ml-story-primary', () => {
    gameStore.updatePresentation({ sceneViewBeatId: null });
    heading.focus({ preventScroll: true });
  });
  sceneView.append(sceneNote, returnToConversation);
  root.append(sceneView);
  card.id = 'story-conversation';
  const exitButton = button('×', 'ml-story-close', exitStory);
  exitButton.setAttribute('aria-label', 'Close the story and return to the railway');
  exitButton.title = 'Return to the railway · Escape';
  cardTools.append(language, voice, replay, sceneButton, journalButton, exitButton);
  languagePicker = enhanceSelect(language, 'Narration language');
  cardHead.append(chapterLabel, cardTools);
  cardHead.append(voiceNote);
  const speaker = element('p', 'ml-story-speaker');
  const heading = element('h2', 'ml-story-beat-title');
  heading.tabIndex = -1;
  const lines = element('div', 'ml-story-lines');
  lines.setAttribute('aria-live', 'polite');
  lines.setAttribute('aria-atomic', 'true');
  const choices = element('div', 'ml-story-choices');
  choices.setAttribute('aria-label', 'Choose a reply');
  const wildlife = element('details', 'ml-story-wildlife');
  let wildlifeBeat = null;
  const cardFoot = element('div', 'ml-story-card-foot');
  const progressText = element('span', 'ml-story-progress-text');
  const continueButton = button('Continue →', 'ml-story-primary ml-story-continue', () => {
    cancelSpeech();
    engine.advance();
  });
  cardFoot.append(progressText, continueButton);
  const dialogueBody = element('div', 'ml-story-dialogue-body');
  const portraits = element('div', 'ml-story-portraits');
  const haruPortrait = element('span', 'ml-story-portrait ml-story-portrait-haru');
  haruPortrait.setAttribute('role', 'img');
  haruPortrait.setAttribute('aria-label', 'Haru Morita, in his railway cap');
  const emiPortrait = element('span', 'ml-story-portrait ml-story-portrait-emi');
  emiPortrait.setAttribute('role', 'img');
  emiPortrait.setAttribute('aria-label', 'Emi, Haru’s granddaughter');
  portraits.append(haruPortrait, emiPortrait);
  let deliveryPending = false;
  let taskIdentity = null;
  const taskCard = element('div', 'ml-story-task');
  const taskMessage = element('p', 'ml-story-task-status');
  taskMessage.setAttribute('role', 'status');
  const taskButton = button('Complete task', 'ml-story-primary', async () => {
    const task = engine.getState().activeBeat?.task;
    if (task?.kind === 'delivery-plan') {
      await runDeliveryAction('inspect');
      return;
    }
    if (!task || task.completed || typeof onTask !== 'function') return;
    taskButton.disabled = true;
    try {
      const result = await onTask(task.id);
      taskMessage.textContent =
        result?.ok === false ? (result.message ?? 'This task is not available here yet.') : '';
    } catch {
      taskMessage.textContent = 'The task could not be completed. Please try again.';
    } finally {
      if (!disposed) {
        taskButton.disabled =
          typeof onTask !== 'function' || Boolean(engine.getState().activeBeat?.task?.completed);
      }
    }
  });
  const deliveryCard = element('section', 'ml-story-delivery');
  deliveryCard.setAttribute('aria-label', 'Plan the clinic delivery');
  const deliveryTitle = element('h3', 'ml-story-delivery-title', 'Nao’s third crate');
  const deliveryLabel = element('p', 'ml-story-delivery-label');
  deliveryLabel.id = 'story-clinic-label';
  const deliveryOptions = element('div', 'ml-story-delivery-options');
  const clinicOption = button('Ask clinic about 10:00', 'ml-story-choice', () =>
    runDeliveryAction('later-clinic'),
  );
  const vanOption = button('Ask about the shared van', 'ml-story-choice', () =>
    runDeliveryAction('shared-van'),
  );
  for (const option of [clinicOption, vanOption])
    option.setAttribute('aria-describedby', 'story-delivery-note');
  deliveryOptions.append(clinicOption, vanOption);
  const deliveryNote = element(
    'p',
    'ml-story-delivery-note',
    'Both options need confirmation. The crate will stay with Nao.',
  );
  deliveryNote.id = 'story-delivery-note';
  const deliveryOutcome = element('p', 'ml-story-delivery-outcome');
  deliveryOutcome.setAttribute('role', 'status');
  deliveryOutcome.setAttribute('aria-live', 'polite');
  deliveryCard.append(deliveryTitle, deliveryLabel, deliveryOptions, deliveryNote, deliveryOutcome);
  deliveryCard.hidden = true;
  taskCard.append(taskButton, deliveryCard, taskMessage);

  async function runDeliveryAction(action) {
    const beat = engine.getState().activeBeat;
    const task = beat?.task;
    if (
      disposed ||
      deliveryPending ||
      task?.kind !== 'delivery-plan' ||
      task.completed ||
      typeof onDeliveryAction !== 'function'
    )
      return;
    if (beat.choices?.length && !beat.selectedChoice) return;
    if (action !== 'inspect' && !task.delivery?.inspected) return;
    const identity = `${beat.id}:${task.id}`;
    deliveryPending = true;
    taskMessage.textContent = '';
    render(engine.getState());
    try {
      const result = await onDeliveryAction(action);
      if (!disposed && taskIdentity === identity && result?.ok === false)
        taskMessage.textContent = result.message ?? 'That proposal is not available yet.';
    } catch {
      if (!disposed && taskIdentity === identity)
        taskMessage.textContent = 'The delivery plan could not be updated. Please try again.';
    } finally {
      deliveryPending = false;
      if (!disposed) {
        render(engine.getState());
        if (taskIdentity === identity && !card.hidden) {
          if (engine.getState().activeBeat?.task?.completed)
            continueButton.focus({ preventScroll: true });
          else if (engine.getState().activeBeat?.task?.delivery?.inspected)
            clinicOption.focus({ preventScroll: true });
          else taskButton.focus({ preventScroll: true });
        }
      }
    }
  }
  taskCard.hidden = true;
  const dialogueCopy = element('div', 'ml-story-dialogue-copy');
  dialogueCopy.append(speaker, heading, lines, choices, taskCard, wildlife);
  dialogueBody.append(portraits, dialogueCopy);
  card.append(cardHead, dialogueBody, cardFoot);
  const travel = element('section', 'ml-story-travel');
  travel.setAttribute('aria-label', 'Next story memory');
  travel.hidden = true;
  const travelTitle = element('p', 'ml-story-travel-title');
  const memoryReceipt = button('', 'ml-story-memory-receipt', openJournal);
  memoryReceipt.setAttribute('aria-haspopup', 'dialog');
  memoryReceipt.hidden = true;
  const travelButton = button('Continue to next memory →', 'ml-story-travel-button', () => {
    const destination = engine.nextDestination?.() ?? engine.getState().nextBeat;
    if (!destination || !Number.isFinite(destination.z)) return;
    cancelSpeech();
    closeDialog();
    onTravel?.(destination.z);
  });
  const travelClose = button('×', 'ml-story-close', exitStory);
  travelClose.setAttribute('aria-label', 'Leave the story and explore freely');
  travel.append(memoryReceipt, travelTitle, travelButton, travelClose);
  root.append(travel);
  const end = element('section', 'ml-story-ending');
  end.hidden = true;
  end.setAttribute('aria-label', 'The notebook is complete');
  end.append(
    element('span', 'ml-story-stamp', '旅'),
    element('span', 'ml-story-kicker', 'MEMORIES, KEPT'),
    element('h2', '', 'The line goes on.'),
    element(
      'p',
      '',
      'The notebook is yours to return to. There is still countryside beyond the window.',
    ),
  );
  const endingActions = element('div', 'ml-story-ending-actions');
  endingActions.append(
    button('Read the notebook', 'ml-story-primary', openJournal),
    button('Return to the railway', 'ml-story-text-button', exitStory),
  );
  end.append(endingActions);
  root.append(end);

  function exitStory() {
    beginVersion++;
    setPresentation({ pending: false });
    cancelSpeech();
    closeDialog();
    engine.suspend?.();
    onExit?.();
    entry.focus({ preventScroll: true });
  }
  async function begin(resume, reset = false) {
    const version = ++beginVersion;
    closeDialog();
    if (reset && typeof onStart !== 'function') engine.reset();
    try {
      const started = resume ? onResume?.() : onStart?.();
      if (started && typeof started.then === 'function') await started;
      if (!disposed && version === beginVersion) engine.start();
    } catch {
      if (disposed || version !== beginVersion) return;
      openWelcome();
      welcome
        .querySelector('.ml-story-welcome-copy')
        ?.append(
          element('p', 'ml-story-save-error', 'The story could not begin. Please try again.'),
        );
    }
  }
  function setPresentation({ pending = false } = {}) {
    if (disposed) return;
    const next =
      Boolean(pending) &&
      !reducedMotion?.matches &&
      engine.getState().activeBeat?.delivery !== 'rolling';
    if (requestedPending === next) return;
    requestedPending = next;
    presentationPending = next;
    if (next) lastSpeechKey = '';
    clearTimeout(pendingTimer);
    if (next)
      pendingTimer = setTimeout(() => {
        if (disposed || !presentationPending) return;
        presentationPending = false;
        lastSignature = '';
        render(engine.getState());
      }, 1500);
    lastSignature = '';
    render(engine.getState());
  }
  function openWelcome() {
    const state = engine.getState();
    welcome.replaceChildren();
    const artwork = element('img', 'ml-story-cover');
    artwork.src = artworkUrl;
    artwork.alt =
      'Haru and Emi share a station bench beside an autumn railway, his notebook resting in his hands.';
    artwork.decoding = 'async';
    artwork.draggable = false;
    const copy = element('div', 'ml-story-welcome-copy');
    const close = button('×', 'ml-story-close', closeDialog);
    close.setAttribute('aria-label', 'Close the notebook');
    const top = element('div', 'ml-story-welcome-top');
    top.append(element('span', 'ml-story-kicker', 'MAPLE LINE · A FAMILY JOURNEY'), close);
    const title = element('h2', 'ml-story-welcome-title', 'Haru’s notebook');
    const subtitle = element('p', 'ml-story-campaign-title', state.title);
    const description = element(
      'p',
      'ml-story-introduction',
      `Haru Morita, sixty, takes the valley line with his granddaughter Emi. Five chapters. ${state.progress.total} memories. Time to listen.`,
    );
    const stamp = element('span', 'ml-story-stamp', '旅');
    stamp.setAttribute('aria-hidden', 'true');
    const chapterMarks = element('div', 'ml-story-chapter-marks');
    chapterMarks.setAttribute(
      'aria-label',
      `${state.progress.completedChapterIds.length} of 5 chapters complete`,
    );
    for (let i = 0; i < 5; i++)
      chapterMarks.append(
        element(
          'span',
          i < state.progress.completedChapterIds.length ? 'is-complete' : '',
          String(i + 1).padStart(2, '0'),
        ),
      );
    const resume = Boolean(state.hasSave);
    const startButton = button(
      resume ? 'Resume story →' : 'Begin Haru’s story →',
      'ml-story-primary',
      () => begin(resume),
    );
    startButton.dataset.initialFocus = '';
    const note = element(
      'p',
      'ml-story-fine-print',
      state.progress.completed
        ? `${state.progress.completed} of ${state.progress.total} memories remembered. Progress stays on this device.`
        : 'Your choices and memories are saved on this device. Read at your own pace.',
    );
    copy.append(stamp, title, subtitle, description, chapterMarks, startButton, note);
    copy.append(
      button('View character study', 'ml-story-text-button ml-story-study-link', () =>
        openCharacterStudy(openWelcome),
      ),
    );
    welcome.append(artwork, top, copy);
    if (state.hasSave)
      copy.append(
        button('Start again', 'ml-story-text-button ml-story-restart', () => {
          const question = element(
            'p',
            'ml-story-restart-question',
            'Start again and replace the saved journey on this device?',
          );
          const actions = element('div', 'ml-story-ending-actions');
          actions.append(
            button('Start again', 'ml-story-primary', () => begin(false, true)),
            button('Keep my journey', 'ml-story-text-button', openWelcome),
          );
          copy.replaceChildren(title, question, actions);
          actions.querySelector('button')?.focus();
        }),
      );
    if (state.saveError) copy.append(element('p', 'ml-story-save-error', state.saveError));
    openDialog(welcome);
  }
  function openJournal() {
    const state = engine.getState();
    journal.replaceChildren();
    const head = element('div', 'ml-story-journal-head');
    const title = element('h2', '', 'Haru’s notebook');
    title.tabIndex = -1;
    title.dataset.initialFocus = '';
    const close = button('×', 'ml-story-close', closeDialog);
    close.setAttribute('aria-label', 'Close the notebook and return to the view');
    head.append(title, close);
    const progress = element(
      'p',
      'ml-story-journal-progress',
      `${state.progress.completed} / ${state.progress.total} memories · ${state.progress.completedChapterIds.length} / 5 chapters`,
    );
    const list = element('ol', 'ml-story-memory-list');
    state.memories.forEach((memory, index) => {
      const item = element('li', 'ml-story-ticket');
      const ticketNumber = element(
        'span',
        'ml-story-ticket-number',
        String(index + 1).padStart(2, '0'),
      );
      ticketNumber.setAttribute('aria-hidden', 'true');
      const content = element('div', 'ml-story-ticket-content');
      content.append(
        element('span', 'ml-story-kicker', memory.origin?.title ?? 'KEPT ALONG THE LINE'),
        element('h3', '', memory.title),
        element('p', '', memory.text),
      );
      if (memory.origin?.choiceLabel)
        content.append(
          element('p', 'ml-story-recorded-reply', `Your reply: “${memory.origin.choiceLabel}”`),
        );
      const action = describeRecordedTask(memory.origin?.completedTask);
      if (action) content.append(element('p', 'ml-story-recorded-action', action));
      item.append(ticketNumber, content);
      list.append(item);
    });
    journal.append(head, progress);
    const current = currentNotebookPage(state);
    if (current) {
      const page = element('section', 'ml-story-current-page');
      page.setAttribute('aria-label', 'Current conversation');
      page.append(
        element('span', 'ml-story-kicker', 'CURRENT PAGE'),
        element('h3', '', current.title),
      );
      if (current.reply) page.append(element('p', '', `Your reply: “${current.reply}”`));
      if (current.action) page.append(element('p', 'ml-story-recorded-action', current.action));
      page.append(
        element('p', '', current.prompt),
        button('Return to conversation', 'ml-story-text-button', () => {
          closeDialog();
          if (gameStore.getState().presentation.sceneViewBeatId)
            gameStore.updatePresentation({ sceneViewBeatId: null });
          if (!card.hidden) heading.focus({ preventScroll: true });
        }),
      );
      journal.append(page);
    }
    if (state.memories.length) journal.append(list);
    else
      journal.append(
        element(
          'p',
          'ml-story-empty',
          'The first page is still blank. A conversation will leave something here.',
        ),
      );
    if (state.saveError) journal.append(element('p', 'ml-story-save-error', state.saveError));
    journal.append(
      element(
        'p',
        'ml-story-fine-print',
        'These are the memories from your journey. They stay on this device.',
      ),
    );
    journal.append(
      button('View character study', 'ml-story-text-button ml-story-study-link', () =>
        openCharacterStudy(openJournal),
      ),
    );
    openDialog(journal);
  }
  function openCharacterStudy(onBack) {
    characterStudy.replaceChildren();
    const head = element('div', 'ml-story-journal-head');
    const title = element('h2', '', 'Two people. A lifetime of stories.');
    title.tabIndex = -1;
    title.dataset.initialFocus = '';
    const close = button('×', 'ml-story-close', closeDialog);
    close.setAttribute('aria-label', 'Close the character study');
    head.append(title, close);
    // The full reference sheet is requested only after the player opens it.
    const artwork = element('img', 'ml-story-study-image');
    artwork.src = './story/character-reference.png';
    artwork.alt =
      'Watercolor character study: Haru in his blue railway uniform and Emi in her rust-colored jacket, with their notebook, spanner, recorder, satchel, and tickets.';
    artwork.decoding = 'async';
    const caption = element(
      'p',
      'ml-story-study-caption',
      'Haru Morita, sixty, and his granddaughter Emi. The little things they carry become the things they remember.',
    );
    characterStudy.append(
      head,
      artwork,
      caption,
      button('← Back to notebook', 'ml-story-text-button', onBack),
    );
    openDialog(characterStudy);
  }
  function render(state) {
    if (disposed) return;
    const active = state.activeBeat;
    const sceneViewBeatId = gameStore.getState().presentation.sceneViewBeatId;
    if (sceneViewBeatId && (state.status !== 'dialogue' || sceneViewBeatId !== active?.id)) {
      gameStore.updatePresentation({ sceneViewBeatId: null });
      return;
    }
    const viewingScene = Boolean(sceneViewBeatId);
    const signature = [
      state.status,
      active?.id,
      active?.phase,
      active?.selectedChoice,
      JSON.stringify(active?.displayLines),
      active?.delivery,
      active?.task?.completed,
      JSON.stringify(active?.task?.delivery),
      deliveryPending,
      state.progress.completed,
      state.saveError,
      state.hasSave,
      presentationPending,
      viewingScene,
      state.wildlifeEncounter?.species,
      state.wildlifeEncounter?.available,
      state.wildlifeEncounter?.selectedAction,
    ].join('|');
    if (signature === lastSignature) return;
    lastSignature = signature;
    const inDialogue = state.status === 'dialogue' && Boolean(active);
    const rolling = inDialogue && active.delivery === 'rolling';
    document.body.classList.toggle('story-dialogue', inDialogue && !rolling);
    document.body.classList.toggle('story-rolling', rolling);
    const wasCardHidden = card.hidden;
    card.hidden = !inDialogue || presentationPending || viewingScene;
    settling.hidden = !inDialogue || !presentationPending || viewingScene;
    sceneView.hidden = !inDialogue || !viewingScene;
    sceneNote.textContent = rolling
      ? 'The conversation is kept. The train keeps moving.'
      : 'Take your time. The conversation is kept.';
    if (presentationPending) cancelSpeech();
    travel.hidden = state.status !== 'travelling';
    end.hidden = state.status !== 'complete';
    entry.classList.toggle('is-active', state.enabled);
    entry.setAttribute(
      'aria-label',
      `Haru’s notebook, ${state.progress.completed} of ${state.progress.total} memories`,
    );
    if (inDialogue) {
      chapterLabel.textContent = state.chapter?.title ?? state.chapter?.name ?? 'ALONG THE LINE';
      speaker.textContent = active.speaker ?? 'Haru & Emi';
      const speaking = speaker.textContent.toLowerCase();
      card.dataset.speaker =
        speaking.includes('emi') && !speaking.includes('haru')
          ? 'emi'
          : speaking.includes('haru') && !speaking.includes('emi')
            ? 'haru'
            : 'together';
      heading.textContent = active.title;
      lines.replaceChildren(...active.displayLines.map((line) => element('p', '', line)));
      choices.replaceChildren();
      if (active.choices?.length && !active.selectedChoice)
        for (const choice of active.choices)
          choices.append(
            button(choice.label, 'ml-story-choice', () => {
              cancelSpeech();
              engine.choose(choice.id);
            }),
          );
      choices.hidden = choices.childElementCount === 0;
      const encounter = state.wildlifeEncounter;
      wildlife.hidden = !encounter || (!encounter.available && !encounter.selectedAction);
      if (wildlifeBeat !== active.id) {
        wildlife.open = false;
        wildlifeBeat = active.id;
      }
      wildlife.replaceChildren();
      if (!wildlife.hidden) {
        wildlife.append(
          element(
            'summary',
            '',
            `${encounter.selectedAction ? 'Field note' : 'Nearby'} · ${encounter.speciesName}`,
          ),
        );
        const response = element('p', '', encounter.response ?? encounter.invitation);
        response.setAttribute('aria-live', 'polite');
        wildlife.append(response);
        if (!encounter.selectedAction && encounter.available) {
          const actions = element('div', 'ml-story-wildlife-actions');
          for (const action of encounter.actions)
            actions.append(
              button(action.label, 'ml-story-text-button', () => {
                cancelSpeech();
                if (engine.observeWildlife(action.id)) {
                  wildlife.querySelector('summary')?.focus({ preventScroll: true });
                }
              }),
            );
          wildlife.append(actions);
        } else wildlife.append(element('span', 'ml-story-fine-print', 'Kept in Haru’s notebook'));
      }
      const task = active.task;
      const taskReady =
        Boolean(task) && (!active.choices?.length || Boolean(active.selectedChoice));
      const taskBlocked = taskReady && task.required && !task.completed;
      taskCard.hidden = !taskReady;
      const nextTaskIdentity = task ? `${active.id}:${task.id}` : null;
      if (taskIdentity !== nextTaskIdentity) taskMessage.textContent = '';
      taskIdentity = nextTaskIdentity;
      const deliveryTask = taskReady && task.kind === 'delivery-plan';
      deliveryCard.hidden = !deliveryTask;
      taskButton.hidden = false;
      if (taskReady) {
        taskCard.setAttribute('aria-label', task.title ?? 'Station task');
        if (deliveryTask) {
          const inspected = Boolean(task.delivery?.inspected);
          deliveryTitle.textContent = task.title ?? 'Nao’s third crate';
          taskButton.textContent = task.actionLabel ?? 'Inspect the clinic label';
          taskButton.hidden = inspected || task.completed;
          taskButton.disabled = deliveryPending || typeof onDeliveryAction !== 'function';
          taskButton.setAttribute('aria-describedby', 'story-delivery-note');
          deliveryCard.setAttribute('aria-busy', String(deliveryPending));
          deliveryLabel.hidden = !inspected;
          deliveryLabel.textContent =
            'Destination: Clinic kiosk. Under the current winter draft, this crate arrives nearly an hour late.';
          deliveryOptions.hidden = !inspected || task.completed;
          for (const option of [clinicOption, vanOption])
            option.disabled = deliveryPending || typeof onDeliveryAction !== 'function';
          deliveryOutcome.hidden = !task.completed;
          deliveryOutcome.textContent = describeRecordedTask(task) ?? '';
        } else {
          taskButton.removeAttribute('aria-describedby');
          taskButton.textContent = task.completed
            ? 'Completed ✓'
            : (task.actionLabel ??
              (task.id === 'return-spanner'
                ? 'Return Fumi’s spanner'
                : 'Pin the corrected connection'));
          taskButton.disabled = task.completed || typeof onTask !== 'function';
        }
      }
      continueButton.hidden = !state.canContinue && !taskBlocked;
      continueButton.disabled = Boolean(taskBlocked);
      continueButton.title = taskBlocked ? 'Complete the station task to continue' : '';
      progressText.textContent = `${String(state.progress.completed + 1).padStart(2, '0')} / ${state.progress.total}`;
      const speechKey = JSON.stringify([
        active.id,
        active.phase,
        active.selectedChoice,
        active.displayLines,
      ]);
      if (!presentationPending && !viewingScene && speechKey !== lastSpeechKey) {
        lastSpeechKey = speechKey;
        speak(active);
      }
      if (
        !currentDialog &&
        !presentationPending &&
        !viewingScene &&
        (previousStatus !== 'dialogue' || wasCardHidden)
      )
        queueMicrotask(() => {
          if (!disposed && !card.hidden) heading.focus({ preventScroll: true });
        });
      else if (
        !currentDialog &&
        !presentationPending &&
        !viewingScene &&
        active.selectedChoice !== previousChoice &&
        state.canContinue
      )
        queueMicrotask(() => {
          if (!disposed && !continueButton.hidden) continueButton.focus({ preventScroll: true });
        });
    } else {
      cancelSpeech();
      if (state.status === 'travelling') {
        const memory = latestConversationMemory(state);
        memoryReceipt.hidden = !memory;
        memoryReceipt.textContent = memory ? `In your notebook · ${memory.title}` : '';
        if (previousStatus === 'dialogue' && !currentDialog)
          queueMicrotask(() => {
            if (!disposed && !travel.hidden)
              (memory ? memoryReceipt : travelButton).focus({ preventScroll: true });
          });
        travelTitle.textContent = `Next memory · ${state.nextBeat?.title ?? 'Along the line'}`;
        travelButton.disabled = !state.nextBeat || typeof onTravel !== 'function';
      }
    }
    prepareSpeech(state);
    previousStatus = state.status;
    previousChoice = active?.selectedChoice;
  }
  root.addEventListener('keydown', (event) => {
    // Story controls must not also trigger the train's global keyboard shortcuts.
    event.stopPropagation();
    if (event.key === 'Escape' && !currentDialog) {
      event.preventDefault();
      if (!sceneView.hidden) returnToConversation.click();
      else exitStory();
    }
  });
  const globalEscape = (event) => {
    if (
      event.key === 'Escape' &&
      engine.getState().enabled &&
      !currentDialog &&
      !document.querySelector('dialog[open]')
    ) {
      event.preventDefault();
      if (!sceneView.hidden) returnToConversation.click();
      else exitStory();
    }
  };
  document.addEventListener('keydown', globalEscape);
  const unsubscribePresentation = gameStore.subscribe(
    (state) => state.presentation.sceneViewBeatId,
    () => render(engine.getState()),
  );
  const unsubscribeMenu = gameStore.subscribe(
    (state) => state.presentation.menuOpen,
    (open) => {
      if (open) cancelSpeech();
    },
  );
  const unsubscribe = engine.subscribe(render);
  render(engine.getState());
  return {
    open: openWelcome,
    openJournal,
    getOccupiedHeight: () => (card.hidden ? 0 : card.getBoundingClientRect().height),
    setPresentation,
    dispose() {
      if (disposed) return;
      disposed = true;
      beginVersion++;
      clearTimeout(pendingTimer);
      document.removeEventListener('keydown', globalEscape);
      unsubscribe();
      unsubscribePresentation();
      unsubscribeMenu();
      gameStore.updatePresentation({ sceneViewBeatId: null });
      languageAbort.abort();
      languagePicker.dispose();
      narrator.dispose();
      if (currentDialog?.open && typeof currentDialog.close === 'function') currentDialog.close();
      root.remove();
      entry.remove();
      welcomeEntry.remove();
      document.body.classList.remove('story-dialogue', 'story-rolling');
    },
  };
}
