# EOS Web UI + AI Assistant

Web interface for EOS (Experiment Orchestration System) with AI assistant.

> **Provided as a reference implementation. Not maintained.**

## Setup

Needs Node 22+, a running EOS orchestrator, PostgreSQL, and S3-compatible storage.

```bash
npm install
cp .env.example .env   # fill in
npm run dev            # http://localhost:3000
```

## AI assistant

Bring your own credentials. Enter them in the settings panel, where they are stored in browser local storage. `ANTHROPIC_API_KEY` and `OLLAMA_BASE_URL` act as server-side fallbacks.

| Provider      | Setup                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------- |
| **Anthropic** | API key. Claude Opus 5, Sonnet 5, or Haiku 4.5.                                                    |
| **Ollama**    | Base URL of the OpenAI-compatible endpoint, such as `http://localhost:11434/v1`. Any pulled model. |

Note that the server connects to Ollama, not your browser, so the URL must be reachable from the host. The assistant also exposes a large tool set, which small local models tend to handle poorly.

### Running Qwen3.8 27B with Ollama

```bash
ollama pull qwen3.8:27b

cat > Modelfile <<'MODELFILE'
FROM qwen3.8:27b
PARAMETER num_ctx 32768
MODELFILE

ollama create qwen3.8-eos -f Modelfile
```

In the settings panel choose **Ollama**, model `qwen3.8-eos`, base URL `http://localhost:11434/v1`.

## License

BSD 3-Clause. See [LICENSE](LICENSE).
