package com.cafelink.common;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Set;

/** Four-byte big-endian byte length followed by strict UTF-8 JSON. No Java deserialization. */
public final class FrameCodec {
    public static final int MAX_FRAME_BYTES = 256 * 1024;
    private FrameCodec() { }
    public static Message read(InputStream input) throws IOException {
        int first = input.read();
        if (first == -1) return null;
        byte[] header = new byte[4]; header[0] = (byte) first;
        new DataInputStream(input).readFully(header, 1, 3);
        int size = ByteBuffer.wrap(header).getInt();
        if (size <= 0 || size > MAX_FRAME_BYTES) throw new IOException("Invalid frame length");
        byte[] body = new byte[size]; new DataInputStream(input).readFully(body);
        try {
            String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(body)).toString();
            JsonElement parsed = JsonParser.parseString(text);
            if (!parsed.isJsonObject()) throw new IOException("Expected JSON object");
            Message value = Json.GSON.fromJson(parsed, Message.class);
            validate(value);
            return value;
        } catch (CharacterCodingException | RuntimeException e) {
            throw new IOException("Invalid UTF-8 or message JSON", e);
        }
    }
    public static void write(OutputStream output, Message value) throws IOException {
        validate(value);
        byte[] body = Json.GSON.toJson(value).getBytes(StandardCharsets.UTF_8);
        if (body.length > MAX_FRAME_BYTES) throw new IOException("Message exceeds frame limit");
        DataOutputStream data = new DataOutputStream(output);
        data.writeInt(body.length); data.write(body); data.flush();
    }
    private static void validate(Message value) throws IOException {
        if (value == null || value.version() != Message.VERSION) throw new IOException("Unsupported protocol version");
        if (!Set.of("REQUEST", "RESPONSE", "EVENT").contains(value.kind() == null ? "" : value.kind()))
            throw new IOException("Invalid message kind");
        if (value.action() == null || !value.action().matches("[A-Z_]{1,40}") || value.data() == null)
            throw new IOException("Invalid message fields");
        if (!"EVENT".equals(value.kind()) && (value.requestId() == null || value.requestId().isBlank() || value.requestId().length() > 100))
            throw new IOException("Missing request ID");
    }
}
