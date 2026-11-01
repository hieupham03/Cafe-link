package com.cafelink.server;

import com.cafelink.common.Models.Identity;
import com.google.gson.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.sql.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class FinanceTest {
    @TempDir Path temp;
    static JsonObject j(String json) { return JsonParser.parseString(json).getAsJsonObject(); }
    static final JsonObject RANGE = j("{\"fromDate\":\"2026-01-01\",\"toDate\":\"2026-12-31\"}");
    CafeService service(Path path, boolean prepaid) throws Exception { return new CafeService(path, new QrConfig(new byte[32], Clock.systemUTC()), prepaid); }
    Identity owner(CafeService s) throws Exception { return s.authenticate("admin", "CafeLink@123"); }
    Identity guest(CafeService s, Identity a) throws Exception {
        String visit = s.execute(a, "OPEN_TABLE", j("{\"tableId\":1}")).get("visitId").getAsString();
        return s.joinVisit(s.execute(a, "GET_VISIT_QR", j("{\"visitId\":\"" + visit + "\"}")).get("grant").getAsString());
    }
    void tax(CafeService s, Identity a, int rate, boolean inclusive) throws Exception {
        long version = s.execute(a, "GET_TAX_SETTINGS", j("{}")).get("version").getAsLong();
        s.execute(a, "SAVE_TAX_SETTINGS", j("{\"enabled\":true,\"rateBps\":" + rate + ",\"name\":\"VAT\",\"inclusive\":" + inclusive + ",\"expectedVersion\":" + version + "}"));
    }
    JsonObject order(CafeService s, Identity g) throws Exception {
        long version = s.snapshot(g, Map.of()).taxSettings().version();
        return s.execute(g, "PLACE_ORDER", j("{\"visitId\":\"" + g.visitId() + "\",\"expectedTaxVersion\":" + version + ",\"items\":[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]}"));
    }
    JsonObject paid(CafeService s, Identity g, long id) throws Exception {
        JsonObject p = s.execute(g, "START_ORDER_PAYMENT", j("{\"visitId\":\"" + g.visitId() + "\",\"orderId\":" + id + "}"));
        p.addProperty("outcome", "SUCCESS"); return s.execute(g, "SIMULATE_PAYMENT", p);
    }

    @Test void taxIsLockedAtOrderAndReceiptAndPaymentMatchAfterSettingsChange() throws Exception {
        try (CafeService s = service(temp.resolve("tax.db"), true)) {
            var a = owner(s); var g = guest(s, a); tax(s, a, 800, false);
            var order = order(s, g); assertEquals(32400, order.get("totalVnd").getAsLong());
            tax(s, a, 1000, true);
            var payment = paid(s, g, order.get("orderId").getAsLong()); assertEquals(32400, payment.get("amountVnd").getAsLong());
            var receipt = s.execute(g, "GET_SALES_RECEIPT", j("{\"receiptId\":\"order-" + payment.get("paymentId").getAsString() + "\"}"));
            assertEquals(30000, receipt.get("subtotalVnd").getAsLong()); assertEquals(2400, receipt.get("taxVnd").getAsLong());
            assertEquals(800, receipt.getAsJsonArray("orders").get(0).getAsJsonObject().get("taxRateBps").getAsInt());
            var second = order(s, g); assertEquals(30000, second.get("totalVnd").getAsLong());
            var row = s.snapshot(g, Map.of()).orders().get(0); assertEquals(2727, row.taxVnd()); assertEquals(27273, row.subtotalVnd());
        }
    }

    @Test void staleTaxAndInvalidSettingsRollbackAndGuestsCannotManageFinance() throws Exception {
        try (CafeService s = service(temp.resolve("guards.db"), true)) {
            var a = owner(s); var g = guest(s, a); tax(s, a, 800, false);
            for (String action : List.of("SAVE_TAX_SETTINGS", "GET_TAX_SETTINGS", "CREATE_CASH_ENTRY", "VOID_CASH_ENTRY", "GET_FINANCE_REPORT", "GET_CASH_ENTRIES"))
                assertEquals("FORBIDDEN", assertThrows(BusinessException.class, () -> s.execute(g, action, j("{}"))).code());
            assertEquals("TAX_CHANGED", assertThrows(BusinessException.class, () -> s.execute(g, "PLACE_ORDER", j("{\"visitId\":\"" + g.visitId() + "\",\"expectedTaxVersion\":0,\"items\":[{\"menuId\":2,\"quantity\":1,\"expectedVersion\":1,\"expectedPriceVnd\":30000}]}"))).code());
            assertTrue(s.snapshot(g, Map.of()).orders().isEmpty());
            assertThrows(BusinessException.class, () -> tax(s, a, 10001, false));
            assertEquals(800, s.snapshot(g, Map.of()).taxSettings().rateBps());
            assertEquals("VERSION_CONFLICT", assertThrows(BusinessException.class, () -> s.execute(a, "SAVE_TAX_SETTINGS", j("{\"expectedVersion\":0}"))).code());
        }
    }

    @Test void manualEntriesAreIdempotentAuditedAndDurable() throws Exception {
        Path path = temp.resolve("cash.db"); long id;
        try (CafeService s = service(path, true)) {
            var a = owner(s); tax(s, a, 850, true);
            var input = j("{\"kind\":\"EXPENSE\",\"amountVnd\":120000,\"category\":\"Nguyên liệu\",\"note\":\"Cà phê\",\"entryDate\":\"2026-10-31\"}");
            var result = s.execute(a, "expense-once", "CREATE_CASH_ENTRY", input); id = result.get("entryId").getAsLong();
            assertEquals(result, s.execute(a, "expense-once", "CREATE_CASH_ENTRY", input));
            var totals = s.execute(a, "GET_FINANCE_REPORT", RANGE).getAsJsonObject("totals"); assertEquals(-120000, totals.get("netVnd").getAsLong());
            for (String value : List.of("0", "-1", "1.5", "1000000001")) { input.add("amountVnd", JsonParser.parseString(value)); assertThrows(BusinessException.class, () -> s.execute(a, "CREATE_CASH_ENTRY", input)); }
        }
        try (CafeService s = service(path, true)) {
            var a = owner(s); assertEquals(850, s.execute(a, "GET_TAX_SETTINGS", j("{}")).get("rateBps").getAsInt());
            assertEquals(1, s.execute(a, "GET_CASH_ENTRIES", RANGE).getAsJsonArray("entries").size());
            var cancel = j("{\"entryId\":" + id + ",\"reason\":\"Nhập nhầm chứng từ\"}");
            s.execute(a, "void-once", "VOID_CASH_ENTRY", cancel); s.execute(a, "void-once", "VOID_CASH_ENTRY", cancel);
            assertEquals(0, s.execute(a, "GET_FINANCE_REPORT", RANGE).getAsJsonObject("totals").get("outflowVnd").getAsLong());
            var row = s.execute(a, "GET_CASH_ENTRIES", RANGE).getAsJsonArray("entries").get(0).getAsJsonObject();
            assertEquals("Nhập nhầm chứng từ", row.get("voidReason").getAsString()); assertEquals("admin", row.get("voidedBy").getAsString());
        }
    }

    @Test void reportUsesPaymentAndRefundDatesInVietnamAndIgnoresUnpaidOrders() throws Exception {
        Path path = temp.resolve("dates.db");
        try (CafeService s = service(path, true)) {
            var a = owner(s); var g = guest(s, a); tax(s, a, 1000, false);
            var order = order(s, g); paid(s, g, order.get("orderId").getAsLong()); order(s, g);
            s.execute(a, "RESOLVE_ORDER", j("{\"orderId\":" + order.get("orderId") + ",\"resolution\":\"REFUND\",\"reason\":\"Hết món\"}"));
        }
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + path); Statement sql = c.createStatement()) {
            sql.execute("UPDATE order_payments SET updated_at='2026-10-30T17:00:00Z' WHERE state='PAID'");
            sql.execute("UPDATE order_resolutions SET created_at='2026-10-31T17:00:00.001Z'");
        }
        try (CafeService s = service(path, true)) {
            var a = owner(s);
            var sale = s.execute(a, "GET_FINANCE_REPORT", j("{\"fromDate\":\"2026-10-31\",\"toDate\":\"2026-10-31\"}")).getAsJsonObject("totals");
            assertEquals(33000, sale.get("salesVnd").getAsLong()); assertEquals(3000, sale.get("netTaxVnd").getAsLong()); assertEquals(0, sale.get("refundsVnd").getAsLong());
            var refund = s.execute(a, "GET_FINANCE_REPORT", j("{\"fromDate\":\"2026-11-01\",\"toDate\":\"2026-11-01\"}")).getAsJsonObject("totals");
            assertEquals(0, refund.get("salesVnd").getAsLong()); assertEquals(-33000, refund.get("netVnd").getAsLong()); assertEquals(-3000, refund.get("netTaxVnd").getAsLong());
        }
    }

    @Test void fullReportIsNotLimitedByLedgerPageAndDateRangeIsValidated() throws Exception {
        try (CafeService s = service(temp.resolve("pages.db"), true)) {
            var a = owner(s);
            for (int i = 0; i < 55; i++) s.execute(a, "CREATE_CASH_ENTRY", j("{\"kind\":\"INCOME\",\"amountVnd\":1000,\"category\":\"Thu khác\",\"entryDate\":\"2026-10-31\"}"));
            assertEquals(55000, s.execute(a, "GET_FINANCE_REPORT", RANGE).getAsJsonObject("totals").get("incomeVnd").getAsLong());
            var page = s.execute(a, "GET_CASH_ENTRIES", RANGE); assertTrue(page.get("hasMore").getAsBoolean()); assertEquals(50, page.getAsJsonArray("entries").size());
            var cursor = RANGE.deepCopy(); cursor.add("beforeId", page.getAsJsonArray("entries").get(49).getAsJsonObject().get("id"));
            assertEquals(5, s.execute(a, "GET_CASH_ENTRIES", cursor).getAsJsonArray("entries").size());
            assertThrows(BusinessException.class, () -> s.execute(a, "GET_FINANCE_REPORT", j("{\"fromDate\":\"2026-11-01\",\"toDate\":\"2026-10-01\"}")));
            assertThrows(BusinessException.class, () -> s.execute(a, "GET_FINANCE_REPORT", j("{\"fromDate\":\"2026-02-30\",\"toDate\":\"2026-10-01\"}")));
        }
    }

    @Test void postpayBillIncludesTaxAndIsCountedOnce() throws Exception {
        try (CafeService s = service(temp.resolve("postpay.db"), false)) {
            var a = owner(s); var g = guest(s, a); tax(s, a, 1000, false); var order = order(s, g);
            for (String status : List.of("PREPARING", "READY", "SERVED")) s.execute(a, "SET_ORDER_STATUS", j("{\"orderId\":" + order.get("orderId") + ",\"status\":\"" + status + "\"}"));
            var bill = s.execute(a, "GET_BILL", j("{\"visitId\":\"" + g.visitId() + "\"}")); assertEquals(33000, bill.get("totalVnd").getAsLong());
            var checkout = j("{\"visitId\":\"" + g.visitId() + "\",\"expectedVisitVersion\":" + bill.get("billVersion") + ",\"expectedCheckoutVersion\":0}");
            s.execute(g, "REQUEST_CHECKOUT", checkout);
            checkout.addProperty("expectedVisitVersion", bill.get("billVersion").getAsLong() + 1); checkout.addProperty("expectedCheckoutVersion", 1); s.execute(a, "ACK_CHECKOUT", checkout);
            bill = s.execute(a, "GET_BILL", j("{\"visitId\":\"" + g.visitId() + "\"}"));
            s.execute(a, "PAY_AND_CLOSE", j("{\"visitId\":\"" + g.visitId() + "\",\"expectedBillVersion\":" + bill.get("billVersion") + ",\"expectedTotalVnd\":33000}"));
            String day = LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")).toString();
            var totals = s.execute(a, "GET_FINANCE_REPORT", j("{\"fromDate\":\"" + day + "\",\"toDate\":\"" + day + "\"}")).getAsJsonObject("totals");
            assertEquals(33000, totals.get("salesVnd").getAsLong()); assertEquals(3000, totals.get("taxVnd").getAsLong());
        }
    }

    @Test void schemaElevenMigrationPreservesExistingPaymentsWithoutAddingTax() throws Exception {
        Path path = temp.resolve("migration.db"); String paymentId;
        try (CafeService s = service(path, true)) { var a = owner(s); var g = guest(s, a); paymentId = paid(s, g, order(s, g).get("orderId").getAsLong()).get("paymentId").getAsString(); }
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + path); Statement sql = c.createStatement()) { MigrationFixtures.removeFinance(sql); sql.execute("PRAGMA user_version=11"); }
        for (int i = 0; i < 2; i++) try (CafeService s = service(path, true)) {
            var a = owner(s); tax(s, a, 800, false);
            var receipt = s.execute(a, "GET_SALES_RECEIPT", j("{\"receiptId\":\"order-" + paymentId + "\"}"));
            assertEquals(30000, receipt.get("totalVnd").getAsLong()); assertEquals(0, receipt.get("taxVnd").getAsLong());
        }
    }
}
