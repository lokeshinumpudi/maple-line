/** A small same-origin embed API; it does not expose the development inspector. */
export const EMBED_CHANNEL = 'maple-line-embed-v1';
export function validateEmbedConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('Expected a scene configuration.');
  const choices = {
    focus: ['route', 'train', 'water', 'bridge', 'terrain', 'forest', 'station'],
    surface: ['materials', 'clay', 'wireframe', 'normals'],
    isolation: ['all', 'subject', 'structure'],
    camera: ['scenic', 'follow', 'cab', 'passenger', 'vista'],
    weather: ['clear', 'rain', 'snow'],
    timeOfDay: ['daylight', 'sunrise', 'sunset', 'dusk'],
    location: ['gorge', 'terraces', 'station', 'bridge', 'summit', 'tokyo'],
  };
  for (const [key, value] of Object.entries(input)) {
    if (['paused', 'wireframe', 'shadows', 'textureDetail'].includes(key)) {
      if (typeof value !== 'boolean') throw new TypeError(`${key} must be boolean.`);
    } else if (
      [
        'fov',
        'exposure',
        'roughness',
        'fogDensity',
        'windStrength',
        'sceneryDistance',
        'waterReflection',
        'waterRipples',
        'waterDepth',
        'waterFoam',
        'waterSpeed',
      ].includes(key)
    ) {
      const [min, max] = {
        fov: [35, 90],
        exposure: [0.5, 1.8],
        roughness: [0, 1],
        fogDensity: [0, 0.015],
        windStrength: [0, 3],
        sceneryDistance: [120, 1200],
        waterReflection: [0, 1],
        waterRipples: [0, 3],
        waterDepth: [0, 3],
        waterFoam: [0, 1],
        waterSpeed: [0, 3],
      }[key];
      if (value !== null && (!Number.isFinite(value) || value < min || value > max))
        throw new TypeError(`${key} must be null or a number from ${min} to ${max}.`);
    } else if (!choices[key]?.includes(value)) {
      throw new TypeError(`Unsupported scene setting: ${key}.`);
    }
  }
  return { ...input };
}
export function installEmbedBridge({
  environment = window,
  configure,
  snapshot,
  suspend,
  inspect,
}) {
  const listener = (event) => {
    if (event.source !== environment.parent || event.origin !== environment.location.origin) return;
    const message = event.data;
    if (message?.channel !== EMBED_CHANNEL || typeof message.id !== 'string') return;
    const response = { channel: EMBED_CHANNEL, id: message.id };
    try {
      if (message.type === 'configure') configure(validateEmbedConfig(message.config));
      else if (message.type === 'visibility') {
        if (typeof message.visible !== 'boolean') throw new TypeError('Expected visibility.');
        suspend(!message.visible);
      } else if (message.type === 'inspect') {
        if (![message.x, message.y].every((n) => Number.isFinite(n) && n >= -1 && n <= 1))
          throw new TypeError('Inspection coordinates must be from -1 to 1.');
        response.selection = inspect(message.x, message.y);
      } else if (message.type !== 'snapshot' && message.type !== 'ready') {
        throw new TypeError('Unknown embed request.');
      }
      response.state = snapshot();
      if (Object.hasOwn(response, 'selection')) response.state.selection = response.selection;
    } catch (error) {
      response.error = error.message;
    }
    environment.parent.postMessage(response, event.origin);
  };
  environment.addEventListener('message', listener);
  return () => environment.removeEventListener('message', listener);
}
