package com.cafelink.common;

import java.util.List;

public final class Models {
    private Models() { }
    public record Identity(String username, String role, Integer tableId, String credential,
                           String membershipId, String visitId, String storeId) {
        public Identity(String username, String role, Integer tableId, String credential) {
            this(username, role, tableId, credential, null, null, null);
        }
        @Override public String toString() { return "Identity[username=" + username + ",role=" + role + ",tableId=" + tableId + ",membershipId=" + membershipId + ",credential=<redacted>]"; }
    }
    public record MenuItem(int id, String name, long priceVnd, String category,String description,String imageUrl,boolean available,boolean active,long version,int sortOrder,long purchaseVersion) {
        public MenuItem(int id,String name,long priceVnd,String category,String description,String imageUrl,boolean available,boolean active,long version,int sortOrder){this(id,name,priceVnd,category,description,imageUrl,available,active,version,sortOrder,version);}
        public MenuItem(int id,String name,long priceVnd,String category){this(id,name,priceVnd,category,"","",true,true,1,0);}
    }
    public record TableView(int id, String name, String visitId, String status, int onlineClients, String visitState, long version,String paymentMode,boolean automatic,boolean acceptingOrders,int activeSessions) {
        public TableView(int id,String name,String visitId,String status,int onlineClients,String visitState,long version,String paymentMode){this(id,name,visitId,status,onlineClients,visitState,version,paymentMode,false,false,visitId==null?0:1);}
        public TableView(int id,String name,String visitId,String status,int onlineClients){this(id,name,visitId,status,onlineClients,null,0,"POSTPAY");}
    }
    public record OrderItem(int menuId, String name, int quantity, long unitPriceVnd, long subtotalVnd,String note) {
        public OrderItem(int menuId,String name,int quantity,long unitPriceVnd,long subtotalVnd){this(menuId,name,quantity,unitPriceVnd,subtotalVnd,"");}
    }
    public record TaxSettings(boolean enabled, int rateBps, String name, boolean inclusive, long version) { }
    public record OrderView(long id, int tableId, String visitId, String status, String note, long totalVnd, String createdAt, List<OrderItem> items,String paymentState,String queuedAt,long subtotalVnd,long taxVnd,int taxRateBps,String taxName,boolean taxInclusive) {
        public OrderView(long id,int tableId,String visitId,String status,String note,long totalVnd,String createdAt,List<OrderItem> items,String paymentState,String queuedAt){this(id,tableId,visitId,status,note,totalVnd,createdAt,items,paymentState,queuedAt,totalVnd,0,0,"VAT",false);}
        public OrderView(long id,int tableId,String visitId,String status,String note,long totalVnd,String createdAt,List<OrderItem> items,String paymentState){this(id,tableId,visitId,status,note,totalVnd,createdAt,items,paymentState,createdAt);}
        public OrderView(long id,int tableId,String visitId,String status,String note,long totalVnd,String createdAt,List<OrderItem> items){this(id,tableId,visitId,status,note,totalVnd,createdAt,items,"POSTPAY");}
    }
    public record Ticket(long id, int tableId, String visitId, String type, String status, String note, String reply, String createdAt,long version) {
        public Ticket(long id,int tableId,String visitId,String type,String status,String note,String reply,String createdAt){this(id,tableId,visitId,type,status,note,reply,createdAt,0);}
    }
    public record Checkout(String checkoutId,String visitId,int tableId,String state,long version,int cycle,String createdAt,String updatedAt) { }
    public record Bill(String visitId, int tableId, long totalVnd, List<OrderView> orders,long billVersion,long checkoutVersion,long subtotalVnd,long taxVnd) {
        public Bill(String visitId,int tableId,long totalVnd,List<OrderView> orders,long billVersion,long checkoutVersion){this(visitId,tableId,totalVnd,orders,billVersion,checkoutVersion,orders.stream().mapToLong(OrderView::subtotalVnd).sum(),orders.stream().mapToLong(OrderView::taxVnd).sum());}
        public Bill(String visitId,int tableId,long totalVnd,List<OrderView> orders){this(visitId,tableId,totalVnd,orders,0,0);}
    }
    public record Snapshot(long revision, List<MenuItem> menu, List<TableView> tables, List<OrderView> orders, List<Ticket> tickets,List<Checkout> checkouts,List<com.google.gson.JsonObject> resolutions,boolean storeAcceptingOrders,TaxSettings taxSettings) {
        public Snapshot(long revision,List<MenuItem> menu,List<TableView> tables,List<OrderView> orders,List<Ticket> tickets,List<Checkout> checkouts,List<com.google.gson.JsonObject> resolutions,boolean storeAcceptingOrders){this(revision,menu,tables,orders,tickets,checkouts,resolutions,storeAcceptingOrders,null);}
        public Snapshot(long revision,List<MenuItem> menu,List<TableView> tables,List<OrderView> orders,List<Ticket> tickets,List<Checkout> checkouts,List<com.google.gson.JsonObject> resolutions){this(revision,menu,tables,orders,tickets,checkouts,resolutions,true);}
        public Snapshot(long revision,List<MenuItem> menu,List<TableView> tables,List<OrderView> orders,List<Ticket> tickets,List<Checkout> checkouts){this(revision,menu,tables,orders,tickets,checkouts,List.of());}
    }
}
