package com.cafelink.common;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;
import java.io.*;
import java.nio.charset.StandardCharsets;
import static org.junit.jupiter.api.Assertions.*;

class FrameCodecTest {
    private Message example() {
        JsonObject data = new JsonObject(); data.addProperty("note", "Cà phê sữa ☕\nít đá");
        return Message.request("r1", "PLACE_ORDER", data);
    }
    @Test void unicodeAndMultipleFramesRemainDistinct() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        FrameCodec.write(bytes, example()); FrameCodec.write(bytes, Message.request("r2", "PING", new JsonObject()));
        InputStream in = new ByteArrayInputStream(bytes.toByteArray());
        assertEquals(example(), FrameCodec.read(in)); assertEquals("r2", FrameCodec.read(in).requestId()); assertNull(FrameCodec.read(in));
    }
    @Test void fragmentedStreamIsReadFully() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); FrameCodec.write(bytes, example());
        InputStream split = new FilterInputStream(new ByteArrayInputStream(bytes.toByteArray())) {
            @Override public int read(byte[] b, int off, int len) throws IOException { return super.read(b, off, Math.min(len, 1)); }
        };
        assertEquals(example(), FrameCodec.read(split));
    }
    @Test void truncatedHeaderAndBodyAreNotCleanDisconnects() throws Exception {
        assertThrows(EOFException.class, () -> FrameCodec.read(new ByteArrayInputStream(new byte[]{0, 0})));
        assertThrows(EOFException.class, () -> FrameCodec.read(new ByteArrayInputStream(new byte[]{0, 0, 0, 8, 1})));
    }
    @Test void badLengthsAreRejectedBeforeAllocation() throws Exception {
        for (int size : new int[]{0, -1, FrameCodec.MAX_FRAME_BYTES + 1}) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); new DataOutputStream(bytes).writeInt(size);
            assertThrows(IOException.class, () -> FrameCodec.read(new ByteArrayInputStream(bytes.toByteArray())));
        }
    }
    @Test void invalidJsonUtf8AndVersionAreRejected() throws Exception {
        for (byte[] payload : new byte[][]{"[]".getBytes(StandardCharsets.UTF_8), "oops".getBytes(StandardCharsets.UTF_8), {(byte)0xc3, 0x28},
                "{\"version\":2,\"kind\":\"REQUEST\",\"requestId\":\"x\",\"action\":\"PING\",\"data\":{}}".getBytes(StandardCharsets.UTF_8)}) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); DataOutputStream out = new DataOutputStream(bytes); out.writeInt(payload.length); out.write(payload);
            assertThrows(IOException.class, () -> FrameCodec.read(new ByteArrayInputStream(bytes.toByteArray())));
        }
    }
    @Test void oversizedOutgoingPayloadIsRejected() {
        JsonObject data = new JsonObject(); data.addProperty("note", "x".repeat(FrameCodec.MAX_FRAME_BYTES));
        assertThrows(IOException.class, () -> FrameCodec.write(new ByteArrayOutputStream(), Message.request("r", "PING", data)));
    }
}
