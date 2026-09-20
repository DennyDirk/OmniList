import assert from "node:assert/strict";
import test from "node:test";
import { etsyConnectionView } from "../apps/web/lib/etsy-connection-view";
import { etsyCopy } from "../apps/web/lib/etsy-copy";

test("unconfigured Etsy does not invite the seller to an unavailable action", () => {
  for (const status of [undefined, "disconnected", "attention_required"] as const) {
    assert.deepEqual(etsyConnectionView(false, status), {
      badge: "upcoming", canConnect: false, canDisconnect: false, canReadSetup: false
    });
  }
});

test("configured Etsy offers connection preview, not publishing readiness", () => {
  assert.deepEqual(etsyConnectionView(true, "disconnected"), {
    badge: "preview", canConnect: true, canDisconnect: false, canReadSetup: false
  });
});

test("connected Etsy allows reading setup and managing the connection", () => {
  assert.deepEqual(etsyConnectionView(true, "connected"), {
    badge: "connected", canConnect: true, canDisconnect: true, canReadSetup: true
  });
});

test("a connection requiring attention is not presented as a new connection preview", () => {
  assert.deepEqual(etsyConnectionView(true, "attention_required"), {
    badge: "attention_required", canConnect: true, canDisconnect: false, canReadSetup: false
  });
});

test("connector outage preserves disconnect without offering unavailable reads or reconnect", () => {
  assert.deepEqual(etsyConnectionView(false, "connected"), {
    badge: "unavailable", canConnect: false, canDisconnect: true, canReadSetup: false
  });
});

test("each locale explains availability and publishing separately", () => {
  for (const copy of Object.values(etsyCopy)) {
    for (const key of ["upcoming", "preview", "unavailable", "unavailableHint", "interruptedHint", "publishingLater"] as const) {
      assert.ok(copy[key].trim());
    }
  }
});
