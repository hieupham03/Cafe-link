package com.cafelink.server;

import com.cafelink.client.ui.*;
import com.cafelink.common.Arguments;
import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.nio.file.Path;
import java.time.LocalTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ServerMain {
    public static void main(String[] args) throws Exception {
        Arguments options = new Arguments(args); String bind = options.get("bind", "127.0.0.1"); int port = options.integer("port", 5050);
        CafeService service = new CafeService(Path.of(options.get("db", "data/cafelink.db")));
        String faultMode = options.get("fault", "none");
        FaultInjector fault = switch (faultMode) {
            case "none" -> FaultInjector.NONE;
            case "drop-order-ack" -> FaultInjector.once(FaultInjector.Point.AFTER_COMMIT, "PLACE_ORDER");
            case "drop-service-before" -> FaultInjector.once(FaultInjector.Point.BEFORE_ACCEPT, "CALL_SERVICE");
            default -> { service.close(); throw new IllegalArgumentException("Unknown fault mode"); }
        };
        if (!faultMode.equals("none")) System.out.println("EXPERIMENT FAULT ENABLED: " + faultMode);
        JTextArea log = new JTextArea();
        CafeServer server = new CafeServer(service, bind, port, text -> { System.out.println(text); if (!options.has("headless")) SwingUtilities.invokeLater(() -> { log.append(LocalTime.now().withNano(0) + " " + text + "\n"); if (log.getDocument().getLength() > 80000) try { log.getDocument().remove(0, 20000); } catch (Exception ignored) { } log.setCaretPosition(log.getDocument().getLength()); }); }, fault);
        AtomicBoolean closed = new AtomicBoolean(); Runnable stop = () -> { if (closed.compareAndSet(false, true)) { server.close(); try { service.close(); } catch (Exception e) { System.err.println("Database close failed"); } } };
        Runtime.getRuntime().addShutdownHook(new Thread(stop, "cafelink-shutdown"));
        try { server.start(); } catch (Exception e) { stop.run(); throw e; }
        if (options.has("headless")) { new CountDownLatch(1).await(); return; }
        SwingUtilities.invokeLater(() -> {
            Ui.setup(); JFrame window = new JFrame("CafeLink | TCP Server"); window.setDefaultCloseOperation(WindowConstants.DISPOSE_ON_CLOSE);
            log.setEditable(false); log.setFont(new Font("Consolas", Font.PLAIN, 13));
            JPanel panel = new JPanel(new BorderLayout(10, 10)); panel.setBorder(BorderFactory.createEmptyBorder(16, 16, 16, 16));
            panel.add(Ui.title("CafeLink Server · " + bind + ":" + server.port()), BorderLayout.NORTH); panel.add(new JScrollPane(log));
            JButton admin = Ui.button("Mở màn hình chủ quán", "adminLogin"), stopButton = Ui.button("Dừng server", "stopServer");
            String clientHost = bind.equals("0.0.0.0") ? "127.0.0.1" : bind;
            admin.addActionListener(e -> new LoginFrame(clientHost, server.port(), "admin").setVisible(true)); stopButton.addActionListener(e -> window.dispose());
            panel.add(Ui.row(admin, stopButton, new JLabel("Database: " + options.get("db", "data/cafelink.db"))), BorderLayout.SOUTH);
            window.setContentPane(panel); window.setSize(1000, 580); window.setLocationRelativeTo(null);
            window.addWindowListener(new WindowAdapter() { @Override public void windowClosed(WindowEvent e) { new Thread(stop, "cafelink-stop").start(); } }); window.setVisible(true);
        });
    }
}
