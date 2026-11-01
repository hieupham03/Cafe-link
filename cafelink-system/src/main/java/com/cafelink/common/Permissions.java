package com.cafelink.common;

import com.cafelink.common.Models.Identity;
import com.google.gson.JsonObject;
import java.util.Set;

/** The operator role may serve customers, but cannot administer money or accounts. */
public final class Permissions {
    private Permissions() { }
    private static final Set<String> STAFF_ACTIONS = Set.of(
        "ACCEPT_ORDER", "SET_ORDER_STATUS", "HANDLE_TICKET", "RESOLVE_ORDER",
        "SET_MENU_AVAILABILITY", "GET_TABLE_QR", "GET_VISIT_QR",
        "GET_NOTIFICATIONS", "MARK_NOTIFICATION_READ");

    public static boolean operator(Identity who) {
        return who != null && Set.of("ADMIN", "STAFF").contains(who.role());
    }
    public static boolean staffAllowed(String action, JsonObject input) {
        return STAFF_ACTIONS.contains(action) && (!action.equals("RESOLVE_ORDER")
            || input.has("resolution") && input.get("resolution").isJsonPrimitive()
                && input.get("resolution").getAsString().equals("CANCEL_UNPAID"));
    }
}
