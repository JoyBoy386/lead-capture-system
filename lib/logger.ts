type LogLevel = "info" | "warn" | "error" | "debug";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

// Inside lib/logger.ts
function formatMessage(level: LogLevel, context: string, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  let metaStr = "";
  
  if (meta) {
    // ADD THIS CHECK: If it's an Error, print the message and stack trace
    if (meta instanceof Error) {
      metaStr = ` | Error: ${meta.message}\n${meta.stack}`;
    } else {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
  }
  
  return `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}${metaStr}`;
}

export const logger = {
  info(context: string, message: string, meta?: unknown) {
    if (shouldLog("info")) console.log(formatMessage("info", context, message, meta));
  },
  warn(context: string, message: string, meta?: unknown) {
    if (shouldLog("warn")) console.warn(formatMessage("warn", context, message, meta));
  },
  error(context: string, message: string, meta?: unknown) {
    if (shouldLog("error")) console.error(formatMessage("error", context, message, meta));
  },
  debug(context: string, message: string, meta?: unknown) {
    if (shouldLog("debug")) console.debug(formatMessage("debug", context, message, meta));
  },
};