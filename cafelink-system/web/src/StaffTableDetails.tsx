import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "./api";
import type { Table, Order } from "./models";
import { statusName } from "./models";
import { OrderTotals } from "./OrderTotals";
export function StaffTableDetails({table,orders,csrf}:{table?:Table;orders:Order[];csrf:string}) {
  const [url,setUrl]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let live=true;setUrl('');setError('');if(table&&((table.automatic&&table.acceptingOrders)||(!table.automatic&&table.visitId)))void api.command<{joinUrl:string}>(csrf,table.automatic?'GET_TABLE_QR':'GET_VISIT_QR',table.automatic?{tableId:table.id}:{visitId:table.visitId}).then(value=>{if(live)setUrl(value.joinUrl);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[csrf,table?.id,table?.visitId,table?.automatic,table?.acceptingOrders]);
  return <section className="qr-panel">{error&&<p className="error" role="alert">{error}</p>}{url?<div className="qr-card"><h3>QR gọi món · {table?.name}</h3><QRCodeSVG value={url} size={220} marginSize={4} title="QR gọi món tại bàn"/><a href={url} target="_blank" rel="noreferrer">Mở trang đặt món</a></div>:<p className="muted">Bàn đang tạm ngưng. Nhờ quản lý bấm “Mở tất cả bàn” để bật nhận khách và tải QR.</p>}<h3 className="spaced">Đơn đang xử lý ({orders.length})</h3>{!orders.length&&<p className="muted">Bàn chưa có đơn đang xử lý.</p>}{orders.map(order=><article className="table-order" key={order.id}><div className="section-heading"><strong>Đơn #{order.id}</strong><span className="pill">{order.acceptanceState==='WAITING'?'Chờ tiếp nhận':['UNPAID','PENDING'].includes(order.paymentState??'')?'Chờ thanh toán':statusName[order.status]}</span></div><ul>{order.items.map((i,n)=><li key={n}>{i.quantity}× {i.name}{i.note&&` · ${i.note}`}</li>)}</ul><OrderTotals order={order}/></article>)}</section>;
}
