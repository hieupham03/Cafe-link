package com.cafelink.common;

import com.google.gson.JsonObject;

/** One application message; requestId correlates RPCs, not a durable receipt in week 1. */
public record Message(int version, String kind, String requestId, String action,
                      boolean ok, String errorCode, String message, JsonObject data) {
    public static final int VERSION = 1;
    public static Message request(String id, String action, JsonObject data) {
        return new Message(VERSION, "REQUEST", id, action, true, null, null, data);
    }
    public static Message success(Message request, JsonObject data) {
        return new Message(VERSION, "RESPONSE", request.requestId(), request.action(), true, null, null, data);
    }
    public static Message error(Message request, String code, String detail) {
        return new Message(VERSION, "RESPONSE", request.requestId(), request.action(), false, code, detail, new JsonObject());
    }
    public static Message event(JsonObject data) {
        return new Message(VERSION, "EVENT", null, "STATE_UPDATED", true, null, null, data);
    }
}
