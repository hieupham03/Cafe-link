package com.cafelink.client.ui;

import com.cafelink.client.NetworkClient;
import com.cafelink.common.Commands;
import java.nio.file.Path;
import javax.swing.*;
import java.awt.*;
import java.util.Arrays;
import java.util.concurrent.ExecutionException;

public final class LoginFrame extends JFrame {
    private final JTextField host, port, username;
    private final JPasswordField password = new JPasswordField();
    private final JButton login = Ui.button("Kết nối & đăng nhập", "login");
    private final JLabel status = new JLabel("Nhập tài khoản được quán cấp.");
    private final JCheckBox newVisit = new JCheckBox("Bắt đầu lượt khách mới (sau khi lượt cũ đã kết thúc)");
    public LoginFrame(String initialHost, int initialPort, String initialUser) {
        super("CafeLink | Đăng nhập"); setDefaultCloseOperation(DISPOSE_ON_CLOSE);
        host = new JTextField(initialHost); port = new JTextField(Integer.toString(initialPort)); username = new JTextField(initialUser);
        host.setName("host"); port.setName("port"); username.setName("username"); password.setName("password");
        JPanel form = new JPanel(new GridLayout(0, 2, 10, 14)); form.add(new JLabel("Địa chỉ server")); form.add(host); form.add(new JLabel("Cổng TCP")); form.add(port); form.add(new JLabel("Tài khoản")); form.add(username); form.add(new JLabel("Mật khẩu")); form.add(password);
        JPanel content = new JPanel(new BorderLayout(10, 22)); content.setBorder(BorderFactory.createEmptyBorder(24, 28, 24, 28)); content.add(Ui.title("CafeLink · Chào bạn"), BorderLayout.NORTH); content.add(form);
        JPanel bottom = new JPanel(new GridLayout(3, 1, 0, 10)); bottom.add(newVisit); bottom.add(login); bottom.add(status); content.add(bottom, BorderLayout.SOUTH); setContentPane(content);
        login.addActionListener(e -> connect()); getRootPane().setDefaultButton(login); setSize(560, 430); setResizable(false); setLocationRelativeTo(null);
    }
    private void connect() {
        int tcpPort; try { tcpPort = Integer.parseInt(port.getText().trim()); if (tcpPort < 1 || tcpPort > 65535) throw new NumberFormatException(); } catch (NumberFormatException e) { status.setText("Cổng phải từ 1 đến 65535."); return; }
        String address = host.getText().trim(), user = username.getText().trim(); char[] secret = password.getPassword();
        boolean freshVisit = newVisit.isSelected();
        if (address.isEmpty() || user.isEmpty() || secret.length == 0) { Arrays.fill(secret, '\0'); status.setText("Vui lòng nhập đầy đủ thông tin."); return; }
        login.setEnabled(false); status.setText("Đang kết nối…");
        new SwingWorker<NetworkClient, Void>() {
            @Override protected NetworkClient doInBackground() throws Exception {
                NetworkClient client = null;
                try {
                    Path directory = Path.of(System.getProperty("cafelink.stateDir", "data/client-state"));
                    Path journal = directory.resolve(Commands.digest(address.toLowerCase(java.util.Locale.ROOT) + ":" + tcpPort + ":" + user) + ".json");
                    client = new NetworkClient(address, tcpPort, journal); client.login(user, new String(secret)); client.recover();
                    if (freshVisit && client.identity().role().equals("GUEST")) client.startNewVisit();
                    return client;
                }
                catch (Exception e) { if (client != null) client.close(); throw e; }
                finally { Arrays.fill(secret, '\0'); }
            }
            @Override protected void done() {
                login.setEnabled(true); password.setText("");
                try { NetworkClient client = get(); if (!isDisplayable()) { client.close(); return; } JFrame dashboard = client.identity().role().equals("ADMIN") ? new AdminFrame(client) : new GuestFrame(client); dashboard.setVisible(true); dispose(); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                catch (ExecutionException e) { status.setText("Đăng nhập chưa thành công."); Dialogs.SWING.error(LoginFrame.this, e.getCause().getMessage()); }
            }
        }.execute();
    }
}
