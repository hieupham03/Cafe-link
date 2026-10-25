package com.cafelink.client;

import com.cafelink.common.Models.Identity;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.io.IOException;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;

class OutboxTest {
    @TempDir Path temp;
    @Test void intentAndCredentialSurviveReopenWithoutSharingMutablePayload() throws Exception {
        Path path = temp.resolve("outbox.json"); String id;
        try (Outbox store = new Outbox(path)) {
            store.bind(new Identity("ban1", "GUEST", 1, "secret")); JsonObject payload = new JsonObject(); payload.addProperty("visitId", "first");
            id = store.queue("CALL_SERVICE", payload).id(); payload.addProperty("visitId", "changed");
            store.entries().get(0).data().addProperty("visitId", "also-changed");
        }
        try (Outbox store = new Outbox(path)) {
            assertEquals("secret", store.credential()); assertEquals(id, store.entries().get(0).id()); assertEquals("first", store.entries().get(0).data().get("visitId").getAsString());
        }
        assertFalse(Files.readString(path).contains("password"));
    }
    @Test void secondWriterCannotOpenSameJournal() throws Exception {
        try (Outbox ignored = new Outbox(temp.resolve("same.json"))) { assertThrows(IOException.class, () -> new Outbox(temp.resolve("same.json"))); }
        try (Outbox reopened = new Outbox(temp.resolve("same.json"))) { assertTrue(reopened.entries().isEmpty()); }
    }
    @Test void corruptedJournalFailsClosedAndIsNotOverwritten() throws Exception {
        Path path = temp.resolve("broken.json"); Files.writeString(path, "{bad"); assertThrows(IOException.class, () -> new Outbox(path)); assertEquals("{bad", Files.readString(path));
    }
    @Test void unavailableServerDoesNotLeakJournalLock() throws Exception {
        int port;
        try (java.net.ServerSocket probe = new java.net.ServerSocket(0)) { port = probe.getLocalPort(); }
        Path path = temp.resolve("failed-connect.json");
        assertThrows(IOException.class, () -> new NetworkClient("127.0.0.1", port, path));
        try (Outbox reopened = new Outbox(path)) { assertTrue(reopened.entries().isEmpty()); }
    }
    @Test void cannotSwitchAccountOrVisitWithUnresolvedIntents() throws Exception {
        try (Outbox store = new Outbox(temp.resolve("outbox.json"))) {
            Identity identity = new Identity("ban1", "GUEST", 1, "first"); store.bind(identity);
            assertThrows(IOException.class, () -> store.bind(new Identity("ban2", "GUEST", 2, "second")));
            Outbox.Entry entry = store.queue("CALL_SERVICE", new JsonObject());
            assertThrows(IOException.class, () -> store.startNewVisit(new Identity("ban1", "GUEST", 1, "next")));
            store.mark(entry.id(), "STALE", new JsonObject(), "visit ended"); store.startNewVisit(new Identity("ban1", "GUEST", 1, "next")); assertEquals("next", store.credential()); assertTrue(store.entries().isEmpty());
        }
    }
}
