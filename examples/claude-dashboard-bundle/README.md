# Claude-style dashboard bundle

This is a synthetic, redistributable fixture for `claude-dashboard-bundle.v1`. It is not an export from Claude and contains no Anthropic or Datashow customer assets.

Import it into a copy of the Hello World project:

```sh
supervisual init /tmp/claude-hello --template hello-world
supervisual import claude-dashboard examples/claude-dashboard-bundle --inspect-only
supervisual import claude-dashboard examples/claude-dashboard-bundle --project /tmp/claude-hello
supervisual check /tmp/claude-hello
supervisual package /tmp/claude-hello
supervisual verify /tmp/claude-hello
```
