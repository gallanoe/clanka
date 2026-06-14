# clanka

A marketplace of [Claude Code](https://claude.com/claude-code) plugins by gallanoe.

## Add the marketplace

```
/plugin marketplace add gallanoe/clanka
```

Then install any plugin below with `/plugin install <name>@clanka`.

## Plugins

| Plugin | Description |
|---|---|
| [`clanka`](plugins/clanka) | Multi-agent orchestration framework: an orchestrator agent that classifies user intent and delegates to specialist subagents. |
| [`antirot`](plugins/antirot) | Turns a high-level curriculum outline into a fully-written, fast-paced, Obsidian-native Markdown course via a manifest-coordinated design → generate → check pipeline. |

## Layout

```
.claude-plugin/marketplace.json   marketplace manifest (lists plugins)
plugins/<name>/                   one self-contained plugin per directory
  .claude-plugin/plugin.json      plugin manifest
  agents/  skills/  ...           plugin components
  README.md                       plugin docs
```

Each plugin lives in its own directory under `plugins/` and is registered in `marketplace.json` via a `source` pointing at that directory. To add a new plugin, create `plugins/<name>/` with its own `.claude-plugin/plugin.json` and append an entry to the `plugins` array in `marketplace.json`.

## License

MIT
