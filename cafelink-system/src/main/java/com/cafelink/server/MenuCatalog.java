package com.cafelink.server;
import com.cafelink.common.*;
import com.cafelink.common.Models.MenuItem;
import com.google.gson.*;
import java.sql.*;
import java.util.*;
final class MenuCatalog {
    private final Database db;
    MenuCatalog(Database db){this.db=db;}
    static MenuItem row(ResultSet r)throws SQLException{return new MenuItem(r.getInt("id"),r.getString("name"),r.getLong("price_vnd"),r.getString("category"),r.getString("description"),r.getString("image_url"),r.getBoolean("available"),r.getBoolean("active"),r.getLong("version"),r.getInt("sort_order"),r.getLong("purchase_version"));}
    List<MenuItem> list(boolean admin)throws SQLException{return db.query("SELECT m.* FROM menu m LEFT JOIN menu_categories c ON c.name=m.category "+(admin?"":"WHERE m.active=1 ")+"ORDER BY c.sort_order,m.sort_order,m.id",MenuCatalog::row);}
    JsonObject save(JsonObject d,boolean create)throws SQLException{
        String name=CafeService.text(d,"name",100,true),category=CafeService.text(d,"category",80,true),description=CafeService.text(d,"description",1000,false),image=CafeService.text(d,"imageUrl",100,false);
        int price=CafeService.integer(d,"priceVnd"),sort=d.has("sortOrder")?CafeService.integer(d,"sortOrder"):0;
        if(price<1000||price>10000000||sort<0||sort>10000)throw new BusinessException("INVALID_INPUT","Giá từ 1.000 đến 10.000.000đ, thứ tự từ 0 đến 10.000.");
        if(!image.isEmpty()&&!image.matches("/media/[a-f0-9]{64}\\.jpg"))throw new BusinessException("INVALID_INPUT","Chỉ chọn ảnh đã tải lên máy chủ.");
        int available=bool(d,"available"),active=bool(d,"active");
        db.update("INSERT OR IGNORE INTO menu_categories(name) VALUES(?)",category);
        long id;
        if(create)id=db.insert("INSERT INTO menu(name,price_vnd,category,description,image_url,available,active,sort_order) VALUES(?,?,?,?,?,?,?,?)",name,price,category,description,image,available,active,sort);
        else{
            id=CafeService.integer(d,"menuId");
            int changed=db.update("UPDATE menu SET name=?,price_vnd=?,category=?,description=?,image_url=?,available=?,active=?,sort_order=?,purchase_version=purchase_version+CASE WHEN name<>? OR price_vnd<>? OR available<>? OR active<>? THEN 1 ELSE 0 END,version=version+1 WHERE id=? AND version=?",name,price,category,description,image,available,active,sort,name,price,available,active,id,CafeService.integer(d,"expectedVersion"));
            if(changed!=1)throw new BusinessException("VERSION_CONFLICT","Món đã thay đổi. Tải lại danh mục trước khi lưu.");
        }
        return Json.object(db.query("SELECT * FROM menu WHERE id=?",MenuCatalog::row,id).get(0));
    }
    static int bool(JsonObject d,String field){if(!d.has(field)||!d.get(field).isJsonPrimitive()||!d.getAsJsonPrimitive(field).isBoolean())throw new BusinessException("INVALID_INPUT","Thiếu trạng thái "+field);return d.get(field).getAsBoolean()?1:0;}
    JsonObject categories()throws SQLException{JsonObject o=new JsonObject();o.add("categories",Json.GSON.toJsonTree(db.query("SELECT * FROM menu_categories ORDER BY sort_order,name",r->Map.of("name",r.getString("name"),"sortOrder",r.getInt("sort_order"),"version",r.getInt("version")))));return o;}
    JsonObject category(JsonObject d,boolean remove)throws SQLException{
        String old=CafeService.text(d,"originalName",80,false),name=CafeService.text(d,"name",80,true);
        if(!remove&&(CafeService.integer(d,"sortOrder")<0||CafeService.integer(d,"sortOrder")>10000))throw new BusinessException("INVALID_INPUT","Thứ tự nhóm từ 0 đến 10.000.");
        if(remove){if(!db.query("SELECT id FROM menu WHERE category=?",r->r.getInt(1),name).isEmpty())throw new BusinessException("CATEGORY_IN_USE","Chuyển các món sang nhóm khác trước khi xóa nhóm.");if(db.update("DELETE FROM menu_categories WHERE name=? AND version=?",name,CafeService.integer(d,"expectedVersion"))!=1)throw new BusinessException("VERSION_CONFLICT","Nhóm đã thay đổi.");}
        else if(old.isEmpty()){if(!db.query("SELECT name FROM menu_categories WHERE name=?",r->r.getString(1),name).isEmpty())throw new BusinessException("INVALID_INPUT","Nhóm này đã tồn tại.");db.update("INSERT INTO menu_categories(name,sort_order) VALUES(?,?)",name,CafeService.integer(d,"sortOrder"));}
        else{if(!old.equals(name)&&!db.query("SELECT name FROM menu_categories WHERE name=?",r->r.getString(1),name).isEmpty())throw new BusinessException("INVALID_INPUT","Tên nhóm đã tồn tại.");if(db.update("UPDATE menu_categories SET name=?,sort_order=?,version=version+1 WHERE name=? AND version=?",name,CafeService.integer(d,"sortOrder"),old,CafeService.integer(d,"expectedVersion"))!=1)throw new BusinessException("VERSION_CONFLICT","Nhóm đã thay đổi.");db.update("UPDATE menu SET category=?,version=version+1 WHERE category=?",name,old);}
        return categories();
    }
}
