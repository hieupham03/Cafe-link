package com.cafelink.client;

import com.cafelink.common.Arguments;
import com.cafelink.client.ui.*;
import javax.swing.SwingUtilities;

public final class ClientMain {
    public static void main(String[] args) {
        Arguments options = new Arguments(args);
        SwingUtilities.invokeLater(() -> { Ui.setup(); new LoginFrame(options.get("host", "127.0.0.1"), options.integer("port", 5050), options.get("username", "ban1")).setVisible(true); });
    }
}
