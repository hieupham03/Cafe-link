package com.cafelink.client.ui;

import com.cafelink.client.NetworkClient;
import com.cafelink.common.Models.Snapshot;
import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.function.Consumer;

abstract class DashboardFrame extends JFrame {
    protected final NetworkClient client;
    protected final Dialogs dialogs;
    protected Snapshot state;
    protected boolean busy;
    protected final JLabel feedback = new JLabel(" ");
    private final JLabel connection = new JLabel("Đã kết nối");
    private boolean disposed;
    DashboardFrame(String title, NetworkClient client, Dialogs dialogs) {
        super(title); this.client = client; this.dialogs = dialogs;
        setDefaultCloseOperation(DISPOSE_ON_CLOSE); setLayout(new BorderLayout(12, 12));
        ((JPanel)getContentPane()).setBorder(BorderFactory.createEmptyBorder(14, 16, 14, 16));
        JButton refresh = Ui.button("Làm mới", "refresh"), reconnect = Ui.button("Đăng nhập lại", "relogin");
        refresh.addActionListener(e -> task(client::refresh, s -> feedback.setText("Đã cập nhật từ quán.")));
        reconnect.addActionListener(e -> { String host = client.host(); int port = client.port(); String user = client.identity().username(); dispose(); new LoginFrame(host, port, user).setVisible(true); });
        JPanel bottom = new JPanel(new BorderLayout()); bottom.add(feedback, BorderLayout.CENTER); bottom.add(Ui.row(connection, refresh, reconnect), BorderLayout.EAST); add(bottom, BorderLayout.SOUTH);
        addWindowListener(new WindowAdapter() { @Override public void windowClosed(WindowEvent e) { client.close(); } });
    }
    protected final void subscribe() {
        client.onState(s -> SwingUtilities.invokeLater(() -> { if (!disposed) { state = s; render(); } }));
        client.onDisconnect(reason -> SwingUtilities.invokeLater(() -> { if (!disposed) { connection.setText("Mất kết nối"); connection.setForeground(Color.RED); feedback.setText("Đăng nhập lại để đối chiếu kết quả; không đặt lại đơn khi chưa rõ."); render(); } }));
    }
    protected abstract void render();
    protected final <T> void task(Callable<T> work, Consumer<T> success) {
        if (busy || disposed) return;
        busy = true; feedback.setText("Đang gửi yêu cầu…"); render();
        new SwingWorker<T, Void>() {
            @Override protected T doInBackground() throws Exception {
                T result = work.call();
                // A failed refresh must not hide an already acknowledged mutation.
                try { client.refresh(); } catch (java.io.IOException ignored) { }
                return result;
            }
            @Override protected void done() {
                if (disposed) return;
                try { success.accept(get()); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                catch (ExecutionException e) { feedback.setText("Yêu cầu chưa hoàn tất."); dialogs.error(DashboardFrame.this, e.getCause().getMessage()); }
                catch (RuntimeException e) { dialogs.error(DashboardFrame.this, e.getMessage()); }
                finally { busy = false; if (client.latest() != null) state = client.latest(); render(); }
            }
        }.execute();
    }
    @Override public void dispose() { disposed = true; client.close(); super.dispose(); }
}
