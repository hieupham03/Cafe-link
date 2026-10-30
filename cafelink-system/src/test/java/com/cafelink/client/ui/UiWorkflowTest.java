package com.cafelink.client.ui;

import com.cafelink.client.NetworkClient;
import com.cafelink.client.Outbox;
import com.google.gson.JsonObject;
import com.cafelink.server.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import javax.imageio.ImageIO;
import javax.swing.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.util.List;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import static org.junit.jupiter.api.Assertions.*;

/** Clicks actual Swing actions backed by real TCP + SQLite, replacing only modal answers. */
class UiWorkflowTest {
    @TempDir Path temp;
    CafeService service; CafeServer server; NetworkClient owner, customer;
    AdminFrame admin; GuestFrame guest;
    LoginFrame loginWindow;
    GuestFrame loginGuest;
    volatile CountDownLatch openReply, openCommitted;
    final List<String> errors = new CopyOnWriteArrayList<>();
    final Dialogs dialogs = new Dialogs() {
        public void info(Component p, String text) { }
        public void error(Component p, String text) { errors.add(text); }
        public boolean confirm(Component p, String text) { return true; }
        public String input(Component p, String text) { return "Nhân viên đã hỗ trợ"; }
    };
    @BeforeEach void start() throws Exception {
        Assumptions.assumeFalse(GraphicsEnvironment.isHeadless(), "Desktop required for Swing workflow");
        service = new CafeService(temp.resolve("ui.db"));
        server = new CafeServer(service, "127.0.0.1", 0, s -> {}, (point, who, request) -> {
            CountDownLatch gate = openReply;
            if (gate != null && point == FaultInjector.Point.AFTER_COMMIT && request.action().equals("OPEN_TABLE")) {
                openCommitted.countDown();
                try { if (!gate.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Open response fixture was not released"); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
            return false;
        }); server.start();
        owner = new NetworkClient("127.0.0.1", server.port()); owner.login("admin", "CafeLink@123");
        customer = new NetworkClient("127.0.0.1", server.port()); customer.login("ban1", "Ban1@123");
        edt(() -> { Ui.setup(); admin = new AdminFrame(owner, dialogs); guest = new GuestFrame(customer, dialogs); admin.setVisible(true); guest.setVisible(true); });
        await(() -> find(admin, "openTable", JButton.class).isEnabled());
    }
    @AfterEach void stop() throws Exception {
        if (openReply != null) openReply.countDown();
        edt(() -> { if (loginWindow != null) loginWindow.dispose(); if (loginGuest != null) loginGuest.dispose(); if (admin != null) admin.dispose(); if (guest != null) guest.dispose(); });
        if (owner != null) owner.close(); if (customer != null) customer.close(); if (server != null) server.close(); if (service != null) service.close();
    }
    @Test void guestAndOwnerButtonsCompleteRealOrderAndPayment() throws Exception {
        edt(() -> find(admin, "openTable", JButton.class).doClick());
        await(() -> find(guest, "placeOrder", JButton.class).isEnabled());
        edt(() -> { find(guest, "quantity2", JSpinner.class).setValue(2); find(guest, "placeOrder", JButton.class).doClick(); });
        await(() -> !admin.busy && admin.state.orders().size() == 1 && find(admin, "advanceOrder", JButton.class).isEnabled());
        assertEquals(60000, owner.refresh().orders().get(0).totalVnd());
        for (String status : new String[]{"PREPARING", "READY", "SERVED"}) {
            edt(() -> find(admin, "advanceOrder", JButton.class).doClick());
            await(() -> !admin.busy && admin.state.orders().get(0).status().equals(status));
        }
        await(() -> find(guest, "requestBill", JButton.class).isEnabled());
        edt(() -> find(guest, "requestBill", JButton.class).doClick());
        await(() -> find(admin, "replyTicket", JButton.class).isEnabled());
        edt(() -> find(admin, "replyTicket", JButton.class).doClick());
        await(() -> find(admin, "pay", JButton.class).isEnabled());
        capture(admin, "admin-serving.png"); capture(guest, "guest-orders.png");
        edt(() -> find(admin, "pay", JButton.class).doClick());
        await(() -> !admin.busy && admin.state.tables().get(0).visitId() == null);
        assertNull(customer.refresh().tables().get(0).visitId());
        final String[] receipt = new String[1]; edt(() -> receipt[0] = find(admin, "billText", JTextArea.class).getText());
        assertTrue(receipt[0].contains("60.000")); assertTrue(receipt[0].contains("ĐÃ THANH TOÁN")); assertTrue(errors.isEmpty(), errors.toString());
    }
    @Test void waitingTableAndDisconnectDisableGuestMutations() throws Exception {
        edt(() -> assertFalse(find(guest, "placeOrder", JButton.class).isEnabled()));
        edt(() -> find(admin, "openTable", JButton.class).doClick()); await(() -> find(guest, "callService", JButton.class).isEnabled());
        edt(() -> find(guest, "callService", JButton.class).doClick());
        await(() -> !guest.busy && !find(guest, "callService", JButton.class).isEnabled());
        assertEquals(1, owner.refresh().tickets().size());
        server.close(); await(() -> !find(guest, "placeOrder", JButton.class).isEnabled());
        capture(guest, "guest-disconnected.png"); assertTrue(errors.isEmpty(), errors.toString());
    }
    @Test void actualLoginFormOpensServerAssignedGuestDashboard() throws Exception {
        edt(() -> {
            loginWindow = new LoginFrame("127.0.0.1", server.port(), "ban2"); loginWindow.setVisible(true);
            find(loginWindow, "password", JPasswordField.class).setText("Ban2@123"); find(loginWindow, "login", JButton.class).doClick();
        });
        await(() -> {
            for (Window window : Window.getWindows()) if (window instanceof GuestFrame candidate && candidate != guest && candidate.isDisplayable() && candidate.client.identity().tableId() == 2) { loginGuest = candidate; return true; }
            return false;
        });
        assertEquals(2, loginGuest.client.refresh().tables().get(0).id());
        edt(() -> assertFalse(loginWindow.isDisplayable()));
    }
    @Test void changingVisitClearsPreviousCustomersDraft() throws Exception {
        // A guest can see a committed visit while the owner's response is still delayed.
        // Waiting for the guest's button never proves the owner's next button is ready.
        openReply = new CountDownLatch(1); openCommitted = new CountDownLatch(1);
        edt(() -> find(admin, "openTable", JButton.class).doClick());
        assertTrue(openCommitted.await(5, TimeUnit.SECONDS));
        customer.refresh();
        await(() -> find(guest, "placeOrder", JButton.class).isEnabled());
        edt(() -> {
            assertTrue(admin.busy);
            assertFalse(find(admin, "closeEmpty", JButton.class).isEnabled());
            find(guest, "quantity2", JSpinner.class).setValue(3);
        });
        openReply.countDown(); openReply = null;
        await(() -> find(admin, "closeEmpty", JButton.class).isEnabled());
        edt(() -> find(admin, "closeEmpty", JButton.class).doClick()); await(() -> !find(guest, "placeOrder", JButton.class).isEnabled());
        await(() -> find(admin, "openTable", JButton.class).isEnabled()); edt(() -> find(admin, "openTable", JButton.class).doClick());
        await(() -> !admin.busy && admin.state.tables().get(0).visitId() != null);
        edt(() -> assertEquals(0, find(guest, "quantity2", JSpinner.class).getValue()));
        edt(() -> assertFalse(find(guest, "placeOrder", JButton.class).isEnabled()));
        assertTrue(owner.refresh().orders().isEmpty()); assertTrue(errors.isEmpty(), errors.toString());
    }
    @Test void recoveryTabRequiresConfirmationBeforeSendingPersistedIntent() throws Exception {
        edt(() -> find(admin, "openTable", JButton.class).doClick()); await(() -> find(guest, "placeOrder", JButton.class).isEnabled());
        String visit = owner.refresh().tables().get(0).visitId();
        Path journal = temp.resolve("pending.json");
        try (NetworkClient prepared = new NetworkClient("127.0.0.1", server.port(), journal)) {
            prepared.login("ban1", "Ban1@123");
        }
        try (Outbox store = new Outbox(journal)) { JsonObject payload = new JsonObject(); payload.addProperty("visitId", visit); store.queue("CALL_SERVICE", payload); }
        edt(() -> guest.dispose()); customer.close(); customer = new NetworkClient("127.0.0.1", server.port(), journal); customer.login("ban1", "Ban1@123"); customer.recover();
        edt(() -> { guest = new GuestFrame(customer, dialogs); guest.setVisible(true); });
        await(() -> find(guest, "confirmRecovery", JButton.class).isEnabled());
        assertTrue(owner.refresh().tickets().isEmpty());
        edt(() -> { assertFalse(find(guest, "placeOrder", JButton.class).isEnabled()); find(guest, "confirmRecovery", JButton.class).doClick(); });
        await(() -> !guest.busy && guest.state.tickets().size() == 1);
        assertEquals("RESOLVED", customer.recoveryEntries().get(0).status()); capture(guest, "guest-recovery.png"); assertTrue(errors.isEmpty(), errors.toString());
    }
    static void edt(Runnable work) throws Exception { if (SwingUtilities.isEventDispatchThread()) work.run(); else SwingUtilities.invokeAndWait(work); }
    static void await(BooleanSupplier condition) throws Exception {
        long limit = System.nanoTime() + TimeUnit.SECONDS.toNanos(6);
        while (System.nanoTime() < limit) { boolean[] ok = {false}; edt(() -> ok[0] = condition.getAsBoolean()); if (ok[0]) return; Thread.sleep(25); }
        fail("Timed out waiting for actual UI/network state");
    }
    static <T extends Component> T find(Container parent, String name, Class<T> type) {
        for (Component child : parent.getComponents()) { if (name.equals(child.getName()) && type.isInstance(child)) return type.cast(child); if (child instanceof Container container) { T result = findOrNull(container, name, type); if (result != null) return result; } }
        throw new IllegalStateException("Missing UI component " + name);
    }
    private static <T extends Component> T findOrNull(Container parent, String name, Class<T> type) {
        for (Component child : parent.getComponents()) { if (name.equals(child.getName()) && type.isInstance(child)) return type.cast(child); if (child instanceof Container container) { T value = findOrNull(container, name, type); if (value != null) return value; } } return null;
    }
    static void capture(JFrame frame, String filename) throws Exception {
        Path directory = Path.of("target", "ui-smoke"); Files.createDirectories(directory);
        BufferedImage[] rendered = new BufferedImage[1];
        edt(() -> { BufferedImage image = new BufferedImage(frame.getWidth(), frame.getHeight(), BufferedImage.TYPE_INT_RGB); Graphics2D graphics = image.createGraphics(); frame.printAll(graphics); graphics.dispose(); rendered[0] = image; });
        ImageIO.write(rendered[0], "png", directory.resolve(filename).toFile());
    }
}
