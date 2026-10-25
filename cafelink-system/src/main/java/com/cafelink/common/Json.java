package com.cafelink.common;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;

public final class Json {
    public static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();
    private Json() { }
    public static JsonObject object(Object value) { return GSON.toJsonTree(value).getAsJsonObject(); }
}
