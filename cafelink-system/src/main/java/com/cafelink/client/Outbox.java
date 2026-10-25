package com.cafelink.client;

import com.cafelink.common.*;
import com.cafelink.common.Models.Identity;
import com.google.gson.JsonObject;
import java.io.*;
import java.nio.channels.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Single-terminal, write-before-send command journal. Never stores a password. */
public final class Outbox implements AutoCloseable {
    public record Entry(String id, String action, JsonObject data, String status, JsonObject result, String detail) { }
    private record State(int version, String username, String credential, List<Entry> entries) { }
    private final Path file;
    private final FileChannel lockChannel;
    private final FileLock lock;
    private State state = new State(1, "", "", List.of());
    public Outbox(Path path) throws IOException {
        file = path.toAbsolutePath().normalize(); Files.createDirectories(file.getParent());
        lockChannel = FileChannel.open(file.resolveSibling(file.getFileName() + ".lock"), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
        FileLock acquired;
        try { acquired = lockChannel.tryLock(); }
        catch (OverlappingFileLockException e) { lockChannel.close(); throw new IOException("Một cửa sổ đang sử dụng dữ liệu phục hồi của bàn này.", e); }
        if (acquired == null) { lockChannel.close(); throw new IOException("Dữ liệu phục hồi đang được dùng bởi tiến trình khác."); }
        lock = acquired;
        try {
            if (Files.exists(file)) {
                if (Files.size(file) > 4 * 1024 * 1024) throw new IOException("Outbox quá lớn; không tự ghi đè.");
                state = Json.GSON.fromJson(Files.readString(file), State.class); validate();
            }
        } catch (IOException | RuntimeException e) { close(); throw new IOException("Không đọc được dữ liệu phục hồi; giữ nguyên file để kiểm tra.", e); }
    }
    private void validate() throws IOException {
        if (state == null || state.version() != 1 || state.username() == null || state.credential() == null || state.entries() == null || state.entries().size() > 200) throw new IOException("Invalid outbox");
        Set<String> ids = new HashSet<>();
        for (Entry entry : state.entries()) {
            if (entry == null || entry.id() == null || entry.id().isBlank() || !ids.add(entry.id()) || !Commands.guestMutation(entry.action()) || entry.data() == null || entry.result() == null || entry.detail() == null || !Set.of("PENDING", "CONFIRM_REQUIRED", "RESOLVED", "REJECTED", "STALE").contains(entry.status())) throw new IOException("Invalid outbox entry");
        }
    }
    public synchronized String credential() { return state.credential(); }
    public synchronized void bind(Identity identity) throws IOException {
        if (!state.username().isEmpty() && !state.username().equals(identity.username())) throw new IOException("Outbox thuộc tài khoản khác.");
        if (!state.credential().isEmpty() && !state.credential().equals(identity.credential())) throw new IOException("Không được chuyển outbox sang credential mới.");
        save(new State(1, identity.username(), identity.credential() == null ? "" : identity.credential(), state.entries()));
    }
    public synchronized List<Entry> entries() {
        return state.entries().stream().map(e -> new Entry(e.id(), e.action(), e.data().deepCopy(), e.status(), e.result().deepCopy(), e.detail())).toList();
    }
    public synchronized Entry queue(String action, JsonObject data) throws IOException {
        if (!Commands.guestMutation(action)) throw new IOException("Thao tác không hỗ trợ outbox.");
        long pending = state.entries().stream().filter(Outbox::unresolved).count();
        if (pending >= 100) throw new IOException("Cần giải quyết các yêu cầu đang chờ trước khi gửi thêm.");
        List<Entry> next = new ArrayList<>(state.entries());
        if (next.size() >= 200) next.removeIf(e -> !unresolved(e));
        Entry entry = new Entry(UUID.randomUUID().toString(), action, data.deepCopy(), "PENDING", new JsonObject(), "Chưa xác định kết quả."); next.add(entry);
        save(new State(1, state.username(), state.credential(), List.copyOf(next))); return entry;
    }
    public static boolean unresolved(Entry entry) { return Set.of("PENDING", "CONFIRM_REQUIRED").contains(entry.status()); }
    public synchronized void mark(String id, String status, JsonObject result, String detail) throws IOException {
        List<Entry> next = new ArrayList<>(); boolean found = false;
        for (Entry entry : state.entries()) {
            if (entry.id().equals(id)) { found = true; next.add(new Entry(id, entry.action(), entry.data(), status, result.deepCopy(), detail)); }
            else next.add(entry);
        }
        if (!found) throw new IOException("Không có yêu cầu trong outbox.");
        save(new State(1, state.username(), state.credential(), List.copyOf(next)));
    }
    public synchronized void startNewVisit(Identity identity) throws IOException {
        if (state.entries().stream().anyMatch(Outbox::unresolved)) throw new IOException("Phải đối chiếu hoặc hủy các yêu cầu đang chờ trước khi đổi lượt.");
        if (!state.username().equals(identity.username())) throw new IOException("Không đổi tài khoản outbox.");
        save(new State(1, state.username(), identity.credential(), List.of()));
    }
    private void save(State next) throws IOException {
        if (!lock.isValid()) throw new IOException("Outbox đã đóng.");
        byte[] bytes = Json.GSON.toJson(next).getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 4 * 1024 * 1024) throw new IOException("Outbox vượt giới hạn dung lượng.");
        Path temporary = Files.createTempFile(file.getParent(), "outbox-", ".tmp");
        try {
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) {
                java.nio.ByteBuffer buffer = java.nio.ByteBuffer.wrap(bytes); while (buffer.hasRemaining()) channel.write(buffer); channel.force(true);
            }
            Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); state = next;
        } finally { Files.deleteIfExists(temporary); }
    }
    @Override public synchronized void close() throws IOException { try { if (lock.isValid()) lock.release(); } finally { lockChannel.close(); } }
}
