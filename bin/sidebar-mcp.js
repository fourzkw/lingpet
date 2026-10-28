#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createSidebarServer} from '../src/sidebar-server.js';
await createSidebarServer().connect(new StdioServerTransport());
