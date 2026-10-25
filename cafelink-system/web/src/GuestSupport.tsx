import { useState } from 'react';
import type { Ticket } from './models';
import { GuestSectionHeading } from './GuestSectionHeading';
export function GuestSupport({tickets,disabled,act}:{tickets:Ticket[];disabled:boolean;act:(action:'CALL_SERVICE'|'AMEND_SERVICE'|'CANCEL_SERVICE',data:Record<string,unknown>)=>Promise<unknown>}) {
 const [note,setNote]=useState('');const pending=tickets.find(t=>t.type==='CALL_SERVICE'&&t.status==='OPEN');
 return <section id="guest-support" className="guest-services guest-zone" data-guest-zone="support" aria-label="Hỗ trợ tại bàn">
  <GuestSectionHeading id="guest-support-heading" icon="help" title="Cần nhân viên hỗ trợ?" description="Thêm nước, khăn giấy hoặc nhắn nhu cầu tại bàn." meta={pending?'1 đang chờ':'Gọi nhân viên'} />
  {pending&&<p role="status">Yêu cầu #{pending.id} đang chờ. Bạn có thể bổ sung hoặc rút yêu cầu này.</p>}
  <div className="support-presets" role="group" aria-label="Lời nhắn nhanh">{['Thêm nước lọc','Thêm khăn giấy','Cần hỗ trợ tại bàn'].map(text=><button className="chip" key={text} disabled={disabled} onClick={()=>setNote(text)}>{text}</button>)}</div>
  <label>Lời nhắn cho nhân viên<input value={note} maxLength={pending?160:500} onChange={e=>setNote(e.target.value)} placeholder="Ví dụ: cho mình thêm nước lọc"/></label>
  <button className="secondary" disabled={disabled||!!pending} onClick={async()=>{if(await act('CALL_SERVICE',{note}))setNote('');}}>Gọi nhân viên</button>
  {pending&&<div className="button-row"><button disabled={disabled||!note.trim()} onClick={async()=>{if(await act('AMEND_SERVICE',{ticketId:pending.id,expectedVersion:pending.version??0,note:note.trim()}))setNote('');}}>Bổ sung yêu cầu #{pending.id}</button><button disabled={disabled} onClick={()=>void act('CANCEL_SERVICE',{ticketId:pending.id,expectedVersion:pending.version??0})}>Rút yêu cầu #{pending.id}</button></div>}
  {tickets.filter(t=>t.type==='CALL_SERVICE').slice(0,5).map(ticket=><p key={ticket.id} role="status">Yêu cầu #{ticket.id} · {ticket.status==='OPEN'?'Nhân viên chưa xử lý lời gọi':ticket.status==='CANCELLED'?'Bạn đã rút yêu cầu':'Nhân viên đã phản hồi'}: {ticket.reply||ticket.note||'Cần hỗ trợ tại bàn'}</p>)}
 </section>;
}
