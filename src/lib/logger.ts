type LogMethod = (...args: unknown[]) => void;

const isDev = import.meta.env.DEV;

export const logger: Record<'debug' | 'info' | 'warn' | 'error', LogMethod> = {
  debug: (...args) => {
    if (isDev) console.debug(...args);
  },
  info: (...args) => {
    if (isDev) console.info(...args);
  },
  warn: (...args) => {
    if (isDev) console.warn(...args);
  },
  error: (...args) => {
    if (isDev) console.error(...args);
  },
};