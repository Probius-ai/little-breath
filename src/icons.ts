const shapes: Record<string, string> = {
  leaf: '<path d="M20 4C10 3 3 8 5 15s14 6 15-11Z"/><path d="m5 20 10-11"/>',
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  pen: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-4L4 15Z"/>',
  rig: '<circle cx="5" cy="6" r="3"/><circle cx="17" cy="9" r="3"/><circle cx="9" cy="19" r="3"/><path d="m8 7 6 1M15 12l-4 5M6 9l2 7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>',
  cloud: '<path d="M7 18a5 5 0 0 1-1-10 7 7 0 0 1 13 2 4 4 0 1 1 0 8Z"/>',
  rain: '<path d="M5 14a4 4 0 0 1 0-8 6 6 0 0 1 11 0 4 4 0 1 1 2 8M7 18l-1 3m6-3-1 3m6-3-1 3"/>',
  snow: '<path d="M12 2v20M3 7l18 10M3 17 21 7M9 4l3 3 3-3M9 20l3-3 3 3M3 11l4-1-1-4M18 18l-1-4 4-1M3 13l4 1-1 4M18 6l-1 4 4 1"/>',
  storm:
    '<path d="M6 14a4 4 0 0 1 0-8 6 6 0 0 1 11 0 4 4 0 1 1 2 8M13 12l-4 6h5l-3 5"/>',
  fog: '<path d="M4 9h16M2 13h17M5 17h17M8 5h10"/>',
  heart: '<path d="M12 21 3 12C-3 4 8 0 12 7c4-7 15-3 9 5Z"/>',
  food: '<path d="M4 12h16a8 8 0 0 1-16 0ZM3 12h18M8 8V5m4 3V3m4 5V5"/>',
  water:
    '<path d="M12 2C9 7 4 11 4 15a8 8 0 0 0 16 0c0-4-5-8-8-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  undo: '<path d="M4 9h10a6 6 0 0 1 0 12M4 9l5-5M4 9l5 5"/>',
  redo: '<path d="M20 9H10a6 6 0 0 0 0 12M20 9l-5-5M20 9l-5 5"/>',
  trash: '<path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M9 10v7m6-7v7"/>',
  eraser: '<path d="m3 15 10-11 8 8-8 9H8Z"/><path d="m7 11 9 8M12 21h10"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  settings:
    '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  refresh:
    '<path d="M20 6v5h-5M4 18v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>',
  cursor: '<path d="m4 3 6 18 3-7 7-3Z"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v14H3Z"/><circle cx="12" cy="14" r="4"/>',
  book: '<path d="M12 5v16M12 5C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-4-2-7-1-10 1Z"/>',
  location:
    '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3"/>',
  wind: '<path d="M3 8h13a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M5 17h5a2 2 0 1 1-2 2"/>',
  sparkle: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM20 2v4m-2-2h4"/>',
};
export const icon = (name: string, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] ?? shapes.leaf}</svg>`;
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
