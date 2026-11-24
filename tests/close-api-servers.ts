import { closeApiServers } from '../src/transpiler';

// each test file runs in its own module registry and so starts its own API server process
afterAll(() => closeApiServers());
