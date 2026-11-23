export const isMac = navigator.userAgent.includes('Mac');

export const shortcut = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`);
