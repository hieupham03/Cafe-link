package com.cafelink.client.ui;

import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.text.NumberFormat;
import java.util.Locale;

public final class Ui {
    public static final Color BACKGROUND = new Color(249, 246, 240), COFFEE = new Color(84, 53, 37), ACCENT = new Color(25, 113, 100);
    private Ui() { }
    public static void setup() {
        UIManager.put("Panel.background", BACKGROUND); UIManager.put("Label.font", new Font("Segoe UI", Font.PLAIN, 14));
        UIManager.put("Button.font", new Font("Segoe UI", Font.BOLD, 14)); UIManager.put("TextField.font", new Font("Segoe UI", Font.PLAIN, 14));
        UIManager.put("Table.font", new Font("Segoe UI", Font.PLAIN, 13)); UIManager.put("TableHeader.font", new Font("Segoe UI", Font.BOLD, 13));
    }
    public static JButton button(String text, String name) { JButton b = new JButton(text); b.setName(name); b.setFocusPainted(false); return b; }
    public static JLabel title(String text) { JLabel l = new JLabel(text); l.setFont(new Font("Segoe UI", Font.BOLD, 24)); l.setForeground(COFFEE); return l; }
    public static JPanel row(Component... components) { JPanel p = new JPanel(new FlowLayout(FlowLayout.LEFT, 10, 8)); for (Component c : components) p.add(c); return p; }
    public static DefaultTableModel model(String... columns) { return new DefaultTableModel(columns, 0) { @Override public boolean isCellEditable(int r, int c) { return false; } }; }
    public static JTable table(DefaultTableModel model, String name) { JTable t = new JTable(model); t.setName(name); t.setRowHeight(30); t.setSelectionMode(ListSelectionModel.SINGLE_SELECTION); t.getTableHeader().setReorderingAllowed(false); return t; }
    public static String money(long value) { return NumberFormat.getIntegerInstance(Locale.forLanguageTag("vi-VN")).format(value) + " đ"; }
    public static String status(String value) { return switch (value) {
        case "SUBMITTED" -> "Chờ tiếp nhận"; case "PREPARING" -> "Đang chuẩn bị"; case "READY" -> "Sẵn sàng"; case "SERVED" -> "Đã phục vụ";
        case "OPEN" -> "Chờ xử lý"; case "HANDLED" -> "Đã phản hồi"; default -> value;
    }; }
    public static String nextStatus(String current) { return switch (current) { case "SUBMITTED" -> "PREPARING"; case "PREPARING" -> "READY"; case "READY" -> "SERVED"; default -> null; }; }
}
