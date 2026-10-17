# Tools Reference

Agents can use tools by returning a `use_tool` action in their LLM decision. This page documents all built-in tools and how to add custom ones.

---

## Built-in Tools

### `code_execute`

Runs sandboxed JavaScript code with a 5-second timeout.

```json
{
  "action": "use_tool",
  "toolCall": {
    "name": "code_execute",
    "params": { "code": "console.log(2 + 2)", "language": "javascript" }
  }
}
```

**Security:** Executed in a child process with no filesystem or network access. Timeout kills the process after 5 seconds.

### `web_search`

Searches the web using Tavily when `TAVILY_API_KEY` is set, or the DuckDuckGo Instant Answer API otherwise.

To use free [Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp),
start the server with `WEB_SEARCH_PROVIDER=parallel`. No Parallel account or API key
is needed. Search runs in Fast mode and returns source links and excerpts through
the existing `web_search` tool. This sends the query to `https://search.parallel.ai/mcp`.

Set `WEB_SEARCH_PROVIDER=duckduckgo` or `tavily` to select either existing provider
explicitly, or `none` to disable web search. An empty or unset value keeps the
existing automatic selection. Explicit Tavily selection requires `TAVILY_API_KEY`.
An explicit provider failure is returned as a tool error without switching providers.

Parallel requests have a 15-second deadline, including connection and discovery.
Callers of `ToolExecutor.execute` can supply `{ signal }` as the third argument to
cancel a Parallel request. Anonymous access is intended for light use; service
limits and network failures are returned as tool errors.

```json
{
  "action": "use_tool",
  "toolCall": {
    "name": "web_search",
    "params": { "query": "TypeScript generics tutorial" }
  }
}
```

### `write_note`

Saves an in-memory note/memo.

```json
{
  "action": "use_tool",
  "toolCall": {
    "name": "write_note",
    "params": { "title": "Meeting Notes", "content": "Decided on React for the frontend" }
  }
}
```

### `read_file`

Reads a file from a restricted directory. Path traversal is blocked.

```json
{
  "action": "use_tool",
  "toolCall": {
    "name": "read_file",
    "params": { "path": "notes/todo.txt" }
  }
}
```

### `create_task`

Creates a task and assigns it to an agent (self or another).

```json
{
  "action": "use_tool",
  "toolCall": {
    "name": "create_task",
    "params": { "title": "Write unit tests", "assignee": "alice" }
  }
}
```

### `hire_agent`

Hires a new team member who joins the office immediately.

```json
{
  "action": "use_tool",
  "toolCall": {
    "name": "hire_agent",
    "params": { "name": "Charlie", "role": "Intern" }
  }
}
```

**Limit:** Maximum 5 new hires (7 agents total).

---

## Adding Custom Tools

### Step 1: Add the handler in ToolExecutor

Edit `packages/server/src/tools/ToolExecutor.ts`:

```typescript
case 'my_custom_tool':
    return this.myCustomTool(params);

// ...

private async myCustomTool(params: any): Promise<ToolResult> {
    // Your logic here
    return { success: true, output: 'Result of my tool' };
}
```

### Step 2: Add the capability to agents

In `packages/server/src/rooms/OfficeRoom.ts`, add it to the capabilities array:

```typescript
capabilities: [
    // ... existing tools
    { name: 'my_custom_tool', description: 'What this tool does and when to use it' }
],
```

### Step 3: Handle special cases in OfficeRoom

If your tool needs server-side logic (like `hire_agent` or `create_task`), add a handler in the tool execution section of `OfficeRoom.ts`:

```typescript
if (decision.toolCall.name === 'my_custom_tool') {
    // Custom server-side logic
} else {
    // Default: delegate to ToolExecutor
}
```

---

## Tool Result Flow

```
Agent LLM → returns toolCall → Server dispatches to ToolExecutor
    → Result fed back as memory → Agent sees result in next think cycle
```

All tool results are automatically added to the agent's memory buffer with `importance: 0.8`, so the agent can reference them in future decisions.
