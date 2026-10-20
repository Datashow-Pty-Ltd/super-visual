import { afterEach, describe, expect, test, vi } from "vitest";
import { FabricHttpClient } from "../src/fabric-client.mjs";

afterEach(() => vi.unstubAllGlobals());

describe("Fabric HTTP origin boundary", () => {
  test("accepts a Microsoft regional operation URL returned by Fabric", async () => {
    const operation = "https://wabi-australia-east-b-primary-redirect.analysis.windows.net/metadata/operations/operation-1";
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "Succeeded" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", request);
    const client = new FabricHttpClient({ token: "test-token", timeoutSeconds: 2 });
    const initial = new Response("", { status: 202, headers: { Location: operation, "Retry-After": "0" } });
    await expect(client.complete(initial, "semantic-model-authoring")).resolves.toMatchObject({ status: "Succeeded" });
    expect(request.mock.calls.map(([url]) => new URL(url).hostname)).toEqual([
      "wabi-australia-east-b-primary-redirect.analysis.windows.net",
      "wabi-australia-east-b-primary-redirect.analysis.windows.net",
    ]);
  });

  test("rejects an operation URL outside Microsoft service hosts", async () => {
    const client = new FabricHttpClient({ token: "test-token", timeoutSeconds: 2 });
    const initial = new Response("", { status: 202, headers: { Location: "https://example.com/operation-1" } });
    await expect(client.complete(initial, "semantic-model-authoring")).rejects.toThrow(/Refusing untrusted service URL/);
  });
});
