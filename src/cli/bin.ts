#!/usr/bin/env node
import { createProgram } from './program.ts';

const program = createProgram();
await program.parseAsync(process.argv);
