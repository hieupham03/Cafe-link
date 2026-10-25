package com.cafelink.client.ui;

import com.cafelink.client.NetworkClient;
import com.cafelink.common.Json;
import com.cafelink.common.Models.*;
import com.google.gson.JsonObject;
import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.util.List;
import java.util.ArrayList;

public final class AdminFrame extends DashboardFrame {
    private final JPanel cards = new JPanel(new GridLayout(3, 2, 10, 10));
    private final JLabel summary = new JLabel();
    private final DefaultTableModel orderModel = Ui.model("Đơn", "Bàn", "Món", "Trạng thái", "Tổng tiền", "Ghi chú");
    private final DefaultTableModel ticketModel = Ui.model("Yêu cầu", "Bàn", "Loại", "Trạng thái", "Nội dung", "Phản hồi");
    private final JTable orders = Ui.table(orderModel, "orders"), tickets = Ui.table(ticketModel, "tickets");
    private final JButton open = Ui.button("Mở bàn", "openTable"), invoice = Ui.button("Xem hóa đơn", "showBill"), pay = Ui.button("Thanh toán & đóng bàn", "pay"), closeEmpty = Ui.button("Đóng bàn trống", "closeEmpty");
    private final JButton advance = Ui.button("Chuyển bước phục vụ", "advanceOrder"), reply = Ui.button("Phản hồi yêu cầu", "replyTicket");
    private final JTextArea billArea = new JTextArea();
    private final JTabbedPane tabs = new JTabbedPane();
    private int selectedTable = 1;
    private List<OrderView> shownOrders = List.of();
    private List<Ticket> shownTickets = List.of();
    public AdminFrame(NetworkClient client) { this(client, Dialogs.SWING); }
    public AdminFrame(NetworkClient client, Dialogs dialogs) {
        super("CafeLink | Chủ quán", client, dialogs);
        if (!client.identity().role().equals("ADMIN")) throw new IllegalArgumentException("Admin identity required");
        JPanel header = new JPanel(new BorderLayout()); header.add(Ui.title("CafeLink · Quầy phục vụ"), BorderLayout.NORTH); header.add(summary, BorderLayout.CENTER);
        header.add(Ui.row(open, invoice, pay, closeEmpty), BorderLayout.SOUTH); add(header, BorderLayout.NORTH);
        JPanel orderPanel = new JPanel(new BorderLayout()); orderPanel.add(new JScrollPane(orders)); orderPanel.add(Ui.row(advance), BorderLayout.SOUTH);
        JPanel ticketPanel = new JPanel(new BorderLayout()); ticketPanel.add(new JScrollPane(tickets)); ticketPanel.add(Ui.row(reply), BorderLayout.SOUTH);
        billArea.setEditable(false); billArea.setFont(new Font("Consolas", Font.PLAIN, 15)); billArea.setName("billText");
        tabs.addTab("Đơn hàng", orderPanel); tabs.addTab("Yêu cầu phục vụ", ticketPanel); tabs.addTab("Hóa đơn", new JScrollPane(billArea));
        JSplitPane split = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT, cards, tabs); split.setDividerLocation(300); split.setResizeWeight(.25); add(split, BorderLayout.CENTER);
        open.addActionListener(e -> task(() -> client.request("OPEN_TABLE", number("tableId", selectedTable)), r -> feedback.setText("Đã mở bàn " + selectedTable)));
        invoice.addActionListener(e -> { TableView table = selected(); if (table != null && table.visitId() != null) task(() -> client.request("GET_BILL", visit(table.visitId())), r -> { billArea.setText(formatBill(Json.GSON.fromJson(r, Bill.class))); tabs.setSelectedIndex(2); feedback.setText("Hóa đơn được tính bởi server."); }); });
        pay.addActionListener(e -> { TableView table = selected(); if (table != null && dialogs.confirm(this, "Xác nhận đã nhận tiền mặt (mô phỏng) và đóng bàn " + selectedTable + "?")) task(() -> client.request("PAY_AND_CLOSE", visit(table.visitId())), r -> { billArea.setText(formatBill(Json.GSON.fromJson(r, Bill.class)) + "\nĐÃ THANH TOÁN MÔ PHỎNG · Phiếu " + r.get("receiptId").getAsLong()); tabs.setSelectedIndex(2); feedback.setText("Đã thanh toán và kết thúc lượt khách."); }); });
        closeEmpty.addActionListener(e -> { TableView table = selected(); if (table != null && dialogs.confirm(this, "Đóng lượt khách của bàn trống?")) task(() -> client.request("CLOSE_EMPTY_TABLE", visit(table.visitId())), r -> feedback.setText("Đã đóng bàn trống.")); });
        advance.addActionListener(e -> { OrderView order = selectedOrder(); if (order != null) { JsonObject data = number("orderId", order.id()); data.addProperty("status", Ui.nextStatus(order.status())); task(() -> client.request("SET_ORDER_STATUS", data), r -> feedback.setText("Đã cập nhật đơn " + order.id())); } });
        reply.addActionListener(e -> { Ticket ticket = selectedTicket(); if (ticket != null) { String text = dialogs.input(this, "Phản hồi cho bàn " + ticket.tableId() + ":"); if (text != null && !text.isBlank()) { JsonObject data = number("ticketId", ticket.id()); data.addProperty("reply", text); task(() -> client.request("HANDLE_TICKET", data), r -> feedback.setText("Đã gửi phản hồi.")); } } });
        orders.getSelectionModel().addListSelectionListener(e -> updateButtons()); tickets.getSelectionModel().addListSelectionListener(e -> updateButtons());
        setSize(1180, 740); setMinimumSize(new Dimension(950, 600)); setLocationRelativeTo(null); subscribe();
    }
    private TableView selected() { return state == null ? null : state.tables().stream().filter(t -> t.id() == selectedTable).findFirst().orElse(null); }
    private OrderView selectedOrder() { int row = orders.getSelectedRow(); return row >= 0 && row < shownOrders.size() ? shownOrders.get(row) : null; }
    private Ticket selectedTicket() { int row = tickets.getSelectedRow(); return row >= 0 && row < shownTickets.size() ? shownTickets.get(row) : null; }
    @Override protected void render() {
        if (state == null) return;
        summary.setText("Đang chọn bàn " + selectedTable + " · " + state.orders().size() + " đơn trong quán · " + state.tables().stream().mapToInt(TableView::onlineClients).sum() + " kết nối khách");
        cards.removeAll();
        for (TableView table : state.tables()) {
            long total = state.orders().stream().filter(o -> o.tableId() == table.id()).mapToLong(OrderView::totalVnd).sum();
            JButton card = Ui.button("<html><b>" + table.name() + "</b><br>" + (table.visitId() == null ? "Sẵn sàng" : "Đang phục vụ") + "<br>Khách online: " + table.onlineClients() + "<br>" + Ui.money(total) + "</html>", "table" + table.id());
            card.setBackground(table.visitId() == null ? new Color(220, 237, 225) : new Color(250, 224, 179));
            card.setBorder(BorderFactory.createLineBorder(table.id() == selectedTable ? Ui.COFFEE : Color.LIGHT_GRAY, table.id() == selectedTable ? 3 : 1));
            card.addActionListener(e -> { selectedTable = table.id(); render(); }); cards.add(card);
        }
        long oldOrder = selectedOrder() == null ? -1 : selectedOrder().id(); long oldTicket = selectedTicket() == null ? -1 : selectedTicket().id();
        shownOrders = new ArrayList<>(state.orders().stream().filter(o -> o.tableId() == selectedTable).toList());
        shownTickets = new ArrayList<>(state.tickets().stream().filter(t -> t.tableId() == selectedTable).toList());
        orderModel.setRowCount(0);
        for (OrderView o : shownOrders) orderModel.addRow(new Object[]{o.id(), o.tableId(), o.items().stream().map(i -> i.name() + " ×" + i.quantity()).reduce((a,b) -> a + ", " + b).orElse(""), Ui.status(o.status()), Ui.money(o.totalVnd()), o.note()});
        ticketModel.setRowCount(0); for (Ticket t : shownTickets) ticketModel.addRow(new Object[]{t.id(), t.tableId(), t.type().equals("CALL_SERVICE") ? "Gọi nhân viên" : "Tính tiền", Ui.status(t.status()), t.note(), t.reply()});
        selectRow(orders, shownOrders.stream().map(OrderView::id).toList(), oldOrder); selectRow(tickets, shownTickets.stream().map(Ticket::id).toList(), oldTicket);
        updateButtons(); cards.revalidate(); cards.repaint();
    }
    private static void selectRow(JTable table, List<Long> ids, long id) { if (!ids.isEmpty()) { int row = ids.indexOf(id); table.setRowSelectionInterval(row < 0 ? 0 : row, row < 0 ? 0 : row); } }
    private void updateButtons() {
        TableView table = selected(); boolean ready = !busy && client.connected() && table != null;
        boolean active = ready && table.visitId() != null;
        open.setEnabled(ready && !active); invoice.setEnabled(active && !shownOrders.isEmpty());
        boolean ticketsDone = shownTickets.stream().noneMatch(t -> t.status().equals("OPEN"));
        pay.setEnabled(active && !shownOrders.isEmpty() && shownOrders.stream().allMatch(o -> o.status().equals("SERVED")) && ticketsDone);
        closeEmpty.setEnabled(active && shownOrders.isEmpty() && ticketsDone);
        OrderView order = selectedOrder(); advance.setEnabled(ready && order != null && Ui.nextStatus(order.status()) != null);
        Ticket ticket = selectedTicket(); reply.setEnabled(ready && ticket != null && ticket.status().equals("OPEN"));
    }
    static JsonObject number(String name, long value) { JsonObject d = new JsonObject(); d.addProperty(name, value); return d; }
    static JsonObject visit(String id) { JsonObject d = new JsonObject(); d.addProperty("visitId", id); return d; }
    public static String formatBill(Bill bill) {
        StringBuilder text = new StringBuilder("CAFELINK · HÓA ĐƠN\nBàn " + bill.tableId() + "\n\n");
        for (OrderView order : bill.orders()) { text.append("Đơn #").append(order.id()).append('\n'); for (OrderItem item : order.items()) text.append("  ").append(item.name()).append(" × ").append(item.quantity()).append("   ").append(Ui.money(item.subtotalVnd())).append('\n'); }
        return text.append("\nTỔNG CỘNG: ").append(Ui.money(bill.totalVnd())).toString();
    }
}
