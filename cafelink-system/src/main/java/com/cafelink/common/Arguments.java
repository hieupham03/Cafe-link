package com.cafelink.common;

import java.util.HashMap;
import java.util.Map;

public final class Arguments {
    private final Map<String, String> values = new HashMap<>();
    public Arguments(String[] args) { for (String arg : args) { if (!arg.startsWith("--")) throw new IllegalArgumentException("Use --name=value arguments"); String[] pair = arg.substring(2).split("=", 2); values.put(pair[0], pair.length == 2 ? pair[1] : "true"); } }
    public String get(String key, String fallback) { return values.getOrDefault(key, fallback); }
    public int integer(String key, int fallback) { return Integer.parseInt(get(key, Integer.toString(fallback))); }
    public boolean has(String key) { return values.containsKey(key); }
}
