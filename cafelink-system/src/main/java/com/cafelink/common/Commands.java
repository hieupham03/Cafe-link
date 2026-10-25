package com.cafelink.common;

import com.google.gson.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;

/** Shared command classification and deterministic content fingerprints. */
public final class Commands {
    private Commands() { }
    private static final Set<String> MUTATIONS = Set.of("AMEND_SERVICE", "CANCEL_SERVICE", "SET_STORE_ACCEPTING", "OPEN_ALL_TABLES", "SET_TABLE_ACCEPTING", "OPEN_TABLE", "PLACE_ORDER", "SET_ORDER_STATUS",
            "CALL_SERVICE", "REQUEST_BILL", "REQUEST_CHECKOUT", "ACK_CHECKOUT", "REOPEN_ORDERING", "HANDLE_TICKET", "PAY_AND_CLOSE", "CLOSE_EMPTY_TABLE", "ROTATE_JOIN_GRANT", "REVOKE_SESSION", "MARK_NOTIFICATION_READ", "CREATE_MENU_ITEM", "UPDATE_MENU_ITEM", "SAVE_MENU_CATEGORY", "DELETE_MENU_CATEGORY", "START_ORDER_PAYMENT", "SIMULATE_PAYMENT", "CANCEL_UNPAID_ORDER", "CLOSE_VISIT", "RESOLVE_ORDER");
    public static boolean mutation(String action) { return MUTATIONS.contains(action); }
    public static boolean guestMutation(String action) { return Set.of("AMEND_SERVICE", "CANCEL_SERVICE", "PLACE_ORDER", "CALL_SERVICE", "REQUEST_BILL", "REQUEST_CHECKOUT").contains(action); }
    public static String fingerprint(String action, JsonObject data) { return digest(action + "\n" + canonical(data)); }
    public static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static String canonical(JsonElement value) {
        if (value.isJsonObject()) {
            StringJoiner result = new StringJoiner(",", "{", "}");
            new TreeSet<>(value.getAsJsonObject().keySet()).forEach(key -> result.add(Json.GSON.toJson(key) + ":" + canonical(value.getAsJsonObject().get(key))));
            return result.toString();
        }
        if (value.isJsonArray()) {
            StringJoiner result = new StringJoiner(",", "[", "]"); value.getAsJsonArray().forEach(item -> result.add(canonical(item))); return result.toString();
        }
        return value.toString();
    }
}
