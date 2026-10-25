package com.cafelink.client.ui;

import com.cafelink.client.NetworkClient;
import com.cafelink.client.Outbox;
import com.cafelink.common.Json;
import com.cafelink.common.Models.*;
import com.cafelink.common.Models.MenuItem;
import com.google.gson.*;
import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

public final class GuestFrame extends DashboardFrame {
    private final JLabel heading = Ui.title("CafeLink"), visitStatus = new JLabel(), cartTotal = new JLabel();
    private final JPanel menu = new JPanel(new GridLayout(0, 2, 10, 10));
    private final Map<Integer, JSpinner> quantities = new LinkedHashMap<>();
    private final JTextField orderNote = new JTextField(20), serviceNote = new JTextField(20);
    private final JButton place = Ui.button("Đặt món", "placeOrder"), call = Ui.button("Gọi nhân viên", "callService"), requestBill = Ui.button("Yêu cầu tính tiền", "requestBill"), showBill = Ui.button("Xem tổng tiền", "showBill");
    private final DefaultTableModel orders = Ui.model("Đơn", "Món", "Trạng thái", "Tổng tiền"), tickets = Ui.model("Yêu cầu", "Loại", "Trạng thái", "Phản hồi");
    private final JTextArea billText = new JTextArea();
    private final JTabbedPane tabs = new JTabbedPane();
    private final DefaultTableModel recovery = Ui.model("Mã", "Loại yêu cầu", "Kết quả", "Chi tiết");
    private final JTable recoveryTable = Ui.table(recovery, "recoveryEntries");
    private final JButton recover = Ui.button("Đối chiếu kết quả", "recover"), confirmRecovery = Ui.button("Xác nhận gửi lại", "confirmRecovery"), dismissRecovery = Ui.button("Không gửi nữa", "dismissRecovery");
    private String displayedVisit;
    private final java.util.List<String> recoveryIds = new java.util.ArrayList<>();
    public GuestFrame(NetworkClient client) { this(client, Dialogs.SWING); }
    public GuestFrame(NetworkClient client, Dialogs dialogs) {
        super("CafeLink | Bàn " + client.identity().tableId(), client, dialogs);
        if (!client.identity().role().equals("GUEST")) throw new IllegalArgumentException("Guest identity required");
        JPanel header = new JPanel(new BorderLayout()); header.add(heading, BorderLayout.NORTH); header.add(visitStatus, BorderLayout.SOUTH); add(header, BorderLayout.NORTH);
        JPanel ordering = new JPanel(new BorderLayout(5, 5)); ordering.add(new JScrollPane(menu));
        JPanel controls = new JPanel(new GridLayout(2, 1)); controls.add(Ui.row(new JLabel("Ghi chú món:"), orderNote)); controls.add(Ui.row(cartTotal, place)); ordering.add(controls, BorderLayout.SOUTH);
        tabs.addTab("Đơn của bàn", new JScrollPane(Ui.table(orders, "guestOrders"))); tabs.addTab("Phản hồi", new JScrollPane(Ui.table(tickets, "guestTickets")));
        billText.setEditable(false); billText.setFont(new Font("Consolas", Font.PLAIN, 14)); billText.setName("guestBill"); tabs.addTab("Hóa đơn", new JScrollPane(billText));
        JPanel recoveryPanel = new JPanel(new BorderLayout()); recoveryPanel.add(new JScrollPane(recoveryTable)); recoveryPanel.add(Ui.row(recover, confirmRecovery, dismissRecovery), BorderLayout.SOUTH); tabs.addTab("Phục hồi", recoveryPanel);
        recover.addActionListener(e -> task(client::recover, result -> { feedback.setText("Đã đối chiếu với quán. Yêu cầu chưa nhận cần bạn xác nhận."); tabs.setSelectedIndex(3); }));
        confirmRecovery.addActionListener(e -> {
            String id = selectedRecovery(); if (id == null || !dialogs.confirm(this, "Chỉ gửi lại nếu bạn vẫn cần món/yêu cầu này. Tiếp tục?")) return;
            task(() -> client.confirmRecovery(id), result -> { feedback.setText("Đã xác nhận kết quả yêu cầu phục hồi."); tabs.setSelectedIndex(3); });
        });
        dismissRecovery.addActionListener(e -> {
            String id = selectedRecovery(); if (id == null || !dialogs.confirm(this, "Ngừng gửi yêu cầu chưa được quán nhận? Đơn đã nhận vẫn được giữ.")) return;
            task(() -> { client.dismissRecovery(id); return true; }, result -> feedback.setText("Đã đối chiếu và xử lý yêu cầu chưa gửi."));
        });
        JPanel right = new JPanel(new BorderLayout()); right.add(tabs); JPanel services = new JPanel(new GridLayout(2, 1)); services.add(Ui.row(new JLabel("Yêu cầu:"), serviceNote)); services.add(Ui.row(call, requestBill, showBill)); right.add(services, BorderLayout.SOUTH);
        JSplitPane split = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT, ordering, right); split.setDividerLocation(480); split.setResizeWeight(.48); add(split);
        place.addActionListener(e -> {
            TableView table = table(); if (table == null || table.visitId() == null) return;
            JsonObject data = AdminFrame.visit(table.visitId()); JsonArray items = new JsonArray();
            try {
                for (Map.Entry<Integer, JSpinner> entry : quantities.entrySet()) {
                    entry.getValue().commitEdit();
                    int quantity = new java.math.BigDecimal(entry.getValue().getValue().toString()).intValueExact();
                    if (quantity < 0 || quantity > 20) throw new IllegalArgumentException();
                    if (quantity > 0) { JsonObject item = AdminFrame.number("menuId", entry.getKey()); item.addProperty("quantity", quantity); items.add(item); }
                }
            } catch (Exception invalid) { dialogs.error(this, "Số lượng phải là số nguyên từ 0 đến 20."); return; }
            if (items.isEmpty()) { dialogs.info(this, "Chọn ít nhất một món."); return; }
            data.add("items", items); data.addProperty("note", orderNote.getText());
            task(() -> client.request("PLACE_ORDER", data), result -> { quantities.values().forEach(s -> s.setValue(0)); orderNote.setText(""); feedback.setText("Quán đã nhận đơn #" + result.get("orderId").getAsLong()); tabs.setSelectedIndex(0); });
        });
        call.addActionListener(e -> service("CALL_SERVICE")); requestBill.addActionListener(e -> service("REQUEST_BILL"));
        showBill.addActionListener(e -> { TableView table = table(); if (table != null && table.visitId() != null) task(() -> client.request("GET_BILL", AdminFrame.visit(table.visitId())), result -> { billText.setText(AdminFrame.formatBill(Json.GSON.fromJson(result, Bill.class))); tabs.setSelectedIndex(2); feedback.setText("Tổng tiền được tính bởi quán."); }); });
        setSize(1120, 740); setMinimumSize(new Dimension(950, 600)); setLocationRelativeTo(null); subscribe();
    }
    private void service(String type) {
        TableView table = table(); if (table == null || table.visitId() == null) return;
        JsonObject data = AdminFrame.visit(table.visitId()); data.addProperty("note", serviceNote.getText());
        task(() -> client.request(type, data), result -> { serviceNote.setText(""); feedback.setText("Quán đã nhận yêu cầu #" + result.get("ticketId").getAsLong()); tabs.setSelectedIndex(1); });
    }
    private TableView table() { return state == null || state.tables().isEmpty() ? null : state.tables().get(0); }
    private String selectedRecovery() { int row = recoveryTable.getSelectedRow(); return row < 0 || row >= recoveryIds.size() ? null : recoveryIds.get(row); }
    @Override protected void render() {
        if (state == null) return;
        heading.setText("CafeLink · Bàn " + client.identity().tableId()); TableView table = table();
        boolean active = table != null && table.visitId() != null;
        String currentVisit = table == null ? null : table.visitId();
        if (!Objects.equals(displayedVisit, currentVisit)) {
            displayedVisit = currentVisit; quantities.values().forEach(s -> s.setValue(0)); orderNote.setText(""); serviceNote.setText(""); billText.setText("");
        }
        visitStatus.setText(active ? "Quán đã mở bàn · Mời bạn chọn đồ uống" : table != null && table.status().equals("SESSION_ENDED") ? "Lượt khách đã kết thúc · Không nhận yêu cầu cho lượt mới" : "Chờ chủ quán mở lượt khách mới"); visitStatus.setForeground(active ? Ui.ACCENT : Ui.COFFEE);
        if (quantities.isEmpty()) for (MenuItem item : state.menu()) {
            JPanel card = new JPanel(new BorderLayout(5, 5)); card.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(new Color(210, 197, 181)), BorderFactory.createEmptyBorder(12, 12, 12, 12)));
            JLabel name = new JLabel(item.name()); name.setFont(new Font("Segoe UI", Font.BOLD, 17)); card.add(name, BorderLayout.NORTH);
            card.add(new JLabel(item.category()), BorderLayout.CENTER);
            JSpinner quantity = new JSpinner(new SpinnerNumberModel(0, 0, 20, 1)); quantity.setPreferredSize(new Dimension(64, 30)); quantity.setName("quantity" + item.id()); quantity.addChangeListener(e -> updateCart()); quantities.put(item.id(), quantity);
            card.add(Ui.row(new JLabel(Ui.money(item.priceVnd())), quantity), BorderLayout.SOUTH); menu.add(card);
        }
        orders.setRowCount(0); for (OrderView order : state.orders()) orders.addRow(new Object[]{order.id(), order.items().stream().map(i -> i.name() + " ×" + i.quantity()).reduce((a,b) -> a + ", " + b).orElse(""), Ui.status(order.status()), Ui.money(order.totalVnd())});
        tickets.setRowCount(0); for (Ticket ticket : state.tickets()) tickets.addRow(new Object[]{ticket.id(), ticket.type().equals("CALL_SERVICE") ? "Gọi nhân viên" : "Tính tiền", Ui.status(ticket.status()), ticket.reply()});
        String selected = selectedRecovery(); recovery.setRowCount(0); recoveryIds.clear();
        for (Outbox.Entry entry : client.recoveryEntries()) { recoveryIds.add(entry.id()); recovery.addRow(new Object[]{"#" + recoveryIds.size(), entry.action().equals("PLACE_ORDER") ? "Đặt món" : entry.action().equals("CALL_SERVICE") ? "Gọi nhân viên" : "Tính tiền", switch(entry.status()) { case "PENDING" -> "Chưa rõ kết quả"; case "CONFIRM_REQUIRED" -> "Cần xác nhận"; case "RESOLVED" -> "Đã xác nhận"; case "STALE" -> "Lượt đã kết thúc"; default -> "Không gửi thêm"; }, entry.detail()}); }
        for (int row = 0; row < recoveryIds.size(); row++) if (selected != null && selected.equals(recoveryIds.get(row))) recoveryTable.setRowSelectionInterval(row, row);
        if (recoveryTable.getSelectedRow() < 0 && recovery.getRowCount() > 0) recoveryTable.setRowSelectionInterval(recovery.getRowCount() - 1, recovery.getRowCount() - 1);
        boolean unresolved = client.recoveryEntries().stream().anyMatch(Outbox::unresolved);
        recover.setEnabled(client.durableRecovery() && client.connected() && !busy); confirmRecovery.setEnabled(recover.isEnabled() && unresolved && active); dismissRecovery.setEnabled(recover.isEnabled() && unresolved);
        boolean ready = active && client.connected() && !busy && !unresolved;
        place.setEnabled(ready); call.setEnabled(ready && !openTicket("CALL_SERVICE")); requestBill.setEnabled(ready && !state.orders().isEmpty() && !openTicket("REQUEST_BILL")); showBill.setEnabled(ready && !state.orders().isEmpty());
        updateCart(); menu.revalidate(); menu.repaint();
    }
    private boolean openTicket(String type) { return state.tickets().stream().anyMatch(t -> t.type().equals(type) && t.status().equals("OPEN")); }
    private void updateCart() { if (state == null) return; long total = state.menu().stream().mapToLong(m -> m.priceVnd() * ((Number)quantities.get(m.id()).getValue()).longValue()).sum(); cartTotal.setText("Đang chọn: " + Ui.money(total)); }
}
