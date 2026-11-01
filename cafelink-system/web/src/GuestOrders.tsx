import type { Order, OrderResolution } from './models';
import { money, statusName } from './models';
import { WaitTime } from './ui';
import { GuestSectionHeading } from './GuestSectionHeading';
import { OrderTotals } from './OrderTotals';

export function GuestOrders({orders,resolutions=[],previous=false}:{orders:Order[];resolutions?:OrderResolution[];previous?:boolean}) {
  return <section id={previous?'guest-previous-orders':'guest-orders'} className="guest-zone" data-guest-zone="orders" data-testid={previous?'previous-orders':'current-orders'} aria-labelledby={previous?'guest-previous-orders-heading':'guest-orders-heading'}>
    <GuestSectionHeading id={previous?'guest-previous-orders-heading':'guest-orders-heading'} icon="receipt" title={previous?'Đơn đã hoàn tất trước đó':'Đơn đã gọi'} description={previous?'Xem lại các lần đặt trước của bạn.':'Theo dõi món đã gửi và tiến độ phục vụ của quán.'} meta={`${orders.length} đơn`} />
    {!orders.length&&<p className="muted">Bạn chưa có đơn trong lần đặt này.</p>}
    {orders.map(order=>{
      const resolution=resolutions.find(r=>r.orderId===order.id),terminal=['CANCELLED','REFUNDED'].includes(order.paymentState??'');
      return <article className="table-order" key={order.id}>
        {!terminal&&order.status!=='SERVED'&&order.paymentState!=='UNPAID'&&order.paymentState!=='PENDING'&&<WaitTime since={order.queuedAt??order.createdAt}/>}
        <div className="section-heading"><strong>Đơn #{order.id}</strong><span className={`pill ${order.acceptanceState==='WAITING'?'amber':'green'}`}>{order.paymentState==='REFUNDED'?'Đã hoàn giả lập':order.paymentState==='CANCELLED'?(order.acceptanceState==='REJECTED'?'Quán từ chối đơn':'Đã hủy'):order.acceptanceState==='WAITING'?'Chờ tiếp nhận':['UNPAID','PENDING'].includes(order.paymentState??'')?'Đã nhận · Chờ thanh toán':statusName[order.status]}</span></div>
        <ul className="order-items">{order.items.map((item,index)=><li key={index}><span>{item.quantity}× {item.name}{item.note&&<small> · {item.note}</small>}</span><span>{money(item.subtotalVnd)}</span></li>)}</ul>
        {order.note&&<p className="order-note">Ghi chú: {order.note}</p>}
        <OrderTotals order={order}/>
        {!terminal&&order.acceptanceState==='WAITING'&&<p className="order-awaiting-note">Quán đang kiểm tra món của bạn. Khi đơn được tiếp nhận, bạn sẽ nhận thông báo để thanh toán.</p>}
        {!terminal&&order.acceptanceState!=='WAITING'&&['UNPAID','PENDING'].includes(order.paymentState??'')&&<a className="primary guest-pay-link" href="#guest-checkout">Thanh toán đơn #{order.id}</a>}
        {resolution&&<p className="warning">{resolution.state==='REFUNDED'?`Đã hoàn giả lập ${money(resolution.amountVnd)}. `:''}Lý do: {resolution.reason}</p>}
        {!terminal&&<ol className="order-progress" aria-label={`Tiến độ đơn ${order.id}`}>{['Chờ tiếp nhận','Quán đã nhận','Đã thanh toán','Đang pha chế','Sẵn sàng','Đã giao'].map((step,index)=>{const current=order.acceptanceState==='WAITING'?0:['UNPAID','PENDING'].includes(order.paymentState??'')?1:order.status==='SUBMITTED'?2:order.status==='PREPARING'?3:order.status==='READY'?4:5;return <li key={step} className={index<=current?'reached':''} aria-current={index===current?'step':undefined}>{step}</li>;})}</ol>}
      </article>;
    })}
  </section>;
}
