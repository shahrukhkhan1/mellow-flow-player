type LogMethod = (...args: unknown[]) => void;

const isDev = import.meta.env.DEV;
const devConsole = globalThis.console;

export const logger: Record<'debug' | 'info' | 'warn' | 'error', LogMethod> = {
  debug: (...args) => {
    if (isDev) devConsole.debug(...args);
  },
  info: (...args) => {
    if (isDev) devConsole.info(...args);
  },
  warn: (...args) => {
    if (isDev) devConsole.warn(...args);
  },
  error: (...args) => {
    if (isDev) devConsole.error(...args);
  },
};