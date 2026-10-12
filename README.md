# Agent Forge

**A local visual editor for LLM agent workflows.** Arrange agent steps, tool calls, branches, parallel paths, and review points on a canvas. Run a mock preview to inspect the route before connecting a real runtime.

> Early prototype. Preview steps are simulated; Agent Forge does not call an LLM or execute tools.

## What you can do

- Build a workflow by placing nodes and connecting them on a canvas.
- Add agent, tool, condition, human review, parallel, and output steps.
- Check for missing fields, invalid branches, cycles, and disconnected nodes.
- Preview the route with mock responses, including parallel branches and joins.
- Save workflows in the browser, import a workflow as JSON, and export as JSON or YAML.

The export is Agent Forge's portable graph format. It is a build spec for use with Claude Code, Codex, Copilot, or another setup; it is not a native configuration those tools can run directly.

## Run in a browser

You need Node.js installed.

```sh
npm install
npm run start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The server only listens on the local machine. Workflow data is saved in this browser's local storage; export a copy if you need to move it to another browser or computer.

## Run the desktop app

The desktop shell uses Tauri 2 and requires its Rust build toolchain. With the prerequisites for Tauri installed:

```sh
npm install
npm run tauri dev
```

To build a desktop bundle:

```sh
npm run tauri build
```

## Workflow format

`workflow.schema.json` describes the exported JSON format, currently at schema version `1.0.0`. The editor imports JSON files in this format and exports either JSON or YAML. The YAML export is a readable representation of the same graph.

## Current limits

- The preview uses mock responses; there are no model-provider credentials or live tool integrations.
- Human review steps are auto-approved in preview. No reviewer is contacted.
- Condition previews use a small local evaluator and sample values. They are useful for checking routes, not for validating a production expression engine.
- Exported workflows need an adapter or manual translation before another agent runtime can execute them.

## License

No license has been selected yet.
