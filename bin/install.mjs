#!/usr/bin/env node
import { main } from '../lib/rtk-cli.mjs';

process.exitCode = await main(process.argv.slice(2));
