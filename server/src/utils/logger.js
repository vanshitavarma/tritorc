const formatMessage = (level, message) => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
};

export const logger = {
  info(message, ...details) {
    console.info(formatMessage('info', message), ...details);
  },
  warn(message, ...details) {
    console.warn(formatMessage('warn', message), ...details);
  },
  error(message, ...details) {
    console.error(formatMessage('error', message), ...details);
  },
  debug(message, ...details) {
    console.debug(formatMessage('debug', message), ...details);
  },
};
