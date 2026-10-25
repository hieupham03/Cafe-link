import { useState } from 'react';
import { Dialog } from './Dialog';
import { money } from './models';
import type { Order } from './models';

export function OrderResolution({order,disabled,run}:{order:Order;disabled:boolean;run:(action:string,data:Record<string,unknown>)=>Promise<unknown>}) {
  const [open,setOpen]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false);
  if(order.status!=='SUBMITTED'||!['UNPAID','PENDING','PAID'].includes(order.paymentState??''))return null;
  const refund=order.paymentState==='PAID';
  return <><button className="secondary" disabled={disabled||busy} onClick={()=>setOpen(true)}>{refund?`Từ chối / hoàn giả lập đơn #${order.id}`:`Hủy đơn chưa trả #${order.id}`}</button>
    {open&&<Dialog label="Xử lý đơn không phục vụ được" onClose={()=>{if(!busy)setOpen(false);}}>
      <h2>{refund?'Từ chối và hoàn giả lập':'Hủy đơn chưa thanh toán'} #{order.id}</h2>
      <p>{refund?`Hoàn giả lập toàn bộ ${money(order.totalVnd)}; không có giao dịch ngân hàng thật.`:'Đơn chưa thanh toán sẽ không được pha chế. Giao dịch thử đang chờ cũng bị hủy.'}</p>
      <p className="muted">Chỉ áp dụng trước khi bắt đầu pha chế. Lịch sử gốc được giữ.</p>
      <form onSubmit={async e=>{e.preventDefault();if(busy||!reason.trim())return;setBusy(true);try{const result=await run('RESOLVE_ORDER',{orderId:order.id,resolution:refund?'REFUND':'CANCEL_UNPAID',reason:reason.trim()});if(result)setOpen(false);}finally{setBusy(false);}}}>
        <label>Lý do xử lý<input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label>
        <div className="button-row"><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Quay lại</button><button className="primary" disabled={disabled||busy||!reason.trim()}>{refund?'Xác nhận hoàn giả lập':'Xác nhận hủy đơn chưa trả'}</button></div>
      </form>
    </Dialog>}
  </>;
}
