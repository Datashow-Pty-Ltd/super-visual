import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const base = "https://api.fabric.microsoft.com/v1";

export class FabricHttpClient {
  constructor({ timeoutSeconds = 900, token } = {}) { this.timeoutSeconds = timeoutSeconds; this.providedToken = token; }

  async token() {
    if (this.providedToken) return this.providedToken;
    const { stdout } = await run("az", ["account", "get-access-token", "--resource", "https://api.fabric.microsoft.com", "--query", "accessToken", "--output", "tsv"]);
    const token = stdout.trim();
    if (!token) throw new Error("Azure CLI did not return a Fabric access token; run az login first");
    return token;
  }

  async request(pathOrUrl, method, skill, body) {
    const response = await fetch(pathOrUrl.startsWith("https://") ? pathOrUrl : `${base}${pathOrUrl}`, { method, headers: { Authorization: `Bearer ${await this.token()}`, "x-ms-fabric-skill": skill, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return this.complete(response, skill);
  }

  async body(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return { text }; } }
  async assert(response) { const body = await this.body(response); if (!response.ok) throw new Error(`Fabric HTTP ${response.status}: ${JSON.stringify(body)}`); return body; }

  async complete(response, skill) {
    if (response.status !== 202) return this.assert(response);
    const location = response.headers.get("Location") ?? `${base}/operations/${response.headers.get("x-ms-operation-id") ?? response.headers.get("operation-id")}`;
    if (location.endsWith("/null")) throw new Error("Fabric returned 202 without an operation location");
    const started = Date.now();
    while ((Date.now() - started) / 1000 < this.timeoutSeconds) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(1000, Number(response.headers.get("Retry-After") ?? 3) * 1000)));
      const poll = await fetch(location, { headers: { Authorization: `Bearer ${await this.token()}`, "x-ms-fabric-skill": skill } });
      const state = await this.assert(poll);
      if (state.status === "Failed" || state.status === "Cancelled") throw new Error(`Fabric operation ${state.status}: ${JSON.stringify(state.error ?? state)}`);
      if (state.status === "Succeeded") {
        const result = await fetch(`${location}/result`, { headers: { Authorization: `Bearer ${await this.token()}`, "x-ms-fabric-skill": skill } });
        if (result.status === 404 || result.status === 400) return state;
        return this.assert(result);
      }
    }
    throw new Error(`Fabric operation exceeded ${this.timeoutSeconds}s`);
  }

  skill(type) { return type === "Report" ? "powerbi-report-management" : "semantic-model-authoring"; }
  collection(type) { return type === "Report" ? "reports" : "semanticModels"; }
  async getWorkspace(id) { return this.request(`/workspaces/${id}`, "GET", "semantic-model-authoring"); }
  async listItems(workspaceId, type) {
    const output = []; let next = `/workspaces/${workspaceId}/items?type=${type}`;
    while (next) { const page = await this.request(next, "GET", this.skill(type)); output.push(...(page.value ?? [])); next = page.continuationUri; }
    return output;
  }
  async createItem(workspaceId, type, displayName, format, parts) { return this.request(`/workspaces/${workspaceId}/${this.collection(type)}`, "POST", this.skill(type), { displayName, definition: { format, parts } }); }
  async updateItem(workspaceId, type, id, format, parts) { await this.request(`/workspaces/${workspaceId}/${this.collection(type)}/${id}/updateDefinition`, "POST", this.skill(type), { definition: { format, parts } }); return { id }; }
  async getDefinition(workspaceId, type, id, format) { const response = await this.request(`/workspaces/${workspaceId}/items/${id}/getDefinition?format=${format}`, "POST", this.skill(type), {}); return { format: response.definition?.format ?? format, parts: response.definition?.parts ?? [] }; }
}
