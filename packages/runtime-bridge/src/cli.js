#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { BridgeClient } from './client.js';
import { loadConfig } from './config.js';
import { createLogger, safeError } from './logger.js';
import { runBridge } from './runner.js';

const VERSION = '0.2.0';
const HELP = `xinchao-bridge ${VERSION}

Usage:
  xinchao-bridge check     Validate configuration and server authentication
  xinchao-bridge run       Open one foreground delivery stream
  xinchao-bridge --help    Show this help
  xinchao-bridge --version Show the version

This client is fail closed: a stream failure exits with code 2 and never loops.
`;

function installSignals(controller) {
  const stop = (signal) => controller.abort(new Error(`received ${signal}`));
  const onInt = () => stop('SIGINT');
  const onTerm = () => stop('SIGTERM');
  process.once('SIGINT', onInt);
  process.once('SIGTERM', onTerm);
  return () => {
    process.removeListener('SIGINT', onInt);
    process.removeListener('SIGTERM', onTerm);
  };
}

export async function runCli(args = process.argv.slice(2), env = process.env) {
  const command = args[0];
  if (command === '--version' || command === '-v') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (command === '--help' || command === '-h' || command === undefined) {
    process.stdout.write(HELP);
    return 0;
  }
  if (command !== 'check' && command !== 'run') {
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    return 2;
  }

  let config;
  try {
    config = loadConfig(env, { requireInjector: command === 'run' });
  } catch (error) {
    process.stderr.write(`Configuration error: ${safeError(error)}\n`);
    return 2;
  }

  const logger = createLogger(config.logLevel);
  const shutdown = new AbortController();
  const removeSignals = installSignals(shutdown);
  const client = new BridgeClient(config);
  try {
    if (command === 'check') {
      await client.check(shutdown.signal);
      logger.info('configuration and server authentication are valid');
      return 0;
    }
    await runBridge(config, client, logger, shutdown.signal);
    return 0;
  } catch (error) {
    if (!shutdown.signal.aborted) logger.error('bridge stopped', { error: safeError(error) });
    return shutdown.signal.aborted ? 0 : 2;
  } finally {
    removeSignals();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli();
}
