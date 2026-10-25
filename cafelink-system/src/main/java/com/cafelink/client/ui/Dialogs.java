package com.cafelink.client.ui;

import java.awt.Component;
import javax.swing.JOptionPane;

/** User interaction boundary, replaceable in UI workflow tests without replacing the network. */
public interface Dialogs {
    void info(Component parent, String text);
    void error(Component parent, String text);
    boolean confirm(Component parent, String text);
    String input(Component parent, String text);
    Dialogs SWING = new Dialogs() {
        public void info(Component p, String t) { JOptionPane.showMessageDialog(p, t, "CafeLink", JOptionPane.INFORMATION_MESSAGE); }
        public void error(Component p, String t) { JOptionPane.showMessageDialog(p, t, "CafeLink", JOptionPane.ERROR_MESSAGE); }
        public boolean confirm(Component p, String t) { return JOptionPane.showConfirmDialog(p, t, "Xác nhận", JOptionPane.YES_NO_OPTION) == JOptionPane.YES_OPTION; }
        public String input(Component p, String t) { return JOptionPane.showInputDialog(p, t, "Phản hồi khách", JOptionPane.QUESTION_MESSAGE); }
    };
}
