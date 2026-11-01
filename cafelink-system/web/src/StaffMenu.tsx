import { useState } from "react";
import type { MenuItem } from "./models";
import { money } from "./models";
import { MenuPhoto } from "./MenuAdmin";
import { searchText } from "./ui";

export function StaffMenu({menu,disabled,run}:{menu:MenuItem[];disabled:boolean;run:(action:string,data:Record<string,unknown>)=>Promise<unknown>}) {
  const [query,setQuery]=useState("");
  const items=menu.filter(m=>m.active&&searchText(m.name).includes(searchText(query)));
  return <section className="staff-menu"><div className="section-heading"><div><h2>Tình trạng món</h2><p className="muted">Báo hết món để khách chọn đồ uống khác. Quản lý phụ trách giá và nội dung thực đơn.</p></div></div>
    <label>Tìm món<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tên đồ uống"/></label>
    <div className="menu-grid">{items.map(item=><article className="menu-card" key={item.id}><div className="menu-art"><MenuPhoto item={item}/></div><div className="menu-card-content"><h3>{item.name}</h3><p>{money(item.priceVnd)}</p><span className={`pill ${item.available?'green':'amber'}`}>{item.available?'Còn bán':'Tạm hết'}</span><button className="secondary full" disabled={disabled} onClick={()=>void run('SET_MENU_AVAILABILITY',{menuId:item.id,expectedVersion:item.version,available:!item.available})}>{item.available?`Đánh dấu hết ${item.name}`:`Cho bán lại ${item.name}`}</button></div></article>)}</div>
    {!items.length&&<div className="empty">Không có món khớp từ khóa.</div>}
  </section>;
}
