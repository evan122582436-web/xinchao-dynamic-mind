const PRIORITY = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

export function createLogger(level = 'info') {
  const threshold = PRIORITY[level] ?? PRIORITY.info;
  const emit = (severity, message, details = {}) => {
    if (PRIORITY[severity] < threshold) return;
    const record = {
      time: new Date().toISOString(),
      level: severity,
      message,
      ...details,
    };
    const stream = severity === 'error' || severity === 'warn' ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(record)}\n`);
  };
  return Object.freeze({
    debug: (message, details) => emit('debug', message, details),
    info: (message, details) => emit('info', message, details),
    warn: (message, details) => emit('warn', message, details),
    error: (message, details) => emit('error', message, details),
  });
}

export function safeError(error) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}
